import React, { useState, useRef, useEffect } from 'react';

// =============================================================================
// EduFamily - Prototype avec VRAIE IA (API Claude)
// Plus de réponses génériques - Foxie pense vraiment !
// =============================================================================

// Configuration API - À remplacer par ta clé ou utiliser un backend
const API_CONFIG = {
  // Option 1: Direct (pour test uniquement - NE PAS exposer en prod)
  // apiKey: 'sk-ant-...',
  
  // Option 2: Via backend proxy (recommandé)
  endpoint: '/api/chat', // Ton backend qui appelle Claude
  
  // Option 3: Pour la démo, on simule avec un prompt local
  useSimulation: true, // Mettre à false quand tu as l'API
};

export default function EduFamilyApp() {
  const [currentView, setCurrentView] = useState('home');
  const [selectedChild, setSelectedChild] = useState(null);
  const [conversation, setConversation] = useState([]);

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
    setConversation([]);
    setCurrentView('chat');
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-md mx-auto bg-white min-h-screen shadow-2xl relative overflow-hidden">
        {currentView === 'home' && (
          <HomeView family={familyData} onSelectChild={startChat} />
        )}
        {currentView === 'chat' && selectedChild && (
          <ChatView 
            child={selectedChild}
            conversation={conversation}
            setConversation={setConversation}
            onBack={() => setCurrentView('home')}
          />
        )}
      </div>
    </div>
  );
}

// =============================================================================
// SYSTÈME PROMPT FOXIE - Le cœur de la pédagogie
// =============================================================================

function buildSystemPrompt(child) {
  return `Tu es Foxie 🦊, un tuteur IA bienveillant et intelligent pour les devoirs. Tu aides ${child.name}, ${child.age} ans, en classe de ${child.level}.

## TON RÔLE FONDAMENTAL
Tu es un tuteur SOCRATIQUE. Tu ne donnes JAMAIS les réponses directement. Tu guides l'élève vers la découverte par le questionnement.

## RÈGLES ABSOLUES
1. **JAMAIS de réponse directe** - Si l'élève demande "combien fait 3x + 5 = 20", tu ne dis PAS "x = 5". Tu demandes "Qu'est-ce que tu dois faire pour isoler x ?"

2. **Pose des questions** - Chaque réponse doit contenir au moins une question pour faire réfléchir l'élève.

3. **Adapte ton langage** - ${child.level === 'CE2' ? 'Utilise des mots simples, des exemples concrets, sois très encourageant.' : child.level === '6ème' ? 'Sois clair mais commence à introduire du vocabulaire technique.' : 'Sois direct, attends de l\'autonomie, utilise le vocabulaire académique.'}

4. **Gère les émotions** - Si l'élève est frustré ou dit "je comprends rien", reconnais d'abord son émotion, rassure-le, puis reprends plus simplement.

5. **Célèbre les efforts** - Quand l'élève essaie quelque chose, même faux, félicite l'effort avant de guider vers la correction.

## STRUCTURE DE TES RÉPONSES
- Court (2-4 phrases max)
- Un emoji pertinent de temps en temps
- Termine souvent par une question
- Ton chaleureux mais pas infantilisant

## MÉTHODE PÉDAGOGIQUE
1. **Comprendre** - D'abord, assure-toi de comprendre ce que l'élève doit faire
2. **Explorer** - Demande ce qu'il sait déjà, ce qu'il a essayé
3. **Guider** - Donne des indices progressifs, jamais la solution
4. **Valider** - Quand il trouve, demande-lui d'expliquer POURQUOI ça marche
5. **Ancrer** - Propose un exemple similaire pour vérifier la compréhension

## CE QUE TU NE FAIS JAMAIS
- Donner la réponse finale
- Faire le calcul/l'exercice à la place de l'élève
- Dire "la réponse est..."
- Résoudre l'équation/le problème entièrement
- Écrire la rédaction/conjugaison à sa place

## EXEMPLES DE BONNES RÉPONSES

Élève: "3x + 5 = 20, c'est quoi x ?"
Toi: "Bonne question ! 🤔 Pour trouver x, il faut l'isoler. Qu'est-ce que tu pourrais faire en premier pour commencer à 'libérer' le x ?"

Élève: "Je sais pas du tout"
Toi: "Pas de souci ! Regarde l'équation : il y a un +5 avec le 3x. Si tu voulais enlever ce +5, tu ferais quoi des deux côtés ?"

Élève: "Enlever 5 ?"
Toi: "Exactement ! 💪 Donc 3x + 5 - 5 = 20 - 5. Ça donne quoi ?"

Élève: "3x = 15"  
Toi: "Parfait ! Maintenant il reste 3x = 15. Comment tu peux trouver juste x ?"

## CONTEXTE ACTUEL
Tu parles à ${child.name} (${child.level}, ${child.age} ans). Adapte absolument ton niveau de langage et tes attentes.`;
}

// =============================================================================
// APPEL API CLAUDE (ou simulation intelligente)
// =============================================================================

async function callClaudeAPI(messages, child) {
  const systemPrompt = buildSystemPrompt(child);
  
  // Si on a une vraie API configurée
  if (!API_CONFIG.useSimulation && API_CONFIG.endpoint) {
    try {
      const response = await fetch(API_CONFIG.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: systemPrompt,
          messages: messages.map(m => ({
            role: m.from === 'user' ? 'user' : 'assistant',
            content: m.text
          })),
          model: 'claude-sonnet-4-20250514',
          max_tokens: 300,
        }),
      });
      
      const data = await response.json();
      return data.content[0].text;
    } catch (error) {
      console.error('API Error:', error);
      return "Oups, j'ai eu un petit problème ! 🦊 Tu peux répéter ta question ?";
    }
  }
  
  // Simulation intelligente basée sur le contexte réel
  return simulateIntelligentResponse(messages, child, systemPrompt);
}

// =============================================================================
// SIMULATION INTELLIGENTE (en attendant l'API)
// Beaucoup plus contextuelle que les réponses génériques
// =============================================================================

function simulateIntelligentResponse(messages, child, systemPrompt) {
  const lastUserMessage = messages.filter(m => m.from === 'user').pop()?.text || '';
  const conversationHistory = messages.map(m => `${m.from}: ${m.text}`).join('\n');
  const messageCount = messages.filter(m => m.from === 'user').length;
  
  // Analyse approfondie du message
  const analysis = analyzeUserMessage(lastUserMessage, messages);
  
  // Génération contextuelle
  return generateContextualResponse(analysis, child, messageCount, messages);
}

function analyzeUserMessage(message, history) {
  const lower = message.toLowerCase();
  
  return {
    // Détection du sujet
    subject: detectSubject(lower),
    
    // Détection du type de demande
    isGreeting: /^(salut|bonjour|coucou|hello|hey|hi)\b/.test(lower),
    isQuestion: message.includes('?'),
    askingForAnswer: /donne.*(réponse|solution|résultat)|c'est (quoi|combien)|dis.moi/i.test(lower),
    askingForHelp: /aide|help|comprends pas|sais pas|bloqué|perdu/i.test(lower),
    expressingFrustration: /nul|chiant|énervé|marre|comprends rien|trop dur|impossible|déteste/i.test(lower),
    makingAttempt: /je (pense|crois|dis) que|c'est|ça fait|donc|alors/i.test(lower),
    sayingYes: /^(oui|ouais|yes|ok|d'accord|exactement|correct)\b/i.test(lower),
    sayingNo: /^(non|nan|no|pas vraiment|je sais pas)\b/i.test(lower),
    
    // Extraction de contenu
    numbers: message.match(/\d+([.,]\d+)?/g) || [],
    hasEquation: /\d+\s*[xyz]\s*[+\-*/=]|[+\-*/=]\s*\d+\s*[xyz]|\d+\s*[+\-*/=]\s*\d+/i.test(message),
    mathExpression: message.match(/[\d\s+\-*/=xyz()]+/gi)?.[0]?.trim() || null,
    
    // Contexte conversationnel
    isFirstMessage: history.filter(m => m.from === 'user').length === 0,
    previousFoxieAskedQuestion: history.length > 0 && history[history.length - 1]?.from === 'foxie' && history[history.length - 1]?.text.includes('?'),
    
    // Raw
    raw: message,
    lower: lower,
  };
}

function detectSubject(lower) {
  if (/math|calcul|équation|nombre|x\s*=|addition|soustraction|multiplication|division|fraction|géométrie|aire|périmètre/.test(lower)) return 'maths';
  if (/français|conjugaison|verbe|grammaire|orthographe|accord|sujet|complément|dictée|rédaction/.test(lower)) return 'francais';
  if (/histoire|guerre|roi|révolution|moyen.?âge|siècle|date/.test(lower)) return 'histoire';
  if (/géo|pays|capitale|continent|carte|montagne|fleuve/.test(lower)) return 'geo';
  if (/science|svt|physique|chimie|expérience|cellule|atome/.test(lower)) return 'sciences';
  if (/anglais|english/.test(lower)) return 'anglais';
  return null;
}

function generateContextualResponse(analysis, child, turnCount, history) {
  const { name, level, age } = child;
  
  // === SALUTATION ===
  if (analysis.isGreeting || analysis.isFirstMessage) {
    if (turnCount === 0) {
      const greetings = {
        'CE2': `Coucou ${name} ! 🦊 Je suis super content de te voir ! Sur quoi tu travailles aujourd'hui ? Dis-moi tout !`,
        '6ème': `Salut ${name} ! 🦊 Prêt(e) à bosser ? C'est quoi au programme aujourd'hui ?`,
        '4ème': `Hey ${name} ! 🦊 Qu'est-ce qu'on attaque aujourd'hui ?`,
      };
      return greetings[level] || greetings['6ème'];
    }
  }
  
  // === FRUSTRATION - PRIORITÉ HAUTE ===
  if (analysis.expressingFrustration) {
    const comfort = {
      'CE2': `Hey, je vois que c'est dur... 🤗 C'est OK ! Même les grands trouvent des choses difficiles. On va y aller tout doucement. Dis-moi juste UN truc qui te bloque, le plus petit possible.`,
      '6ème': `Je comprends la frustration ! 😤➡️😊 Respire un coup. Dis-moi précisément : c'est QUOI qui bloque ? L'énoncé ? La méthode ? Un calcul ?`,
      '4ème': `OK, je sens que ça coince. 😤 Pas de panique. Identifie le point précis qui pose problème et on le décortique ensemble. C'est quoi exactement ?`,
    };
    return comfort[level] || comfort['6ème'];
  }
  
  // === DEMANDE DE RÉPONSE DIRECTE ===
  if (analysis.askingForAnswer) {
    const redirect = {
      'CE2': `Ah ah, tu voudrais que je te donne la réponse ? 🦊 Ce serait trop facile ! Et puis tu n'apprendrais rien. Dis-moi plutôt ce que TU penses, et on voit ensemble si t'es sur la bonne piste !`,
      '6ème': `Tu sais que je ne donne pas les réponses comme ça ! 😉 Mais je peux t'aider à la trouver. Qu'est-ce que tu as déjà essayé ?`,
      '4ème': `Je pourrais, mais ça ne t'aiderait pas à progresser. 🎯 Montre-moi ton raisonnement et je te dis si t'es sur la bonne voie.`,
    };
    return redirect[level] || redirect['6ème'];
  }
  
  // === DEMANDE D'AIDE ===
  if (analysis.askingForHelp && !analysis.expressingFrustration) {
    // Chercher le contexte de ce sur quoi il travaille
    const previousContext = findProblemContext(history);
    
    if (previousContext) {
      const hints = {
        'CE2': `D'accord, je t'aide ! 💪 Pour "${previousContext.substring(0, 30)}...", commençons par le début : qu'est-ce qu'on te demande de trouver ?`,
        '6ème': `OK ! Pour ton problème, quelle est la première étape selon toi ? Même si tu n'es pas sûr(e), propose quelque chose.`,
        '4ème': `Quel point précis te bloque ? La compréhension de l'énoncé, la méthode à utiliser, ou un calcul ?`,
      };
      return hints[level] || hints['6ème'];
    } else {
      return `Je veux bien t'aider ! 🦊 Mais d'abord, explique-moi sur quoi tu travailles. C'est quoi l'exercice ou la question ?`;
    }
  }
  
  // === TENTATIVE DE RÉPONSE ===
  if (analysis.makingAttempt) {
    const numbers = analysis.numbers;
    
    if (numbers.length > 0) {
      const encouragements = {
        'CE2': `Tu proposes ${numbers[0]} ? 🤔 Intéressant ! Explique-moi comment tu as trouvé ça. Tu as fait quel calcul dans ta tête ?`,
        '6ème': `${numbers[0]}, OK ! Comment tu es arrivé(e) à ce résultat ? Détaille-moi les étapes.`,
        '4ème': `Tu trouves ${numbers[0]}. Justifie : quelles étapes t'ont mené là ?`,
      };
      return encouragements[level] || encouragements['6ème'];
    } else {
      const generic = {
        'CE2': `D'accord ! 😊 Et pourquoi tu penses ça ? Qu'est-ce qui te fait dire ça ?`,
        '6ème': `Intéressant ! Développe ton raisonnement. Pourquoi ?`,
        '4ème': `OK. Argumente : qu'est-ce qui te permet d'affirmer ça ?`,
      };
      return generic[level] || generic['6ème'];
    }
  }
  
  // === OUI/NON après une question de Foxie ===
  if (analysis.previousFoxieAskedQuestion) {
    if (analysis.sayingYes) {
      return `Super ! 👍 Alors montre-moi ce que ça donne. Écris le calcul ou ta réponse.`;
    }
    if (analysis.sayingNo) {
      const help = {
        'CE2': `Pas de souci ! 🤗 Je vais t'aider autrement. Dis-moi ce que tu vois dans l'exercice : quels nombres il y a ? Qu'est-ce qu'on te demande ?`,
        '6ème': `OK, reformulons. Qu'est-ce que tu comprends de l'énoncé, même partiellement ?`,
        '4ème': `Bien. Qu'est-ce qui n'est pas clair exactement ? L'énoncé ou la méthode ?`,
      };
      return help[level] || help['6ème'];
    }
  }
  
  // === ÉQUATION DÉTECTÉE ===
  if (analysis.hasEquation || analysis.mathExpression) {
    const expr = analysis.mathExpression || analysis.raw;
    const responses = {
      'CE2': `Je vois ton calcul ! 👀 "${expr}" - Avant de le résoudre, dis-moi : qu'est-ce qu'on cherche ? C'est quoi le nombre mystère ?`,
      '6ème': `OK, j'ai l'équation : "${expr}" 📝 Première question : quelle opération tu dois "défaire" en premier pour isoler l'inconnue ?`,
      '4ème': `"${expr}" noté. Quelle est ta stratégie pour isoler l'inconnue ? Par quoi tu commences ?`,
    };
    return responses[level] || responses['6ème'];
  }
  
  // === SUJET DÉTECTÉ MAIS PAS DE PROBLÈME PRÉCIS ===
  if (analysis.subject && !analysis.hasEquation) {
    const subjectResponses = {
      maths: {
        'CE2': `Les maths ! 🧮 J'adore ! C'est quoi ton exercice ? Un calcul, un problème avec une histoire, ou de la géométrie ?`,
        '6ème': `Maths ! 🧮 C'est quoi exactement ? Calcul, équation, géométrie, problème ? Envoie-moi l'énoncé !`,
        '4ème': `Maths 🧮 - Balance l'énoncé complet qu'on analyse ça ensemble.`,
      },
      francais: {
        'CE2': `Le français ! 📖 C'est de la conjugaison, de la grammaire, ou une lecture ?`,
        '6ème': `Français ! 📖 Conjugaison, grammaire, analyse de texte ou rédaction ?`,
        '4ème': `Français 📖 - C'est quoi l'exercice précis ?`,
      },
      histoire: {
        'CE2': `L'histoire ! 🏛️ C'est sur quelle période ? Les chevaliers, les rois, la préhistoire ?`,
        '6ème': `Histoire ! 🏛️ Quelle époque tu étudies ?`,
        '4ème': `Histoire 🏛️ - Quel chapitre ou quelle question ?`,
      },
      sciences: {
        'CE2': `Les sciences ! 🔬 C'est sur les animaux, les plantes, le corps humain ?`,
        '6ème': `Sciences ! 🔬 SVT ou physique-chimie ? C'est quoi le thème ?`,
        '4ème': `Sciences 🔬 - Quel sujet précis ?`,
      },
      anglais: {
        'CE2': `English ! 🇬🇧 C'est des mots à apprendre ou des phrases ?`,
        '6ème': `Anglais ! 🇬🇧 Vocabulaire, grammaire ou compréhension ?`,
        '4ème': `English ! 🇬🇧 Grammar, writing, or comprehension?`,
      },
    };
    
    const subjectResp = subjectResponses[analysis.subject];
    if (subjectResp) {
      return subjectResp[level] || subjectResp['6ème'];
    }
  }
  
  // === RÉPONSE PAR DÉFAUT CONTEXTUELLE ===
  // Basée sur l'historique de conversation
  const lastFoxieMessage = history.filter(m => m.from === 'foxie').pop()?.text || '';
  
  if (lastFoxieMessage.includes('?') && analysis.raw.length > 10) {
    // Foxie avait posé une question et l'utilisateur répond
    const followups = {
      'CE2': `D'accord, je comprends ! 😊 Et maintenant, qu'est-ce que tu ferais comme prochaine étape ?`,
      '6ème': `OK, je vois. Et ensuite, qu'est-ce que ça te permet de faire ?`,
      '4ème': `Bien. Quelle est la suite logique de ton raisonnement ?`,
    };
    return followups[level] || followups['6ème'];
  }
  
  // Vraiment par défaut - demander plus d'infos
  const defaults = {
    'CE2': `Hmm, dis-m'en plus ! 🤔 C'est pour quelle matière ? Et c'est quoi exactement l'exercice ?`,
    '6ème': `J'ai besoin de plus de contexte. C'est pour quoi ? Montre-moi l'énoncé complet.`,
    '4ème': `Précise ta question. C'est quoi exactement le problème à résoudre ?`,
  };
  return defaults[level] || defaults['6ème'];
}

function findProblemContext(history) {
  // Cherche dans l'historique un énoncé de problème
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.from === 'user') {
      // Cherche quelque chose qui ressemble à un problème
      if (/\d+.*[+\-*/=].*\d+|problème|exercice|calcul/i.test(msg.text)) {
        return msg.text;
      }
    }
  }
  return null;
}

// =============================================================================
// COMPOSANTS UI
// =============================================================================

function HomeView({ family, onSelectChild }) {
  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="bg-gradient-to-r from-purple-600 via-purple-700 to-indigo-700 text-white px-6 pt-12 pb-24 rounded-b-3xl shadow-lg">
        <div className="flex justify-between items-start mb-6">
          <div>
            <p className="text-purple-200 text-sm font-medium">Bonjour ! 👋</p>
            <h1 className="text-2xl font-bold">{family.name}</h1>
          </div>
          <button className="w-10 h-10 bg-white/20 backdrop-blur rounded-full flex items-center justify-center hover:bg-white/30 transition-colors">
            ⚙️
          </button>
        </div>
        
        <div className="bg-white/10 backdrop-blur rounded-2xl p-4 flex items-center gap-4">
          <div className="text-4xl">🦊</div>
          <div>
            <p className="font-semibold">Foxie est prêt !</p>
            <p className="text-purple-200 text-sm">Clique sur un enfant pour commencer</p>
          </div>
        </div>
      </header>

      <div className="px-4 -mt-10 flex-1 overflow-y-auto pb-8">
        <div className="space-y-3">
          {family.children.map((child) => (
            <button
              key={child.id}
              onClick={() => onSelectChild(child)}
              className="w-full bg-white rounded-2xl p-4 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all flex items-center gap-4 text-left group"
            >
              <div className="w-16 h-16 bg-gradient-to-br from-purple-100 to-orange-100 rounded-2xl flex items-center justify-center text-3xl shadow-inner">
                {child.emoji}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-gray-800 text-lg">{child.name}</span>
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-semibold">
                    {child.level}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-sm text-orange-500 font-semibold">
                    🔥 {child.streak}
                  </span>
                  <span className="text-gray-300">•</span>
                  <span className="text-sm text-gray-500">{child.age} ans</span>
                </div>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-all text-xl">
                →
              </div>
            </button>
          ))}
        </div>
        
        <div className="mt-6 p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl">
          <p className="text-amber-800 text-sm">
            <strong>💡 Astuce :</strong> Foxie ne donne jamais les réponses directement. Il t'aide à les trouver toi-même !
          </p>
        </div>
      </div>
    </div>
  );
}

function ChatView({ child, conversation, setConversation, onBack }) {
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation]);

  // Message d'accueil au premier rendu
  useEffect(() => {
    if (!hasStarted) {
      setHasStarted(true);
      setIsTyping(true);
      
      setTimeout(async () => {
        const greeting = await callClaudeAPI([], child);
        setConversation([{
          id: Date.now(),
          from: 'foxie',
          text: greeting,
          timestamp: new Date(),
        }]);
        setIsTyping(false);
      }, 800);
    }
  }, [hasStarted, child, setConversation]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userMessage = {
      id: Date.now(),
      from: 'user',
      text: input.trim(),
      timestamp: new Date(),
    };

    const newConversation = [...conversation, userMessage];
    setConversation(newConversation);
    setInput('');
    setIsTyping(true);

    try {
      const response = await callClaudeAPI(newConversation, child);
      
      const foxieMessage = {
        id: Date.now() + 1,
        from: 'foxie',
        text: response,
        timestamp: new Date(),
      };

      setConversation([...newConversation, foxieMessage]);
    } catch (error) {
      console.error('Error:', error);
      setConversation([...newConversation, {
        id: Date.now() + 1,
        from: 'foxie',
        text: "Oups, j'ai eu un petit souci ! 🦊 Tu peux répéter ?",
        timestamp: new Date(),
      }]);
    } finally {
      setIsTyping(false);
      inputRef.current?.focus();
    }
  };

  const quickActions = [
    { emoji: '🧮', text: "J'ai un exercice de maths" },
    { emoji: '📖', text: "J'ai du français à faire" },
    { emoji: '💡', text: "J'ai besoin d'un indice" },
    { emoji: '😤', text: "Je comprends rien !" },
  ];

  return (
    <div className="h-screen flex flex-col bg-gradient-to-b from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-lg border-b border-gray-200 px-4 py-3 flex items-center gap-3 pt-12 sticky top-0 z-10">
        <button 
          onClick={onBack}
          className="w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors"
        >
          ←
        </button>
        <div className="w-12 h-12 bg-gradient-to-br from-orange-200 to-orange-300 rounded-full flex items-center justify-center shadow-md">
          <span className="text-2xl">🦊</span>
        </div>
        <div className="flex-1">
          <h2 className="font-bold text-gray-800">Foxie</h2>
          <p className="text-xs flex items-center gap-1.5">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-green-600 font-medium">En ligne</span>
            <span className="text-gray-400">• Aide {child.name}</span>
          </p>
        </div>
        <div className="px-3 py-1 bg-purple-100 rounded-full">
          <span className="text-xs font-semibold text-purple-700">{child.level}</span>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {conversation.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex items-end gap-2 ${msg.from === 'user' ? 'flex-row-reverse' : ''}`}
          >
            {msg.from === 'foxie' && (
              <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm">
                🦊
              </div>
            )}
            <div className={`max-w-[85%] px-4 py-3 rounded-2xl shadow-sm ${
              msg.from === 'user' 
                ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-br-md' 
                : 'bg-white text-gray-700 rounded-bl-md'
            }`}>
              <p className="leading-relaxed">{msg.text}</p>
            </div>
          </div>
        ))}
        
        {isTyping && (
          <div className="flex items-end gap-2">
            <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center shadow-sm">
              🦊
            </div>
            <div className="bg-white rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" />
                <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions */}
      {conversation.length <= 2 && !isTyping && (
        <div className="px-4 pb-2">
          <div className="flex flex-wrap gap-2">
            {quickActions.map((action, i) => (
              <button
                key={i}
                onClick={() => setInput(action.text)}
                className="px-3 py-2 bg-white border border-purple-200 rounded-full text-sm text-purple-700 hover:bg-purple-50 hover:border-purple-300 transition-all shadow-sm"
              >
                {action.emoji} {action.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="bg-white border-t border-gray-200 p-4">
        <div className="flex items-center gap-2 bg-gray-100 rounded-full px-4 py-2 focus-within:ring-2 focus-within:ring-purple-300 transition-all">
          <button className="text-xl text-gray-400 hover:text-gray-600 transition-colors">
            📷
          </button>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Écris ta question ici..."
            className="flex-1 bg-transparent outline-none text-gray-700 placeholder-gray-400"
            disabled={isTyping}
          />
          <button 
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
              input.trim() && !isTyping 
                ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white shadow-md hover:shadow-lg hover:scale-105' 
                : 'bg-gray-300 text-gray-500'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        
        <p className="text-center text-xs text-gray-400 mt-2">
          🦊 Foxie ne donne pas les réponses, il t'aide à les trouver !
        </p>
      </div>
    </div>
  );
}
