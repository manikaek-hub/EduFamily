/**
 * Liste OFFICIELLE des matières (programme Éducation Nationale), par cycle.
 * Source unique de vérité utilisée par :
 *   - la page "Mes progrès" (matières évaluées)
 *   - le sélecteur de matière à la capture photo
 * Les noms correspondent aux formes canoniques de normalizeSubject.
 */
const normalizeSubject = require('../utils/normalizeSubject');

const COLLEGE = [
  'Français', 'Maths', 'Histoire-Géo', 'Anglais', 'Espagnol',
  'SVT', 'Physique-Chimie', 'Technologie',
  'EPS', 'Arts plastiques', 'Éducation musicale', 'EMC',
];

const PRIMAIRE = [
  'Français', 'Maths', 'Questionner le monde', 'Anglais',
  'EPS', 'Arts plastiques', 'Éducation musicale', 'EMC',
];

const PRIMAIRE_CM = [
  'Français', 'Maths', 'Histoire-Géo', 'Sciences', 'Anglais',
  'EPS', 'Arts plastiques', 'Éducation musicale', 'EMC',
];

function officialSubjects(grade) {
  const g = (grade || '').toLowerCase();
  if (/(6|5|4|3)\s*[èe]me|coll[èe]ge/.test(g)) return COLLEGE;
  if (/cm1|cm2/.test(g)) return PRIMAIRE_CM;
  return PRIMAIRE; // CP, CE1, CE2 (défaut primaire)
}

// Rattache n'importe quel libellé de matière à UNE matière officielle (ou null).
const ALIASES = {
  'Histoire': 'Histoire-Géo',
  'Geographie': 'Histoire-Géo',
  'Géographie': 'Histoire-Géo',
  'Emc': 'EMC',
  'Ens. Moral & Civique': 'EMC',
  'Education Civique': 'EMC',
  'Education Musical': 'Éducation musicale',
  'Musique': 'Éducation musicale',
  'Arts': 'Arts plastiques',
  'Sport': 'EPS',
};

function toOfficial(rawSubject, list) {
  if (!rawSubject) return null;
  const canon = normalizeSubject(rawSubject);
  if (list.includes(canon)) return canon;
  const aliased = ALIASES[canon];
  if (aliased && list.includes(aliased)) return aliased;
  return null;
}

module.exports = { officialSubjects, toOfficial, COLLEGE, PRIMAIRE, PRIMAIRE_CM };
