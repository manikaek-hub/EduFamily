require('dotenv').config({ override: true });
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ─── Seed minimal de la famille si la base est vide (1er démarrage en ligne) ───
// Crée les membres de la famille sur une base neuve, sans données de démo.
const db = require('./db/init');
try {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM members').get();
  if (n === 0) {
    const members = [
      { name: 'Victoire', role: 'child', grade: 'CE1', age: 7, avatar_color: '#E8A0BF' },
      { name: 'Charles', role: 'child', grade: '6eme', age: 11, avatar_color: '#4A90D9' },
      { name: 'Gauthier', role: 'child', grade: '4eme', age: 14, avatar_color: '#7C9082' },
      { name: 'Manika', role: 'parent', grade: null, age: null, avatar_color: '#C4A484' },
    ];
    const ins = db.prepare('INSERT INTO members (name, role, grade, age, avatar_color) VALUES (?, ?, ?, ?, ?)');
    for (const m of members) ins.run(m.name, m.role, m.grade, m.age, m.avatar_color);
    console.log('[Seed] Famille créée (base neuve).');
  }
} catch (e) {
  console.error('[Seed] Erreur seed initial:', e?.message || e);
}

// ─── Global error protection ───
process.on('unhandledRejection', (err) => {
  console.error('[CRASH PREVENTED] Unhandled rejection:', err?.message || err);
});
process.on('uncaughtException', (err) => {
  console.error('[CRASH PREVENTED] Uncaught exception:', err?.message || err);
  // Don't exit — keep the server alive for the family
});

// Training data collector middleware (Agent 1)
const { preCollector, postCollector } = require('./middleware/trainingCollector');

// ─── Authentification par code d'accès familial ───
// Route publique (login/status) puis protection de toutes les autres routes /api.
const { requireAuth } = require('./middleware/auth');
app.use('/api/auth', require('./routes/auth'));
app.use('/api', requireAuth);

// Routes
app.use('/api/family', require('./routes/family'));
app.use('/api/homework', preCollector, postCollector, require('./routes/homework'));
app.use('/api/activities', require('./routes/calendar'));
app.use('/api/posts', require('./routes/newsboard'));
app.use('/api/quiz', require('./routes/quiz'));
app.use('/api/ecoledirecte', require('./routes/ecoledirecte'));
app.use('/api/kb', require('./routes/knowledgebase'));
app.use('/api/revision', require('./routes/revision'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/xp', require('./routes/xp'));
app.use('/api/routine', require('./routes/routine'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/parent', require('./routes/parent'));
app.use('/api/avatar', require('./routes/avatar'));
app.use('/api/feedback', require('./routes/feedback'));
app.use('/api/elevenlabs', require('./routes/elevenlabs'));
app.use('/api/photos', require('./routes/photos'));
app.use('/api/fiches', require('./routes/fiches'));
app.use('/api/discoveries', require('./routes/discoveries'));
app.use('/api/dictation', require('./routes/dictation'));
app.use('/api/llm', require('./routes/llm'));
app.use('/api/progress', require('./routes/progress'));

// Agent d'amélioration continue — endpoint d'analyse
const { runAnalysis, getTrends } = require('./agents/improvementAgent');
app.post('/api/feedback/analyze', async (req, res) => {
  try {
    const result = await runAnalysis();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get('/api/feedback/trends', (req, res) => {
  try {
    res.json(getTrends());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Agent de sync EcoleDirecte automatique
const { startSyncAgent, runSync } = require('./agents/syncAgent');
app.post('/api/sync/run', async (req, res) => {
  try {
    const result = await runSync();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Agent de nettoyage automatique
const { startCleanupAgent, runCleanup, runMvpDataReset, getDbStats } = require('./agents/cleanupAgent');
app.post('/api/cleanup/run', (req, res) => {
  try {
    const report = runCleanup();
    res.json({ success: true, report });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get('/api/cleanup/stats', (req, res) => {
  try {
    const stats = getDbStats();
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/cleanup/reset-mvp-data', (req, res) => {
  try {
    const report = runMvpDataReset();
    res.json({ success: true, report });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'Family Flow', uptime: Math.floor(process.uptime()) });
});

// ─── Serve React frontend in production ───
// On cherche le build dans l'ordre : variable d'env, submodule (dev local),
// puis backend/public (build embarqué pour l'hébergement en ligne).
const buildCandidates = [
  process.env.FRONTEND_BUILD,
  path.join(__dirname, '..', '..', 'frontend', 'build'),
  path.join(__dirname, '..', 'public'),
].filter(Boolean);
const frontendBuild =
  buildCandidates.find(p => { try { return fs.existsSync(path.join(p, 'index.html')); } catch { return false; } }) ||
  buildCandidates[buildCandidates.length - 1];
app.use(express.static(frontendBuild, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html') || filePath.endsWith('asset-manifest.json')) {
      res.setHeader('Cache-Control', 'no-store, max-age=0');
    }
  },
}));

// All non-API routes → React app (SPA client-side routing)
app.get('*', (req, res) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.sendFile(path.join(frontendBuild, 'index.html'));
});

// ─── Global Express error handler (prevents crash on route errors) ───
app.use((err, req, res, _next) => {
  console.error('[Route Error]', req.method, req.path, err?.message || err);
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

const PORT = process.env.PORT || 3002;
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`\nFamily Flow running on http://${HOST}:${PORT}\n`);
  // Start agents
  startSyncAgent();
  startCleanupAgent();
  // Show local network URL for mobile access
  try {
    const os = require('os');
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          console.log(`  📱 Mobile/Tablette: http://${net.address}:${PORT}`);
        }
      }
    }
  } catch {}
  console.log('');
});
