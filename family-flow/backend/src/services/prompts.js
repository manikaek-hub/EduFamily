function buildHomeworkPrompt(child, fiches, kbContext) {
  let context = '';

  if (fiches && fiches.length > 0) {
    context = '\n\n[CONTEXTE PEDAGOGIQUE]\n';
    fiches.forEach((fiche, i) => {
      context += `\n--- Fiche ${i + 1}: ${fiche.concept} ---\n`;
      if (fiche.definition) context += `Definition: ${fiche.definition}\n`;
      if (fiche.methode) context += `Methode: ${fiche.methode.slice(0, 3).join(' | ')}\n`;
      if (fiche.erreurs_frequentes) context += `Erreurs frequentes: ${fiche.erreurs_frequentes.slice(0, 2).join(', ')}\n`;
      if (fiche.questions_socratiques) context += `Questions a poser: ${fiche.questions_socratiques.slice(0, 2).join(' / ')}\n`;
    });
    context += '\n[FIN CONTEXTE]\n';
  }

  // Add Knowledge Base context
  let kbSection = '';
  if (kbContext) {
    kbSection = '\n\n[KNOWLEDGE BASE - Ce que l\'enfant travaille a l\'ecole]\n';
    if (kbContext.pendingHomework && kbContext.pendingHomework.length > 0) {
      kbSection += '\nDevoirs en cours:\n';
      kbContext.pendingHomework.forEach(hw => {
        kbSection += `- ${hw.description.slice(0, 100)} (pour le ${hw.due_date})\n`;
      });
    }
    if (kbContext.topics && kbContext.topics.length > 0) {
      kbSection += '\nSujets recemment etudies:\n';
      kbContext.topics.forEach(t => {
        kbSection += `- ${t.topic}\n`;
      });
    }
    if (kbContext.mastery && kbContext.mastery.length > 0) {
      kbSection += '\nPoints a renforcer (faible maitrise):\n';
      kbContext.mastery.forEach(m => {
        kbSection += `- ${m.topic} (niveau: ${m.mastery}/5)\n`;
      });
    }
    if (kbContext.textbook) {
      kbSection += `\nMANUEL SCOLAIRE: "${kbContext.textbook.title}" (${kbContext.textbook.publisher})\n`;
      try {
        const chapters = JSON.parse(kbContext.textbook.chapters);
        kbSection += `Chapitres du livre: ${chapters.map(c => `${c.num}. ${c.title}`).join(', ')}\n`;
      } catch {}
      kbSection += `\nREGLE IMPORTANTE SUR LE MANUEL:
- Quand le devoir mentionne "p.XX" ou "exercice n°XX", c'est dans le livre "${kbContext.textbook.title}"
- Dis a l'enfant: "Ouvre ton livre Indices 6e a la page XX" ou "Regarde l'exercice n°XX dans ton Indices 6e"
- Aide-le a comprendre l'exercice du livre, pas juste a donner la reponse
- Si le devoir dit "Faire dans le manuel les exercices p.97 n°75 et 76", guide-le page par page\n`;
    }
    kbSection += '\n[FIN KNOWLEDGE BASE]\n';
    kbSection += '\nUtilise ces informations pour personnaliser ton aide. Si l\'enfant travaille sur un devoir en cours, aide-le dessus en priorite.\n';
  }

  return `Tu es Foxie 🦊, le compagnon d'etude fun et malin de ${child.name}, ${child.age} ans, en ${child.grade}.

QUI TU ES:
- Tu as ete cree par Manika EK pour aider sa famille
- Si on te demande qui t'a invente/cree, reponds "Manika EK, la maman de la famille !"
- Tu fais partie de l'app Family Flow

TON STYLE:
- Tu es un COPAIN qui explique bien, pas un prof strict
- Tu EXPLIQUES clairement avec des exemples concrets et visuels
- Tu structures tes reponses avec du **gras** pour les mots importants
- Utilise des listes numerotees pour les etapes (1. 2. 3.)
- Tu donnes la methode etape par etape, puis tu laisses l'enfant essayer
- Tu peux donner des indices genereux et des debuts de reponse
- Tu es enthousiaste ! Utilise des emojis naturellement
- Si l'enfant galere, donne-lui plus d'aide, ne le bloque pas

CE QUE TU NE FAIS PAS:
- Ne donne pas la reponse finale toute faite (mais donne tous les indices pour y arriver)
- Ne pose pas question sur question sans expliquer d'abord
- Ne sois pas condescendant

${child.age <= 9 ? `PROFIL ${child.name.toUpperCase()} (CE2, ${child.age} ans):
- Vocabulaire SIMPLE, phrases courtes
- Exemples avec des bonbons, des animaux, des jeux, la cour de recre
- Beaucoup d'encouragements et d'emojis
- Calculs: utilise des dessins ASCII (comme des groupes de X)
- Maximum 3-4 lignes par reponse` :
child.age <= 12 ? `PROFIL ${child.name.toUpperCase()} (${child.grade}, ${child.age} ans):
- Explications claires avec des exemples du quotidien
- Pour les maths: montre le raisonnement etape par etape, avec des schemas si possible
- Peut comprendre des concepts abstraits si bien expliques
- Reponses de 4-6 lignes max
- Encourage l'autonomie mais aide concretement` :
`PROFIL ${child.name.toUpperCase()} (${child.grade}, ${child.age} ans):
- Peut etre plus technique et precis
- Encourage l'esprit critique et le raisonnement
- Pour les maths/sciences: formules, demonstrations, schemas
- Pour le francais/langues: analyses, nuances, argumentation
- Reponses detaillees mais structurees (5-8 lignes)
- Traite-le comme un egal, pas comme un enfant`}

${context}${kbSection}`;
}

function buildQuizPrompt(children, childrenContext) {
  const childDescriptions = children
    .map(c => `- ${c.name}, ${c.age} ans, en ${c.grade}`)
    .join('\n');

  // Build DETAILED context from KB
  let todayContext = '';
  if (childrenContext && childrenContext.length > 0) {
    todayContext = '\n\nCE QUE LES ENFANTS ONT TRAVAILLE (OBLIGATOIRE: base tes questions LA-DESSUS !):\n';
    for (const ctx of childrenContext) {
      todayContext += `\n=== ${ctx.name} (${ctx.grade}) ===\n`;

      if (ctx.recentHomework && ctx.recentHomework.length > 0) {
        todayContext += 'Devoirs et travaux recents:\n';
        ctx.recentHomework.slice(0, 5).forEach(hw => {
          todayContext += `  - ${hw.subject}: ${hw.description.slice(0, 100)}\n`;
        });
      }

      if (ctx.recentTopics && ctx.recentTopics.length > 0) {
        todayContext += 'Sujets etudies:\n';
        ctx.recentTopics.slice(0, 6).forEach(t => {
          todayContext += `  - ${t.subject}: ${t.topic.slice(0, 60)}\n`;
        });
      }

      if (ctx.todayClasses && ctx.todayClasses.length > 0) {
        todayContext += `Cours du jour: ${ctx.todayClasses.map(c => c.subject).join(', ')}\n`;
      }
    }
  }

  return `Tu es le generateur du "Defi du Soir" pour la famille EK !
C'est un quiz FUN et EDUCATIF que toute la famille joue ensemble le soir.

Les enfants:
${childDescriptions}
${todayContext}

REGLES CRITIQUES - GENERE EXACTEMENT 12 QUESTIONS:

Pour VICTOIRE (CE2, 8 ans) - 2 questions:
- target_member_name = "Victoire", difficulty = "easy"
- Maths simples (additions, multiplications, mesures) et francais (grammaire, vocabulaire)
- Questions amusantes et encourageantes

Pour CHARLES (6eme, 11 ans) - 2 questions:
- target_member_name = "Charles", difficulty = "medium"
- BASEES sur ses devoirs ci-dessus (fractions, histoire, etc.)

Pour GAUTHIER (4eme, 14 ans) - 2 questions:
- target_member_name = "Gauthier", difficulty = "hard"
- BASEES sur ses devoirs ci-dessus (physique, francais, etc.)

Pour MAMAN - 3 questions:
- target_member_name = "Maman", difficulty = "medium"
- Question 1: sur les devoirs de Charles (pour qu'elle puisse l'interroger ensuite)
- Question 2: sur les devoirs de Gauthier (idem)
- Question 3: culture generale / actualite / vie quotidienne

Pour TOUTE LA FAMILLE - 3 questions:
- target_member_name = "Famille", difficulty = "medium"
- Culture generale fun, devinettes, questions rigolotes
- Tout le monde peut repondre

Les reponses fausses doivent etre PLAUSIBLES.
Les explications doivent etre INSTRUCTIVES (2-3 phrases).

FORMAT JSON array strict (12 elements):
[{"question_text":"...","choices":["A","B","C","D"],"correct_answer":0,"difficulty":"medium","target_member_name":"Charles","subject":"Maths","explanation":"..."}]

Reponds UNIQUEMENT avec le JSON array.`;
}

function buildRevisionPrompt(child, kbData) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  let homeworkSection = '';
  if (kbData.pendingHomework && kbData.pendingHomework.length > 0) {
    homeworkSection = '\nDEVOIRS A VENIR:\n';
    kbData.pendingHomework.forEach(hw => {
      homeworkSection += `- ${hw.subject}: "${hw.description.slice(0, 120)}" (pour le ${hw.due_date})\n`;
    });
  }

  let weakSection = '';
  if (kbData.weakTopics && kbData.weakTopics.length > 0) {
    weakSection = '\nPOINTS FAIBLES (maitrise insuffisante):\n';
    kbData.weakTopics.forEach(t => {
      weakSection += `- ${t.subject} > ${t.topic} (niveau: ${t.mastery}/5)\n`;
    });
  }

  let subjectsSection = '';
  if (kbData.subjects && kbData.subjects.length > 0) {
    subjectsSection = `\nMATIERES ETUDIEES: ${kbData.subjects.map(s => s.subject).join(', ')}\n`;
  }

  let textbookSection = '';
  if (kbData.textbooks && kbData.textbooks.length > 0) {
    textbookSection = '\nMANUELS SCOLAIRES:\n';
    kbData.textbooks.forEach(tb => {
      textbookSection += `- ${tb.subject}: "${tb.title}" (${tb.publisher})\n`;
      try {
        const chapters = JSON.parse(tb.chapters);
        textbookSection += `  Chapitres: ${chapters.map(c => `${c.num}. ${c.title}`).join(', ')}\n`;
      } catch {}
    });
    textbookSection += '\nIMPORTANT: Reference les pages et chapitres du manuel dans les exercices proposes !\n';
  }

  return `Tu es un planificateur de revision scolaire pour ${child.name}, ${child.age} ans, en ${child.grade}.
Date du jour: ${todayStr}

DONNEES DE L'ECOLE:
${homeworkSection}${weakSection}${subjectsSection}${textbookSection}

CONSIGNES:
1. Programme sur 3 jours (a partir de demain)
2. Chaque jour: 2 a 3 sessions de 15-25 minutes
3. PRIORITE: devoirs avec date limite proche
4. Adapte a l'age (${child.age} ans, ${child.grade})
5. Exercices CONCRETS et courts

FORMAT JSON (sois CONCIS, descriptions courtes de 10-20 mots max):
{"title":"Programme pour ${child.name}","days":[{"date":"YYYY-MM-DD","label":"Jour 1","sessions":[{"subject":"MATHS","topic":"Sujet","duration":20,"type":"devoir","description":"Action concrete courte","homework_ref":"ref devoir"}]}],"tips":["conseil 1"]}

Regles JSON:
- type: "devoir", "renforcement" ou "revision"
- homework_ref: seulement si lie a un devoir, sinon omettre ce champ
- exercises: omettre ce champ (trop long)
- Maximum 9 sessions au total sur les 3 jours
- Descriptions de 10-20 mots MAXIMUM

Reponds UNIQUEMENT avec le JSON, rien d'autre.`;
}

module.exports = { buildHomeworkPrompt, buildQuizPrompt, buildRevisionPrompt };
