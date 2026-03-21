import React, { useState, useRef, useEffect } from 'react';

// =============================================================================
// EduFamily - Prototype Fonctionnel
// Chat avec Foxie (tuteur IA socratique)
// =============================================================================

export default function EduFamilyPrototype() {
  const [currentView, setCurrentView] = useState('home');
  const [selectedChild, setSelectedChild] = useState(null);
  const [messages, setMessages] = useState([]);
  const [conversationContext, setConversationContext] = useState(null);

  // Données famille
  const familyData = {
    name: 'Famille Ek',
    children: [
      { id: 1, name: 'Gauthier', level: '4ème', age: 14, emoji: '👦', streak: 12, subjects: ['Maths', 'Physique', 'Anglais'] },
      { id: 2, name: 'Charles', level: '6ème', age: 11, emoji: '👦', streak: 8, subjects: ['Maths', 'Français', 'Histoire'] },
      { id: 3, name: 'Victoire', level: 'CE2', age: 8, emoji: '👧', streak: 15, subjects: ['Maths', 'Français', 'Découverte'] },
    ],
  };

  const startChat = (child) => {
    setSelectedChild(child);
    setMessages([
      {
        id: 1,
        from: 'foxie',
        text: `Salut ${child.name} ! 🦊 Je suis Foxie, ton compagnon pour les devoirs. Sur quoi tu travailles aujourd'hui ?`,
        timestamp: new Date(),
      },
    ]);
    setCurrentView('chat');
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* App Container - Mobile First */}
      <div className="max-w-md mx-auto bg-white min-h-screen shadow-2xl relative overflow-hidden">
        {currentView === 'home' && (
          <HomeView 
            family={familyData} 
            onSelectChild={startChat}
            onNavigate={setCurrentView}
          />
        )}
        {currentView === 'chat' && selectedChild && (
          <ChatView 
            child={selectedChild}
            messages={messages}
            setMessages={setMessages}
            onBack={() => setCurrentView('home')}
            onCreateMindMap={() => setCurrentView('mindmap')}
          />
        )}
        {currentView === 'mindmap' && (
          <MindMapView 
            context={conversationContext}
            onBack={() => setCurrentView('chat')}
          />
        )}
        {currentView === 'progress' && (
          <ProgressView 
            child={selectedChild || familyData.children[0]}
            onBack={() => setCurrentView('home')}
          />
        )}
      </div>
    </div>
  );
}

// =============================================================================
// HOME VIEW
// =============================================================================
function HomeView({ family, onSelectChild, onNavigate }) {
  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 pt-12 pb-20 rounded-b-3xl">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-purple-200 text-sm">Bonjour ! 👋</p>
            <h1 className="text-2xl font-bold">{family.name}</h1>
          </div>
          <div className="flex gap-2">
            <button className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              🔔
            </button>
            <button className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              ⚙️
            </button>
          </div>
        </div>
      </header>

      {/* Children Cards */}
      <div className="px-4 -mt-12 flex-1 overflow-y-auto pb-24">
        <div className="space-y-3">
          {family.children.map((child) => (
            <button
              key={child.id}
              onClick={() => onSelectChild(child)}
              className="w-full bg-white rounded-2xl p-4 shadow-lg hover:shadow-xl transition-all flex items-center gap-4 text-left group"
            >
              <div className="w-16 h-16 bg-gradient-to-br from-purple-100 to-orange-100 rounded-2xl flex items-center justify-center text-3xl group-hover:scale-110 transition-transform">
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
                  <span className="text-gray-300">•</span>
                  <span className="text-sm text-gray-500">{child.subjects.length} matières</span>
                </div>
              </div>
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-all">
                →
              </div>
            </button>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="mt-8">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-3 px-1">Actions rapides</h2>
          <div className="grid grid-cols-2 gap-3">
            <QuickActionCard 
              emoji="📸" 
              label="Photo devoir" 
              color="orange"
              onClick={() => alert('📸 Fonctionnalité photo à venir !')}
            />
            <QuickActionCard 
              emoji="🧠" 
              label="Mes Mind Maps" 
              color="blue"
              onClick={() => onNavigate('mindmap')}
            />
            <QuickActionCard 
              emoji="📊" 
              label="Progression" 
              color="green"
              onClick={() => onNavigate('progress')}
            />
            <QuickActionCard 
              emoji="🎯" 
              label="Quiz du jour" 
              color="pink"
              onClick={() => alert('🎯 Quiz à venir !')}
            />
          </div>
        </div>

        {/* Tip of the day */}
        <div className="mt-6 bg-gradient-to-r from-purple-500 to-purple-600 rounded-2xl p-4 text-white">
          <div className="flex items-start gap-3">
            <span className="text-3xl">💡</span>
            <div>
              <p className="font-bold text-sm">Astuce du jour</p>
              <p className="text-purple-100 text-sm mt-1">
                Demande à Foxie de créer une mind map pour mieux retenir tes leçons !
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <nav className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-6 py-3 flex justify-around">
        <NavItem icon="🏠" label="Accueil" active />
        <NavItem icon="🦊" label="Foxie" />
        <NavItem icon="📚" label="Révisions" />
        <NavItem icon="👤" label="Profil" />
      </nav>
    </div>
  );
}

function QuickActionCard({ emoji, label, color, onClick }) {
  const colors = {
    orange: 'bg-orange-50 hover:bg-orange-100 text-orange-600',
    blue: 'bg-blue-50 hover:bg-blue-100 text-blue-600',
    green: 'bg-green-50 hover:bg-green-100 text-green-600',
    pink: 'bg-pink-50 hover:bg-pink-100 text-pink-600',
  };

  return (
    <button 
      onClick={onClick}
      className={`${colors[color]} p-4 rounded-2xl text-center transition-all hover:scale-105`}
    >
      <span className="text-3xl block mb-2">{emoji}</span>
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}

function NavItem({ icon, label, active }) {
  return (
    <button className={`flex flex-col items-center gap-1 ${active ? 'text-purple-600' : 'text-gray-400'}`}>
      <span className="text-xl">{icon}</span>
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}

// =============================================================================
// CHAT VIEW - Cœur de l'application
// =============================================================================
function ChatView({ child, messages, setMessages, onBack, onCreateMindMap }) {
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const messagesEndRef = useRef(null);

  // Auto-scroll vers le bas
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Système de réponse IA (simulation de la méthode socratique)
  const generateFoxieResponse = (userMessage) => {
    const lowerMsg = userMessage.toLowerCase();
    
    // Patterns de réponse socratique
    const responses = {
      math: [
        "Intéressant ! 🤔 Avant de résoudre, peux-tu m'expliquer ce que tu comprends de l'énoncé ?",
        "Bonne question ! Qu'est-ce que tu as déjà essayé ? Montre-moi ton raisonnement.",
        "OK ! Pour ce type de problème, quelle est la première chose qu'on doit identifier selon toi ?",
        "Je vois ! Et si on décomposait le problème en étapes ? Quelle serait la première ?",
      ],
      french: [
        "Super sujet ! 📖 Qu'est-ce qui t'a marqué dans ce texte ?",
        "Avant d'analyser, qu'est-ce que tu ressens en lisant ce passage ?",
        "Intéressant ! Peux-tu me dire avec tes mots ce que l'auteur essaie de transmettre ?",
        "Bonne observation ! Qu'est-ce qui te fait penser ça ?",
      ],
      help: [
        "Je suis là pour t'aider à TROUVER la réponse, pas te la donner ! 💪 Dis-moi ce que tu as compris.",
        "Pas de panique ! On va y arriver ensemble. Qu'est-ce qui te bloque exactement ?",
        "C'est normal de ne pas comprendre tout de suite. Qu'est-ce que tu sais déjà sur ce sujet ?",
      ],
      stuck: [
        "Je comprends que c'est difficile ! 🤗 Essayons autrement : qu'est-ce que tu ferais si c'était un problème plus simple ?",
        "Pas grave ! Prends une grande respiration. Maintenant, qu'est-ce que l'énoncé te demande exactement ?",
        "C'est OK d'être bloqué ! C'est comme ça qu'on apprend. Quel est le PREMIER mot ou concept que tu ne comprends pas ?",
      ],
      mindmap: [
        "Excellente idée ! 🧠 Une mind map va t'aider à organiser tes idées. Quel est le concept central ?",
        "Parfait pour réviser ! Quels sont les 3-4 points principaux que tu veux retenir ?",
      ],
      greeting: [
        `Salut ${child.name} ! 🦊 Prêt(e) à apprendre des trucs cool aujourd'hui ?`,
        `Hey ! Content de te revoir ! Sur quoi on travaille ?`,
      ],
      default: [
        "Hmm, dis-m'en plus ! 🤔 Qu'est-ce que tu essaies de comprendre exactement ?",
        "Intéressant ! Peux-tu me donner un exemple concret ?",
        "Je vois ! Et qu'est-ce que ça t'évoque ? Fais-moi part de tes premières réflexions.",
        "Bonne question ! Avant de répondre, qu'est-ce que TU penses ?",
      ],
    };

    // Détection du contexte
    let category = 'default';
    if (lowerMsg.match(/math|calcul|équation|nombre|addition|multiplication|division|fraction/)) {
      category = 'math';
    } else if (lowerMsg.match(/français|texte|lecture|conjugaison|grammaire|orthographe|rédaction/)) {
      category = 'french';
    } else if (lowerMsg.match(/aide|help|comprends pas|difficile|dur/)) {
      category = 'help';
    } else if (lowerMsg.match(/bloqué|sais pas|aucune idée|perdu/)) {
      category = 'stuck';
    } else if (lowerMsg.match(/mind map|carte mentale|schéma/)) {
      category = 'mindmap';
    } else if (lowerMsg.match(/salut|bonjour|hello|coucou|hey/)) {
      category = 'greeting';
    }

    const categoryResponses = responses[category];
    return categoryResponses[Math.floor(Math.random() * categoryResponses.length)];
  };

  const handleSend = () => {
    if (!input.trim()) return;

    const userMessage = {
      id: Date.now(),
      from: 'user',
      text: input,
      timestamp: new Date(),
    };

    setMessages([...messages, userMessage]);
    setInput('');
    setIsTyping(true);
    setShowSuggestions(false);

    // Simuler le temps de réponse
    const typingTime = 1000 + Math.random() * 2000;
    
    setTimeout(() => {
      const foxieResponse = {
        id: Date.now() + 1,
        from: 'foxie',
        text: generateFoxieResponse(input),
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, foxieResponse]);
      setIsTyping(false);
    }, typingTime);
  };

  const handleSuggestion = (suggestion) => {
    setInput(suggestion);
    setShowSuggestions(false);
  };

  const suggestions = [
    { emoji: '🧮', text: 'J\'ai un problème de maths' },
    { emoji: '📖', text: 'Aide-moi en français' },
    { emoji: '🤔', text: 'Je ne comprends pas ma leçon' },
    { emoji: '🧠', text: 'Crée une mind map' },
  ];

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 pt-12">
        <button 
          onClick={onBack}
          className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors"
        >
          ←
        </button>
        <div className="w-12 h-12 bg-gradient-to-br from-orange-100 to-orange-200 rounded-full flex items-center justify-center">
          <span className="text-2xl">🦊</span>
        </div>
        <div className="flex-1">
          <h2 className="font-bold text-gray-800">Foxie</h2>
          <p className="text-xs text-green-500 flex items-center gap-1">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            En ligne • Aide {child.name}
          </p>
        </div>
        <button 
          onClick={onCreateMindMap}
          className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center hover:bg-purple-200 transition-colors"
        >
          🧠
        </button>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        
        {isTyping && (
          <div className="flex items-end gap-2">
            <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
              🦊
            </div>
            <div className="bg-white rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Suggestions */}
      {showSuggestions && messages.length <= 2 && (
        <div className="px-4 pb-2">
          <p className="text-xs text-gray-400 mb-2">Suggestions :</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => handleSuggestion(s.text)}
                className="px-3 py-2 bg-white border border-purple-200 rounded-full text-sm text-purple-700 hover:bg-purple-50 transition-colors flex items-center gap-2"
              >
                <span>{s.emoji}</span>
                <span>{s.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="bg-white border-t border-gray-100 p-4">
        <div className="flex items-center gap-2 bg-gray-100 rounded-full px-4 py-2">
          <button className="text-xl text-gray-400 hover:text-gray-600">📷</button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Pose ta question à Foxie..."
            className="flex-1 bg-transparent outline-none text-gray-700 placeholder-gray-400"
          />
          <button 
            onClick={handleSend}
            disabled={!input.trim()}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
              input.trim() 
                ? 'bg-purple-600 text-white hover:bg-purple-700' 
                : 'bg-gray-300 text-gray-500'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }) {
  const isUser = message.from === 'user';
  
  return (
    <div className={`flex items-end gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      {!isUser && (
        <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
          🦊
        </div>
      )}
      <div className={`max-w-[80%] px-4 py-3 rounded-2xl ${
        isUser 
          ? 'bg-purple-600 text-white rounded-br-md' 
          : 'bg-white shadow-sm rounded-bl-md'
      }`}>
        <p className={isUser ? 'text-white' : 'text-gray-700'}>{message.text}</p>
      </div>
    </div>
  );
}

// =============================================================================
// MIND MAP VIEW
// =============================================================================
function MindMapView({ onBack }) {
  const [nodes, setNodes] = useState([
    { id: 'center', text: 'Équations', x: 150, y: 200, color: 'purple', size: 'large' },
    { id: '1', text: 'Isoler x', x: 150, y: 80, color: 'blue', parent: 'center' },
    { id: '2', text: 'Opérations inverses', x: 280, y: 200, color: 'green', parent: 'center' },
    { id: '3', text: 'Vérifier', x: 150, y: 320, color: 'orange', parent: 'center' },
    { id: '4', text: 'Exemples', x: 20, y: 200, color: 'pink', parent: 'center' },
  ]);

  const [selectedNode, setSelectedNode] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  const colors = {
    purple: 'from-purple-500 to-purple-600',
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    orange: 'from-orange-500 to-orange-600',
    pink: 'from-pink-500 to-pink-600',
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-purple-50 to-blue-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-100 px-4 py-3 flex items-center gap-3 pt-12">
        <button 
          onClick={onBack}
          className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center"
        >
          ←
        </button>
        <div className="flex-1">
          <h2 className="font-bold text-gray-800">🧠 Mind Map</h2>
          <p className="text-xs text-gray-500">Les équations du 1er degré</p>
        </div>
        <button className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
          +
        </button>
      </header>

      {/* Canvas */}
      <div className="flex-1 relative overflow-hidden">
        {/* Connections */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {nodes.filter(n => n.parent).map(node => {
            const parent = nodes.find(p => p.id === node.parent);
            if (!parent) return null;
            return (
              <line
                key={`line-${node.id}`}
                x1={parent.x + 40}
                y1={parent.y + 40}
                x2={node.x + 30}
                y2={node.y + 30}
                stroke="#C4B5FD"
                strokeWidth="3"
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        {/* Nodes */}
        {nodes.map(node => (
          <div
            key={node.id}
            onClick={() => setSelectedNode(node.id)}
            className={`absolute cursor-pointer transition-all hover:scale-110 ${
              selectedNode === node.id ? 'ring-4 ring-purple-300 ring-offset-2' : ''
            }`}
            style={{ left: node.x, top: node.y }}
          >
            <div className={`
              ${node.size === 'large' ? 'w-20 h-20' : 'w-16 h-16'}
              bg-gradient-to-br ${colors[node.color]}
              rounded-full flex items-center justify-center
              text-white text-xs font-medium text-center
              shadow-lg p-2
            `}>
              {node.text}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="bg-white border-t border-gray-100 p-4">
        <div className="flex gap-2 mb-3">
          <button className="flex-1 py-3 bg-purple-100 rounded-xl text-purple-700 font-medium text-sm hover:bg-purple-200 transition-colors">
            + Ajouter nœud
          </button>
          <button className="flex-1 py-3 bg-blue-100 rounded-xl text-blue-700 font-medium text-sm hover:bg-blue-200 transition-colors">
            🎨 Couleurs
          </button>
          <button className="flex-1 py-3 bg-green-100 rounded-xl text-green-700 font-medium text-sm hover:bg-green-200 transition-colors">
            📤 Partager
          </button>
        </div>
        <button className="w-full py-4 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl font-semibold hover:from-purple-700 hover:to-purple-800 transition-all">
          🦊 Demander à Foxie d'enrichir
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// PROGRESS VIEW
// =============================================================================
function ProgressView({ child, onBack }) {
  const stats = [
    { label: 'Jours', value: child?.streak || 15, icon: '🔥', color: 'orange' },
    { label: 'Exercices', value: 42, icon: '✅', color: 'green' },
    { label: 'Mind Maps', value: 8, icon: '🧠', color: 'purple' },
  ];

  const subjects = [
    { name: 'Maths', progress: 75, color: 'blue', icon: '🧮' },
    { name: 'Français', progress: 60, color: 'green', icon: '📖' },
    { name: 'Histoire', progress: 45, color: 'orange', icon: '🏛️' },
    { name: 'Sciences', progress: 80, color: 'purple', icon: '🔬' },
  ];

  const weekActivity = [65, 80, 45, 90, 70, 30, 55];
  const days = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-green-500 to-green-600 text-white px-4 pt-12 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <button 
            onClick={onBack}
            className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center"
          >
            ←
          </button>
          <div>
            <h1 className="text-xl font-bold">📊 Progression</h1>
            <p className="text-green-100 text-sm">{child?.name || 'Victoire'} • {child?.level || 'CE2'}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-3">
          {stats.map((stat, i) => (
            <div key={i} className="flex-1 bg-white/20 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-xs text-green-100 flex items-center justify-center gap-1">
                {stat.icon} {stat.label}
              </p>
            </div>
          ))}
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-6 pb-24">
        {/* Subjects */}
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-3">Par matière</h2>
        <div className="space-y-3 mb-8">
          {subjects.map((subject, i) => (
            <div key={i} className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{subject.icon}</span>
                  <span className="font-semibold text-gray-800">{subject.name}</span>
                </div>
                <span className="text-sm font-bold text-gray-600">{subject.progress}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3">
                <div 
                  className={`h-3 rounded-full transition-all bg-${subject.color}-500`}
                  style={{ 
                    width: `${subject.progress}%`,
                    backgroundColor: subject.color === 'blue' ? '#3B82F6' : 
                                    subject.color === 'green' ? '#22C55E' :
                                    subject.color === 'orange' ? '#F97316' : '#8B5CF6'
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Weekly Activity */}
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-3">Cette semaine</h2>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-end justify-between h-32 gap-2">
            {weekActivity.map((value, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full flex-1 flex items-end">
                  <div 
                    className="w-full bg-gradient-to-t from-purple-500 to-purple-400 rounded-t-lg transition-all"
                    style={{ height: `${value}%` }}
                  />
                </div>
                <span className="text-xs text-gray-400 font-medium">{days[i]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Achievement */}
        <div className="mt-6 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-2xl p-4 text-white">
          <div className="flex items-center gap-3">
            <span className="text-4xl">🏆</span>
            <div>
              <p className="font-bold">Nouvelle réussite !</p>
              <p className="text-yellow-100 text-sm">15 jours consécutifs - Continue comme ça !</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Nav */}
      <nav className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-6 py-3 flex justify-around">
        <NavItem icon="🏠" label="Accueil" />
        <NavItem icon="🦊" label="Foxie" />
        <NavItem icon="📚" label="Révisions" />
        <NavItem icon="👤" label="Profil" active />
      </nav>
    </div>
  );
}
