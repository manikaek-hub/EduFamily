const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', '..', 'data', 'edufamily_curriculum.json');

let curriculumData = null;

function loadCurriculum() {
  if (!curriculumData) {
    const raw = fs.readFileSync(DATA_PATH, 'utf-8');
    curriculumData = JSON.parse(raw);
  }
  return curriculumData;
}

function getAllFiches(niveau, matiere) {
  const data = loadCurriculum();
  const levelData = data.curriculum[niveau];
  if (!levelData) return [];

  if (matiere && levelData[matiere]) {
    return levelData[matiere];
  }

  // Return all subjects for this level
  const fiches = [];
  for (const subject of Object.keys(levelData)) {
    if (subject === 'level_info') continue;
    if (Array.isArray(levelData[subject])) {
      fiches.push(...levelData[subject]);
    }
  }
  return fiches;
}

function searchCurriculum(query, niveau, matiere) {
  const fiches = getAllFiches(niveau, matiere);
  if (fiches.length === 0) return [];

  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  const scored = fiches.map(fiche => {
    let score = 0;
    const searchableText = [
      fiche.concept || '',
      fiche.chapitre || '',
      ...(fiche.mots_cles || []),
      fiche.definition || '',
    ].join(' ').toLowerCase();

    for (const word of queryWords) {
      if (searchableText.includes(word)) {
        score++;
        // Bonus for exact keyword match
        if ((fiche.mots_cles || []).some(k => k.toLowerCase().includes(word))) {
          score += 2;
        }
      }
    }
    return { fiche, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(s => s.fiche);
}

function detectSubject(message) {
  const lower = message.toLowerCase();
  if (/math|calcul|equation|fraction|nombre|addition|soustraction|multipli|divis|geometr/.test(lower)) {
    return 'maths';
  }
  if (/fran[cç]ais|conjugaison|verbe|grammaire|orthograph|dict[ée]e|vocabulaire|lecture/.test(lower)) {
    return 'francais';
  }
  return null;
}

module.exports = { searchCurriculum, detectSubject, getAllFiches };
