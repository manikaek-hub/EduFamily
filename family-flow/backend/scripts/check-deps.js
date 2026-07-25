/**
 * Garde-fou déploiement — vérifie qu'aucun fichier REQUIS par le code versionné
 * n'est absent de git (cause des crashs Railway "Cannot find module ...").
 *
 * Lancé automatiquement avant chaque `git push` (hook pre-push).
 *   cd family-flow/backend && node scripts/check-deps.js
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const tracked = new Set(
  execSync('git ls-files src', { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean)
);

const problems = [];

for (const file of tracked) {
  if (!file.endsWith('.js')) continue;
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) continue; // supprimé localement, géré par git
  const src = fs.readFileSync(full, 'utf8');
  const re = /require\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const target = m[1];
    const base = path.resolve(path.dirname(full), target);
    const candidates = [base + '.js', path.join(base, 'index.js'), base + '.json', base];
    const resolved = candidates.find(c => fs.existsSync(c) && fs.statSync(c).isFile());
    if (!resolved) continue; // introuvable même sur disque → autre problème, pas le nôtre
    const rel = path.relative(ROOT, resolved).replace(/\\/g, '/');
    if (rel.startsWith('src/') && !tracked.has(rel)) {
      problems.push(`${file} → require('${target}') → ${rel} EXISTE sur le disque mais N'EST PAS versionné`);
    }
  }
}

if (problems.length) {
  console.error('\n❌ DÉPLOIEMENT BLOQUÉ — fichiers requis mais non versionnés (crash Railway garanti) :\n');
  problems.forEach(p => console.error('  • ' + p));
  console.error('\n→ Corrige avec : git add <fichier> puis recommence le push.\n');
  process.exit(1);
}
console.log('✅ check-deps : tous les modules requis sont versionnés.');
