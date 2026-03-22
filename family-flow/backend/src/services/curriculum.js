const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', '..', 'data', 'familyflow_curriculum.json');

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

function searchCurriculum(query, niveau, matiere, maxResults = 3) {
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
      ...(fiche.methode || []),
    ].join(' ').toLowerCase();

    for (const word of queryWords) {
      if (searchableText.includes(word)) {
        score++;
        // Bonus for exact keyword match
        if ((fiche.mots_cles || []).some(k => k.toLowerCase().includes(word))) {
          score += 2;
        }
        // Bonus for concept match
        if ((fiche.concept || '').toLowerCase().includes(word)) {
          score += 3;
        }
        // Bonus for chapter match
        if ((fiche.chapitre || '').toLowerCase().includes(word)) {
          score += 1;
        }
      }
    }
    return { fiche, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(s => s.fiche);
}

/**
 * Détecte le niveau scolaire à partir d'un message ou d'un identifiant de classe
 */
function detectLevel(message) {
  const lower = message.toLowerCase();
  const levelMap = {
    'cp': 'CP', 'ce1': 'CE1', 'ce2': 'CE2',
    'cm1': 'CM1', 'cm2': 'CM2',
    '6[eè]me': '6ème', '6e': '6ème', 'sixi[eè]me': '6ème',
    '5[eè]me': '5ème', '5e': '5ème', 'cinqui[eè]me': '5ème',
    '4[eè]me': '4ème', '4e': '4ème', 'quatri[eè]me': '4ème',
    '3[eè]me': '3ème', '3e': '3ème', 'troisi[eè]me': '3ème',
  };
  for (const [pattern, level] of Object.entries(levelMap)) {
    if (new RegExp(`\\b${pattern}\\b`, 'i').test(lower)) {
      return level;
    }
  }
  return null;
}

/**
 * Retourne les métadonnées disponibles sur un niveau
 */
function getLevelInfo(niveau) {
  const data = loadCurriculum();
  const levelData = data.curriculum[niveau];
  if (!levelData) return null;
  return {
    ...levelData.level_info,
    subjects: Object.keys(levelData).filter(k => k !== 'level_info'),
    ficheCount: Object.entries(levelData)
      .filter(([k]) => k !== 'level_info')
      .reduce((sum, [, v]) => sum + (Array.isArray(v) ? v.length : 0), 0)
  };
}

function detectSubject(message) {
  const lower = message.toLowerCase();
  // Sciences AVANT maths car certains mots comme "calcul" pourraient fausser la détection
  if (/science|physique|chimie|svt|biolog|cellul|[ée]lectricit|digestion|vivant|g[ée]n[ée]tiq|m[ée]lange|circuit|mol[ée]cul|atome|r[ée]action\s*chim/.test(lower)) {
    return 'sciences';
  }
  if (/math|calcul|[ée]quation|fraction|nombre|addition|soustraction|multipli|divis|g[ée]om[ée]tr|pythagore|thal[eè]s|trigo|fonction\s*(lin|aff)|puissance|probabilit/.test(lower)) {
    return 'maths';
  }
  if (/fran[cç]ais|conjugaison|verbe|grammaire|orthograph|dict[ée]e|vocabulaire|lecture|litt[ée]rature|r[ée]daction|po[ée]sie|r[ée]cit|autobiograph|argument/.test(lower)) {
    return 'francais';
  }
  if (/histoir|r[ée]volution|guerre|moyen.?[aâ]ge|antiquit|pr[ée]histoir|r[ée]publique|empire|lumi[eè]re|f[ée]odal|napoleon|clovis|charlemagne/.test(lower)) {
    return 'histoire';
  }
  if (/g[ée]ograph|m[ée]tropol|urbani|mondiali|d[ée]mograph|territoire|continent|carte|climat|d[ée]velopp.*durable/.test(lower)) {
    return 'geographie';
  }
  // Mots plus ambigus pour sciences (énergie, matière, évolution) vérifiés en second passage
  if (/[ée]nergie|mati[eè]re.*[ée]tat|[ée]volution.*esp[eè]ce/.test(lower)) {
    return 'sciences';
  }
  if (/questionner.*monde|jours.*semaine|saison|[êe]tre.*vivant|[ée]tat.*eau/.test(lower)) {
    return 'questionner_le_monde';
  }
  if (/emc|moral.*civiq|citoyen|r[ée]publiq.*valeur|discriminat|harc[eè]lement|justice|d[ée]fense|la[ïi]cit|droit.*devoir/.test(lower)) {
    return 'emc';
  }
  if (/anglais|english|langue.*vivante|espagnol|allemand|spanish|german/.test(lower)) {
    return 'langues_vivantes';
  }
  return null;
}

module.exports = { searchCurriculum, detectSubject, detectLevel, getAllFiches, getLevelInfo };
