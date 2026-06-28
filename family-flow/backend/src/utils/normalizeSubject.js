/**
 * Normalize subject names to a consistent canonical form.
 * Handles EcoleDirecte's uppercase/abbreviated formats and ensures
 * the same subject always has the same string representation in the DB.
 */

// Canonical mappings: all keys are UPPERCASE, stripped of accents for matching
const SUBJECT_MAP = {
  // Maths
  'MATHEMATIQUES': 'Maths',
  'MATHÉMATIQUES': 'Maths',
  'MATHS': 'Maths',
  'MATH': 'Maths',

  // Français
  'FRANCAIS': 'Français',
  'FRANÇAIS': 'Français',

  // Histoire-Géo
  'HISTOIRE-GEOGRAPHIE': 'Histoire-Géo',
  'HISTOIRE-GÉOGRAPHIE': 'Histoire-Géo',
  'HISTOIRE GEOGRAPHIE': 'Histoire-Géo',
  'HISTOIRE GÉOGRAPHIE': 'Histoire-Géo',
  'HIST-GEO': 'Histoire-Géo',
  'HIST-GÉO': 'Histoire-Géo',
  'HIST. & GEO.': 'Histoire-Géo',
  'HIST. & GÉO.': 'Histoire-Géo',
  'HISTOIRE-GEO': 'Histoire-Géo',
  'HISTOIRE-GÉO': 'Histoire-Géo',
  'HISTOIRE GEO': 'Histoire-Géo',

  // Anglais
  'ANGLAIS': 'Anglais',
  'ANGLAIS LV1': 'Anglais',

  // Espagnol
  'ESPAGNOL': 'Espagnol',
  'ESPAGNOL LV2': 'Espagnol',

  // Physique-Chimie
  'PHYSIQUE-CHIMIE': 'Physique-Chimie',
  'PHYSIQUE CHIMIE': 'Physique-Chimie',

  // SVT
  'SVT': 'SVT',
  'SC. VIE & TERRE': 'SVT',
  'SCIENCES DE LA VIE ET DE LA TERRE': 'SVT',
  'SCIENCES VIE & TERRE': 'SVT',

  // Technologie
  'TECHNOLOGIE': 'Technologie',
  'TECHNO': 'Technologie',

  // Éducation musicale
  'EDUCATION MUSICALE': 'Éducation musicale',
  'ÉDUCATION MUSICALE': 'Éducation musicale',
  'ED. MUSICALE': 'Éducation musicale',
  'ÉD. MUSICALE': 'Éducation musicale',

  // Arts plastiques
  'ARTS PLASTIQUES': 'Arts plastiques',
  'ARTS PLAST.': 'Arts plastiques',

  // EPS
  'EPS': 'EPS',
  'ED.PHYSIQUE & SPORT.': 'EPS',
  'ÉD.PHYSIQUE & SPORT.': 'EPS',
  'EDUCATION PHYSIQUE ET SPORTIVE': 'EPS',
  'ÉDUCATION PHYSIQUE ET SPORTIVE': 'EPS',

  // Allemand
  'ALLEMAND': 'Allemand',
  'ALLEMAND LV2': 'Allemand',

  // Latin
  'LATIN': 'Latin',

  // Sciences (primaire)
  'SCIENCES': 'Sciences',
};

/**
 * Normalize a subject name to its canonical form.
 * @param {string} subject - The raw subject name
 * @returns {string} - The normalized subject name
 */
function normalizeSubject(subject) {
  if (!subject || typeof subject !== 'string') return subject;

  const trimmed = subject.trim();
  if (!trimmed) return trimmed;

  // Try exact match on uppercased input
  const upper = trimmed.toUpperCase();
  if (SUBJECT_MAP[upper]) return SUBJECT_MAP[upper];

  // Try with the original casing preserved in the map keys (for accented keys)
  for (const [key, value] of Object.entries(SUBJECT_MAP)) {
    if (key === upper || key === trimmed.toUpperCase()) {
      return value;
    }
  }

  // If no mapping found, apply title-case as a fallback
  // But preserve known all-caps acronyms
  const ACRONYMS = new Set(['SVT', 'EPS', 'LV1', 'LV2', 'LV3']);

  return trimmed
    .split(/(\s+|-)/  )
    .map((part, index) => {
      // Preserve separators
      if (/^\s+$/.test(part) || part === '-') return part;
      // Keep acronyms uppercase
      if (ACRONYMS.has(part.toUpperCase())) return part.toUpperCase();
      // Title-case: first letter upper, rest lower
      if (part.length === 0) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join('');
}

module.exports = normalizeSubject;
