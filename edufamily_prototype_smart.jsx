import React, { useState, useRef, useEffect } from 'react';

// =============================================================================
// EduFamily - Prototype avec IA Conversationnelle Intelligente
// Foxie : Tuteur socratique qui s'adapte au contexte
// =============================================================================

export default function EduFamilyPrototype() {
  const [currentView, setCurrentView] = useState('home');
  const [selectedChild, setSelectedChild] = useState(null);
  const [chatState, setChatState] = useState(null);

  const familyData = {
    name: 'Famille Ek',
    children: [
      { id: 1, name: 'Gauthier', level: '4ème', age: 14, emoji: '👦', streak: 12 },
      { id: 2, name: 'Charles', level: '6ème', age: 11, emoji: '👦', streak: 8 },
      { id: 3, name: 'Victoire', level: 'CE2', age: 8, emoji: '👧', streak: 15 },
    ],
  };

  const startChat = (child) => {
    setSelectedChild(child);
    setChatState(createInitialChatState(child));
    setCurrentView('chat');
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-md mx-auto bg-white min-h-screen shadow-2xl relative overflow-hidden">
        {currentView === 'home' && (
          <HomeView family={familyData} onSelectChild={startChat} />
        )}
        {currentView === 'chat' && selectedChild && chatState && (
          <ChatView 
            child={selectedChild}
            chatState={chatState}
            setChatState={setChatState}
            onBack={() => setCurrentView('home')}
          />
        )}
      </div>
    </div>
  );
}

// =============================================================================
// MOTEUR DE CONVERSATION INTELLIGENT
// =============================================================================

function createInitialChatState(child) {
  return {
    messages: [
      {
        id: 1,
        from: 'foxie',
        text: getGreeting(child),
        timestamp: new Date(),
      },
    ],
    context: {
      child: child,
      currentSubject: null,
      currentProblem: null,
      problemDetails: null,
      conversationPhase: 'greeting', // greeting, identifying, exploring, guiding, solving, celebrating
      hintsGiven: 0,
      maxHints: 3,
      studentAttempts: [],
      emotionalState: 'neutral', // neutral, frustrated, confused, engaged, proud
      lastTopics: [],
    },
  };
}

function getGreeting(child) {
  const greetings = {
    'CE2': [
      `Coucou ${child.name} ! 🦊 C'est Foxie ! Tu viens faire tes devoirs ? Dis-moi sur quoi tu travailles aujourd'hui !`,
      `Salut ${child.name} ! 🦊 Super de te voir ! Qu'est-ce qu'on apprend ensemble aujourd'hui ?`,
    ],
    '6ème': [
      `Hey ${child.name} ! 🦊 Prêt(e) à bosser ? Qu'est-ce que tu as comme devoirs ?`,
      `Salut ${child.name} ! 🦊 Alors, c'est quoi le programme aujourd'hui ?`,
    ],
    '4ème': [
      `Salut ${child.name} ! 🦊 Sur quoi tu galères aujourd'hui ?`,
      `Hey ! 🦊 Qu'est-ce qu'on attaque ? Maths, français, autre chose ?`,
    ],
  };
  
  const levelGreetings = greetings[child.level] || greetings['6ème'];
  return levelGreetings[Math.floor(Math.random() * levelGreetings.length)];
}

// Analyseur de message intelligent
function analyzeMessage(message, context) {
  const lowerMsg = message.toLowerCase().trim();
  
  const analysis = {
    // Détection du sujet
    subject: detectSubject(lowerMsg),
    // Détection du type de problème
    problemType: detectProblemType(lowerMsg),
    // Extraction des éléments mathématiques
    mathElements: extractMathElements(message),
    // Détection de l'état émotionnel
    emotion: detectEmotion(lowerMsg),
    // Détection d'une tentative de réponse
    isAttempt: detectAttempt(lowerMsg, context),
    // Détection d'une demande d'aide
    needsHelp: detectHelpRequest(lowerMsg),
    // Détection si c'est une question
    isQuestion: lowerMsg.includes('?') || lowerMsg.startsWith('comment') || lowerMsg.startsWith('pourquoi') || lowerMsg.startsWith('qu\'est'),
    // Contenu brut pour référence
    raw: message,
  };
  
  return analysis;
}

function detectSubject(msg) {
  const subjects = {
    maths: /math|calcul|équation|nombre|addition|soustr|multipli|divis|fraction|géométrie|triangle|carré|cercle|pourcentage|problème/,
    francais: /français|orthographe|grammaire|conjugaison|verbe|sujet|complément|texte|rédaction|dictée|accord|pluriel/,
    histoire: /histoire|guerre|roi|révolution|napoléon|moyen.?âge|préhistoire|antiquité|date/,
    geo: /géographie|pays|capitale|continent|montagne|fleuve|océan|carte/,
    sciences: /science|expérience|corps|humain|plante|animal|énergie|électricité|planète/,
    anglais: /anglais|english|traduction|traduire|vocabulary|verb/,
  };
  
  for (const [subject, pattern] of Object.entries(subjects)) {
    if (pattern.test(msg)) return subject;
  }
  return null;
}

function detectProblemType(msg) {
  const types = {
    equation: /équation|résoudre|trouver x|valeur de x|inconnue/,
    calculation: /calculer|combien font|résultat|opération/,
    wordProblem: /problème|marie|pierre|train|voiture|achète|vend|partage|distribue/,
    geometry: /aire|périmètre|surface|angle|triangle|rectangle|cercle/,
    fraction: /fraction|numérateur|dénominateur|simplifier/,
    conjugation: /conjuguer|conjugaison|temps|présent|passé|futur|imparfait/,
    grammar: /accorder|accord|pluriel|féminin|masculin|sujet|verbe/,
    spelling: /orthographe|écrire|comment ça s'écrit/,
    comprehension: /comprendre|expliquer|signifie|veut dire/,
  };
  
  for (const [type, pattern] of Object.entries(types)) {
    if (pattern.test(msg)) return type;
  }
  return null;
}

function extractMathElements(msg) {
  const elements = {
    numbers: msg.match(/\d+([.,]\d+)?/g) || [],
    operators: msg.match(/[+\-×÷*/=]/g) || [],
    variables: msg.match(/\b[xyz]\b/gi) || [],
    equation: msg.match(/\d+[xyz]?\s*[+\-*/]\s*\d+\s*=\s*\d+/i)?.[0] || null,
  };
  return elements;
}

function detectEmotion(msg) {
  if (/comprends pas|comprends rien|c'est nul|j'y arrive pas|impossible|trop dur|je déteste|ras le bol|énervé|frustré/.test(msg)) {
    return 'frustrated';
  }
  if (/confus|perdu|sais pas|aucune idée|quoi\?|hein\?|comment ça/.test(msg)) {
    return 'confused';
  }
  if (/j'ai trouvé|je pense que|essayé|voilà|c'est ça\?|c'est bon\?/.test(msg)) {
    return 'engaged';
  }
  if (/facile|trop bien|génial|j'adore|super|merci/.test(msg)) {
    return 'proud';
  }
  return 'neutral';
}

function detectAttempt(msg, context) {
  // Si on est en phase de résolution et que le message contient des nombres ou "je pense"
  if (context.conversationPhase === 'guiding' || context.conversationPhase === 'solving') {
    if (/\d+|je pense|je crois|c'est|ça fait|résultat|réponse/.test(msg)) {
      return true;
    }
  }
  return false;
}

function detectHelpRequest(msg) {
  return /aide|help|indice|explique|comprends pas|comment faire|par où commencer|bloqué/.test(msg);
}

// =============================================================================
// GÉNÉRATEUR DE RÉPONSES INTELLIGENT
// =============================================================================

function generateResponse(userMessage, chatState) {
  const { context } = chatState;
  const analysis = analyzeMessage(userMessage, context);
  
  // Mise à jour du contexte
  const newContext = { ...context };
  
  // Mise à jour de l'état émotionnel
  if (analysis.emotion !== 'neutral') {
    newContext.emotionalState = analysis.emotion;
  }
  
  // Mise à jour du sujet si détecté
  if (analysis.subject && !newContext.currentSubject) {
    newContext.currentSubject = analysis.subject;
  }
  
  // Mise à jour du type de problème
  if (analysis.problemType) {
    newContext.currentProblem = analysis.problemType;
  }
  
  // Stocker les éléments mathématiques si présents
  if (analysis.mathElements.equation || analysis.mathElements.numbers.length > 0) {
    newContext.problemDetails = {
      ...newContext.problemDetails,
      ...analysis.mathElements,
      rawProblem: userMessage,
    };
  }
  
  // Générer la réponse selon la phase et le contexte
  let response;
  
  // Priorité 1: Gérer l'état émotionnel
  if (analysis.emotion === 'frustrated') {
    response = handleFrustration(newContext);
    newContext.hintsGiven = Math.max(0, newContext.hintsGiven - 1); // Reset un peu les indices
  }
  // Priorité 2: Répondre à une demande d'aide explicite
  else if (analysis.needsHelp) {
    response = provideHint(newContext);
    newContext.hintsGiven++;
  }
  // Priorité 3: Évaluer une tentative de réponse
  else if (analysis.isAttempt) {
    response = evaluateAttempt(userMessage, newContext);
    newContext.studentAttempts.push(userMessage);
  }
  // Priorité 4: Progression normale de la conversation
  else {
    response = progressConversation(userMessage, analysis, newContext);
  }
  
  return { response, newContext };
}

function handleFrustration(context) {
  const { child } = context;
  
  const responses = {
    'CE2': [
      `Hey, respire un grand coup ! 🤗 C'est normal de trouver ça difficile parfois. On va y aller tout doucement ensemble, d'accord ? Dis-moi juste ce qui te bloque.`,
      `Oh là là, je vois que c'est dur ! 🤗 Tu sais quoi ? Les meilleurs apprenants sont ceux qui trouvent ça difficile au début. Raconte-moi le problème avec TES mots.`,
    ],
    '6ème': [
      `Je comprends, c'est frustrant ! 😤➡️😊 Mais tu sais quoi ? Si c'était facile, tu n'apprendrais rien. Pose-moi une question précise sur ce qui te bloque.`,
      `OK, on fait une pause de 2 secondes... 😮‍💨 Voilà ! Maintenant, dis-moi : c'est QUOI exactement qui coince ?`,
    ],
    '4ème': [
      `Je sens la frustration ! 😤 C'est OK, on a tous des moments comme ça. Dis-moi précisément où ça coince, on va décortiquer ça ensemble.`,
      `Relax ! 😎 La difficulté, c'est juste ton cerveau qui grandit. Qu'est-ce qui te pose problème exactement ?`,
    ],
  };
  
  const levelResponses = responses[child.level] || responses['6ème'];
  return levelResponses[Math.floor(Math.random() * levelResponses.length)];
}

function provideHint(context) {
  const { child, currentProblem, problemDetails, hintsGiven } = context;
  
  // Indices progressifs selon le type de problème
  const hints = {
    equation: {
      'CE2': [
        `Premier indice : Dans une équation, on cherche le nombre mystère ! 🔍 Si tu as "? + 3 = 7", demande-toi : quel nombre plus 3 donne 7 ?`,
        `Deuxième indice : Tu peux "défaire" l'opération ! Si on a ajouté 3, tu peux enlever 3 des deux côtés. Essaie !`,
        `Dernier indice : 7 - 3 = ? C'est ça ta réponse ! Tu vois le lien ?`,
      ],
      '6ème': [
        `Indice 1 : Pour isoler x, il faut "faire passer" les nombres de l'autre côté. Quand un nombre passe, son signe change ! (+) devient (-) et vice versa.`,
        `Indice 2 : Commence par les additions/soustractions, puis occupe-toi des multiplications/divisions. Qu'est-ce que tu dois faire passer en premier ?`,
        `Indice 3 : Tu y es presque ! Une fois x isolé d'un côté, fais l'opération de l'autre côté. C'est quoi le calcul ?`,
      ],
      '4ème': [
        `Hint : Isole les termes en x d'un côté, les constantes de l'autre. N'oublie pas de faire la même opération des deux côtés !`,
        `Développe d'abord si nécessaire, puis regroupe les termes semblables. Montre-moi ce que ça donne.`,
        `Tu dois avoir quelque chose comme ax = b. Divise par a. C'est quoi ton a et ton b ?`,
      ],
    },
    wordProblem: {
      'CE2': [
        `Indice 1 : Lis le problème doucement et trouve les NOMBRES. Combien y en a-t-il ? Qu'est-ce qu'ils représentent ?`,
        `Indice 2 : Maintenant, cherche le mot magique ! Est-ce qu'on dit "en tout", "de plus", "reste" ou "partage" ? Ça te dit quelle opération faire !`,
        `Indice 3 : "En tout" ou "de plus" = addition ➕. "Reste" ou "de moins" = soustraction ➖. "Partage" = division ➗. C'est quoi ici ?`,
      ],
      '6ème': [
        `Indice : Identifie d'abord ce qu'on te demande de trouver. Ensuite, quelles informations as-tu ? Liste-les !`,
        `Essaie de poser une équation : "ce qu'on cherche" = "calcul avec les données". Qu'est-ce que tu obtiens ?`,
        `Vérifie que ta réponse a du SENS ! Si on parle de pommes, tu ne peux pas avoir -3 pommes. Ton résultat est-il logique ?`,
      ],
      '4ème': [
        `Modélise le problème : définis ton inconnue (x = ?), puis traduis l'énoncé en équation.`,
        `Quelles sont les relations entre les grandeurs ? Écris-les sous forme mathématique.`,
        `Résous puis INTERPRÈTE. La question demande quoi exactement ? Ta réponse y répond-elle ?`,
      ],
    },
    conjugation: {
      'CE2': [
        `Indice 1 : D'abord, trouve le SUJET du verbe. Qui fait l'action ? C'est "je", "tu", "il/elle", "nous", "vous" ou "ils/elles" ?`,
        `Indice 2 : Maintenant, c'est quel temps ? Ça se passe maintenant (présent), avant (passé) ou plus tard (futur) ?`,
        `Indice 3 : Avec le sujet et le temps, tu peux trouver la terminaison ! Pour le présent avec "je", c'est souvent -e ou -s. Essaie !`,
      ],
      '6ème': [
        `Identifie : 1) le verbe à l'infinitif, 2) le groupe (1er, 2e ou 3e), 3) le temps demandé, 4) la personne.`,
        `Pour ce temps, quelle est la règle de conjugaison ? Pense au radical + terminaison.`,
        `Attention aux verbes irréguliers ! Celui-ci en est un ? Si oui, il faut l'apprendre par cœur...`,
      ],
      '4ème': [
        `Quel est le mode et le temps ? Indicatif, subjonctif, conditionnel ? Présent, imparfait, passé simple ?`,
        `Rappelle-toi la formation : pour le passé simple par exemple, 1er groupe = -ai, -as, -a, -âmes, -âtes, -èrent`,
        `Vérifie l'accord avec le sujet et les éventuelles exceptions.`,
      ],
    },
    default: {
      'CE2': [
        `Qu'est-ce que tu as déjà compris du problème ? Explique-moi avec tes mots ! 😊`,
        `Si tu devais expliquer ce problème à un copain, tu dirais quoi ?`,
        `Commençons par le début : c'est quoi la première chose qu'on te demande ?`,
      ],
      '6ème': [
        `Décomposons : quelles sont les étapes pour résoudre ça selon toi ?`,
        `Qu'est-ce que tu sais déjà sur ce type d'exercice ? Une règle, une méthode ?`,
        `Essaie quelque chose, même si tu n'es pas sûr(e). On corrigera ensemble !`,
      ],
      '4ème': [
        `Quelle méthode as-tu vue en cours pour ce type de problème ?`,
        `Fais une hypothèse et teste-la. Qu'est-ce que ça donne ?`,
        `Si tu bloques sur une étape précise, dis-moi laquelle.`,
      ],
    },
  };
  
  const problemHints = hints[currentProblem] || hints.default;
  const levelHints = problemHints[child.level] || problemHints['6ème'];
  const hintIndex = Math.min(hintsGiven, levelHints.length - 1);
  
  return levelHints[hintIndex];
}

function evaluateAttempt(attempt, context) {
  const { child, problemDetails, studentAttempts } = context;
  
  // Simulation d'évaluation (en prod, ce serait une vraie analyse)
  // Pour la démo, on encourage toujours et on guide
  
  const attemptsCount = studentAttempts.length;
  
  if (attemptsCount === 0) {
    // Première tentative - encourager
    const responses = {
      'CE2': [
        `Tu as essayé, c'est super ! 🌟 Explique-moi comment tu as trouvé ça ? Je veux comprendre ton raisonnement !`,
        `Oh, tu as réfléchi ! 💪 Dis-moi, comment tu as fait pour arriver à cette réponse ?`,
      ],
      '6ème': [
        `OK, je vois ta réponse ! Montre-moi ton raisonnement : quelles étapes as-tu suivies ?`,
        `Intéressant ! Peux-tu me détailler comment tu es arrivé(e) à ça ?`,
      ],
      '4ème': [
        `Je note ta proposition. Développe ton raisonnement pour qu'on vérifie ensemble.`,
        `OK. Prouve-moi que c'est juste : quelles sont tes étapes de calcul ?`,
      ],
    };
    const r = responses[child.level] || responses['6ème'];
    return r[Math.floor(Math.random() * r.length)];
  } else {
    // Tentatives suivantes
    const responses = {
      'CE2': [
        `Tu persévères, j'adore ça ! 💪 Est-ce que tu as vérifié en "remontant" le calcul ? Genre si tu as trouvé 5, est-ce que 5 marche dans le problème de départ ?`,
        `Bel effort ! 🌟 Relis l'énoncé une fois de plus. Est-ce que tu as utilisé TOUS les nombres donnés ?`,
      ],
      '6ème': [
        `Bonne persévérance ! As-tu vérifié ton résultat en le replaçant dans l'équation de départ ?`,
        `Hmm, reprends ton calcul étape par étape. Où est-ce que ça pourrait coincer ?`,
      ],
      '4ème': [
        `Vérifie en substituant ta valeur dans l'équation initiale. Ça donne quoi ?`,
        `Reprends depuis le début et écris CHAQUE étape. Souvent l'erreur se cache dans une simplification.`,
      ],
    };
    const r = responses[child.level] || responses['6ème'];
    return r[Math.floor(Math.random() * r.length)];
  }
}

function progressConversation(message, analysis, context) {
  const { child, conversationPhase, currentSubject, currentProblem } = context;
  
  // Si on détecte un nouveau sujet/problème
  if (analysis.subject && !currentSubject) {
    context.conversationPhase = 'identifying';
    return acknowledgeSubject(analysis.subject, child);
  }
  
  // Si on a des détails sur le problème
  if (analysis.mathElements.equation || analysis.problemType) {
    context.conversationPhase = 'exploring';
    return exploreProble(message, analysis, child);
  }
  
  // Si c'est une question de compréhension
  if (analysis.isQuestion) {
    return handleQuestion(message, analysis, child);
  }
  
  // Réponse par défaut contextuelle
  return getContextualResponse(message, context);
}

function acknowledgeSubject(subject, child) {
  const responses = {
    maths: {
      'CE2': `Ah, les maths ! 🧮 J'adore ! C'est quoi comme exercice ? Un calcul, un problème avec une histoire, de la géométrie ?`,
      '6ème': `Les maths, cool ! 🧮 C'est du calcul, de l'algèbre, de la géométrie ? Montre-moi l'énoncé !`,
      '4ème': `Maths ! 🧮 Équations ? Géométrie ? Fonctions ? Balance l'énoncé qu'on voie ça.`,
    },
    francais: {
      'CE2': `Le français ! 📖 Super ! C'est de la lecture, de l'écriture, des verbes à conjuguer ?`,
      '6ème': `Français ! 📖 Grammaire, conjugaison, rédaction ou analyse de texte ?`,
      '4ème': `Français 📖 - Qu'est-ce que tu dois faire ? Analyse, dissertation, grammaire ?`,
    },
    histoire: {
      'CE2': `L'histoire ! 🏛️ J'adore les histoires du passé ! C'est sur quelle période ?`,
      '6ème': `Histoire ! 🏛️ Quelle époque tu étudies ? Antiquité, Moyen-Âge, époque moderne ?`,
      '4ème': `Histoire 🏛️ - Quelle période ou quel thème ? Dis-moi ce que tu dois apprendre.`,
    },
    sciences: {
      'CE2': `Les sciences ! 🔬 Trop bien ! C'est sur les animaux, les plantes, le corps humain ?`,
      '6ème': `Sciences ! 🔬 SVT ou physique-chimie ? C'est quoi le sujet ?`,
      '4ème': `Sciences 🔬 - Expérience, cours à comprendre ou exercices ? Détaille !`,
    },
    anglais: {
      'CE2': `English time! 🇬🇧 C'est des mots à apprendre ou des phrases à comprendre ?`,
      '6ème': `Anglais ! 🇬🇧 Vocabulaire, grammaire ou compréhension ?`,
      '4ème': `English ! 🇬🇧 Grammar, writing, or reading comprehension?`,
    },
  };
  
  const subjectResponses = responses[subject] || responses.maths;
  return subjectResponses[child.level] || subjectResponses['6ème'];
}

function exploreProble(message, analysis, child) {
  const { mathElements, problemType } = analysis;
  
  if (mathElements.equation) {
    // On a détecté une équation
    const responses = {
      'CE2': `OK, je vois ton calcul ! 👀 Avant de le résoudre, dis-moi : qu'est-ce qu'on te demande de trouver exactement ?`,
      '6ème': `Je vois l'équation ! 👀 Première question : qu'est-ce qui est l'inconnue ici ? Et quel est ton objectif ?`,
      '4ème': `J'ai repéré l'équation. Avant de foncer, dis-moi : c'est quel type d'équation et quelle méthode tu comptes utiliser ?`,
    };
    return responses[child.level] || responses['6ème'];
  }
  
  if (problemType === 'wordProblem') {
    const responses = {
      'CE2': `Un problème avec une histoire, j'aime bien ! 📝 Raconte-moi le problème avec TES mots. Qui fait quoi ?`,
      '6ème': `OK, un problème ! 📝 Résume-moi la situation en une phrase. C'est quoi la question exacte ?`,
      '4ème': `Problème noté. Quelles sont les données ? Qu'est-ce qu'on cherche ? Formalise.`,
    };
    return responses[child.level] || responses['6ème'];
  }
  
  // Réponse générique d'exploration
  const responses = {
    'CE2': `Je vois ! Et qu'est-ce qu'on te demande de faire avec ça ? 🤔`,
    '6ème': `OK, j'ai compris le contexte. Quelle est la consigne exacte ?`,
    '4ème': `Noté. C'est quoi précisément la question ou l'objectif de l'exercice ?`,
  };
  return responses[child.level] || responses['6ème'];
}

function handleQuestion(message, analysis, child) {
  const lowerMsg = message.toLowerCase();
  
  // Questions sur "comment faire"
  if (/comment (faire|résoudre|calculer|trouver)/.test(lowerMsg)) {
    const responses = {
      'CE2': `Bonne question ! 🤔 Plutôt que de te donner la méthode direct, dis-moi : qu'est-ce que tu ferais en PREMIER si tu devais deviner ?`,
      '6ème': `Avant de te donner une méthode, dis-moi ce que tu as déjà essayé ou ce que tu penses qu'il faut faire.`,
      '4ème': `Quelle approche as-tu envisagée ? Même si tu n'es pas sûr(e), propose quelque chose.`,
    };
    return responses[child.level] || responses['6ème'];
  }
  
  // Questions sur "pourquoi"
  if (/pourquoi/.test(lowerMsg)) {
    const responses = {
      'CE2': `"Pourquoi", c'est LA meilleure question ! 🌟 Toi, tu as une idée ? Qu'est-ce qui te semble logique ?`,
      '6ème': `Excellente question ! Le "pourquoi" montre que tu réfléchis. À ton avis, quelle pourrait être la raison ?`,
      '4ème': `Bonne réflexion de chercher le "pourquoi". Formule une hypothèse, on la vérifiera ensemble.`,
    };
    return responses[child.level] || responses['6ème'];
  }
  
  // Questions sur "c'est quoi"
  if (/c'est quoi|qu'est.ce que?/.test(lowerMsg)) {
    const responses = {
      'CE2': `Tu veux savoir ce que c'est ? 🤔 Où as-tu vu ce mot/cette chose ? Le contexte peut t'aider à deviner !`,
      '6ème': `Bonne question ! As-tu cherché des indices dans ton cours ou dans l'énoncé ?`,
      '4ème': `Avant de te répondre : quel est le contexte ? Et qu'est-ce que tu en déduis ?`,
    };
    return responses[child.level] || responses['6ème'];
  }
  
  // Question générique
  return `Intéressant comme question ! 🤔 Qu'est-ce qui t'a amené à te la poser ?`;
}

function getContextualResponse(message, context) {
  const { child, currentSubject, conversationPhase } = context;
  
  // Si on n'a pas encore de sujet
  if (!currentSubject) {
    const responses = {
      'CE2': `Je n'ai pas bien compris 🤔 Tu peux me dire sur quelle matière tu travailles ? Maths, français, autre chose ?`,
      '6ème': `Hmm, précise-moi : c'est pour quelle matière ? Et c'est quoi l'exercice exactement ?`,
      '4ème': `J'ai besoin de plus de contexte. Quelle matière, quel type d'exercice ?`,
    };
    return responses[child.level] || responses['6ème'];
  }
  
  // Si on est en cours de discussion
  const responses = {
    'CE2': [
      `D'accord ! Et ensuite, qu'est-ce que tu penses qu'il faut faire ?`,
      `Je vois ! Est-ce que tu peux m'en dire plus ?`,
      `OK ! Et si tu devais m'expliquer comme à un copain, tu dirais quoi ?`,
    ],
    '6ème': [
      `Je comprends. Quelle est l'étape suivante selon toi ?`,
      `OK, continue ton raisonnement. Qu'est-ce que ça implique ?`,
      `Bien, et après ? Développe ta pensée.`,
    ],
    '4ème': [
      `Je te suis. Et donc, qu'est-ce que tu en déduis ?`,
      `OK. Continue ta démonstration.`,
      `Bien. Quelle est la suite logique ?`,
    ],
  };
  
  const levelResponses = responses[child.level] || responses['6ème'];
  return levelResponses[Math.floor(Math.random() * levelResponses.length)];
}

// =============================================================================
// HOME VIEW
// =============================================================================
function HomeView({ family, onSelectChild }) {
  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 pt-12 pb-20 rounded-b-3xl">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-purple-200 text-sm">Bonjour ! 👋</p>
            <h1 className="text-2xl font-bold">{family.name}</h1>
          </div>
          <button className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">⚙️</button>
        </div>
      </header>

      <div className="px-4 -mt-12 flex-1 overflow-y-auto pb-24">
        <div className="space-y-3">
          {family.children.map((child) => (
            <button
              key={child.id}
              onClick={() => onSelectChild(child)}
              className="w-full bg-white rounded-2xl p-4 shadow-lg hover:shadow-xl transition-all flex items-center gap-4 text-left group"
            >
              <div className="w-16 h-16 bg-gradient-to-br from-purple-100 to-orange-100 rounded-2xl flex items-center justify-center text-3xl">
                {child.emoji}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-800 text-lg">{child.name}</span>
                  <span className="text-xs bg-purple-100 text-purple-600 px-2 py-1 rounded-full font-medium">
                    {child.level}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="flex items-center gap-1 text-sm text-orange-500 font-medium">
                    🔥 {child.streak} jours
                  </span>
                </div>
              </div>
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-all">
                →
              </div>
            </button>
          ))}
        </div>

        <div className="mt-8 bg-gradient-to-r from-orange-400 to-orange-500 rounded-2xl p-4 text-white">
          <div className="flex items-center gap-3">
            <span className="text-4xl">🦊</span>
            <div>
              <p className="font-bold">Foxie est prêt !</p>
              <p className="text-orange-100 text-sm">Clique sur un enfant pour commencer</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// CHAT VIEW
// =============================================================================
function ChatView({ child, chatState, setChatState, onBack }) {
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatState.messages]);

  const handleSend = () => {
    if (!input.trim() || isTyping) return;

    const userMessage = {
      id: Date.now(),
      from: 'user',
      text: input,
      timestamp: new Date(),
    };

    const newMessages = [...chatState.messages, userMessage];
    setChatState({ ...chatState, messages: newMessages });
    setInput('');
    setIsTyping(true);

    // Générer la réponse
    const typingTime = 800 + Math.random() * 1500;
    
    setTimeout(() => {
      const { response, newContext } = generateResponse(input, chatState);
      
      const foxieMessage = {
        id: Date.now() + 1,
        from: 'foxie',
        text: response,
        timestamp: new Date(),
      };

      setChatState({
        messages: [...newMessages, foxieMessage],
        context: newContext,
      });
      setIsTyping(false);
    }, typingTime);
  };

  const suggestions = [
    { emoji: '🧮', text: "J'ai un exercice de maths" },
    { emoji: '📖', text: 'Je dois conjuguer un verbe' },
    { emoji: '😤', text: 'Je comprends rien, aide-moi !' },
    { emoji: '💡', text: 'Donne-moi un indice' },
  ];

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3 pt-12">
        <button onClick={onBack} className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
          ←
        </button>
        <div className="w-12 h-12 bg-gradient-to-br from-orange-100 to-orange-200 rounded-full flex items-center justify-center text-2xl">
          🦊
        </div>
        <div className="flex-1">
          <h2 className="font-bold text-gray-800">Foxie</h2>
          <p className="text-xs text-green-500 flex items-center gap-1">
            <span className="w-2 h-2 bg-green-500 rounded-full" />
            Aide {child.name} • {child.level}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">Indices</p>
          <p className="text-sm font-bold text-purple-600">{chatState.context.hintsGiven}/3</p>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {chatState.messages.map((msg) => (
          <div key={msg.id} className={`flex items-end gap-2 ${msg.from === 'user' ? 'flex-row-reverse' : ''}`}>
            {msg.from === 'foxie' && (
              <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">🦊</div>
            )}
            <div className={`max-w-[80%] px-4 py-3 rounded-2xl ${
              msg.from === 'user' 
                ? 'bg-purple-600 text-white rounded-br-md' 
                : 'bg-white shadow-sm rounded-bl-md text-gray-700'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        
        {isTyping && (
          <div className="flex items-end gap-2">
            <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">🦊</div>
            <div className="bg-white rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" />
                <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Suggestions */}
      {chatState.messages.length <= 2 && (
        <div className="px-4 pb-2">
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => setInput(s.text)}
                className="px-3 py-2 bg-white border border-purple-200 rounded-full text-sm text-purple-700 hover:bg-purple-50"
              >
                {s.emoji} {s.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="bg-white border-t p-4">
        <div className="flex items-center gap-2 bg-gray-100 rounded-full px-4 py-2">
          <button className="text-xl text-gray-400">📷</button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Pose ta question..."
            className="flex-1 bg-transparent outline-none"
            disabled={isTyping}
          />
          <button 
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className={`w-10 h-10 rounded-full flex items-center justify-center ${
              input.trim() && !isTyping ? 'bg-purple-600 text-white' : 'bg-gray-300 text-gray-500'
            }`}
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
