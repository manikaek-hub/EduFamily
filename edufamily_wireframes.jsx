import React, { useState } from 'react';

// Wireframes EduFamily - Navigation entre écrans
export default function EduFamilyWireframes() {
  const [currentScreen, setCurrentScreen] = useState('home');
  const [selectedChild, setSelectedChild] = useState(null);
  
  // Navigation
  const screens = [
    { id: 'onboarding', label: '1. Onboarding', icon: '👋' },
    { id: 'home', label: '2. Accueil', icon: '🏠' },
    { id: 'chat', label: '3. Chat Foxie', icon: '🦊' },
    { id: 'photo', label: '4. Photo Devoir', icon: '📸' },
    { id: 'mindmap', label: '5. Mind Map', icon: '🧠' },
    { id: 'progress', label: '6. Progression', icon: '📊' },
    { id: 'parent', label: '7. Espace Parent', icon: '👨‍👩‍👧' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-orange-50">
      {/* Header Navigation */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-3xl">🦊</span>
              <span className="font-bold text-xl text-purple-700">EduFamily</span>
              <span className="text-xs bg-purple-100 text-purple-600 px-2 py-1 rounded-full">Wireframes</span>
            </div>
          </div>
          <div className="flex gap-1 overflow-x-auto pb-2">
            {screens.map((screen) => (
              <button
                key={screen.id}
                onClick={() => setCurrentScreen(screen.id)}
                className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-all ${
                  currentScreen === screen.id
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <span>{screen.icon}</span>
                <span className="hidden sm:inline">{screen.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Phone Frame */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          {/* Phone Mockup */}
          <div className="flex-shrink-0 mx-auto">
            <div className="relative">
              {/* Phone Frame */}
              <div className="w-[320px] h-[680px] bg-gray-900 rounded-[3rem] p-3 shadow-2xl">
                <div className="w-full h-full bg-white rounded-[2.5rem] overflow-hidden relative">
                  {/* Notch */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-7 bg-gray-900 rounded-b-2xl z-10" />
                  
                  {/* Screen Content */}
                  <div className="h-full overflow-y-auto pt-8">
                    {currentScreen === 'onboarding' && <OnboardingScreen />}
                    {currentScreen === 'home' && <HomeScreen onSelectChild={setSelectedChild} onNavigate={setCurrentScreen} />}
                    {currentScreen === 'chat' && <ChatScreen />}
                    {currentScreen === 'photo' && <PhotoScreen onNavigate={setCurrentScreen} />}
                    {currentScreen === 'mindmap' && <MindMapScreen />}
                    {currentScreen === 'progress' && <ProgressScreen />}
                    {currentScreen === 'parent' && <ParentScreen />}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Description Panel */}
          <div className="flex-1 bg-white rounded-2xl shadow-lg p-6">
            <ScreenDescription screen={currentScreen} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// SCREEN: Onboarding
// ============================================
function OnboardingScreen() {
  const [step, setStep] = useState(0);
  
  const steps = [
    {
      emoji: '🦊',
      title: 'Salut ! Moi c\'est Foxie',
      subtitle: 'Je suis ton compagnon pour les devoirs !',
      content: 'Je ne donne pas les réponses... je t\'aide à les trouver toi-même ! 🧠'
    },
    {
      emoji: '👨‍👩‍👧‍👦',
      title: 'Qui fait partie de ta famille ?',
      subtitle: 'Ajoute les enfants',
      content: 'input_children'
    },
    {
      emoji: '🎯',
      title: 'Quel niveau ?',
      subtitle: 'Pour adapter mes explications',
      content: 'select_level'
    },
    {
      emoji: '🚀',
      title: 'C\'est parti !',
      subtitle: 'Foxie est prêt à t\'aider',
      content: 'Prends en photo ton devoir ou pose-moi une question !'
    }
  ];

  const currentStep = steps[step];

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-purple-500 to-purple-700 text-white p-6">
      {/* Progress dots */}
      <div className="flex justify-center gap-2 mb-8 pt-4">
        {steps.map((_, i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition-all ${
              i === step ? 'bg-white w-6' : 'bg-white/40'
            }`}
          />
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <div className="text-7xl mb-6 animate-bounce">{currentStep.emoji}</div>
        <h1 className="text-2xl font-bold mb-2">{currentStep.title}</h1>
        <p className="text-purple-200 mb-6">{currentStep.subtitle}</p>
        
        {currentStep.content === 'input_children' ? (
          <div className="w-full space-y-3">
            <div className="bg-white/20 rounded-xl p-3 flex items-center gap-3">
              <span className="text-2xl">👧</span>
              <input 
                type="text" 
                placeholder="Prénom de l'enfant"
                className="bg-transparent flex-1 outline-none placeholder-white/60"
              />
              <span className="text-sm bg-white/20 px-2 py-1 rounded">CE2</span>
            </div>
            <button className="w-full py-2 border-2 border-dashed border-white/40 rounded-xl text-white/60">
              + Ajouter un enfant
            </button>
          </div>
        ) : currentStep.content === 'select_level' ? (
          <div className="w-full grid grid-cols-2 gap-2">
            {['CP', 'CE1', 'CE2', 'CM1', 'CM2', '6ème', '5ème', '4ème'].map((level) => (
              <button
                key={level}
                className="py-3 bg-white/20 rounded-xl hover:bg-white/30 transition-all"
              >
                {level}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-purple-100 text-lg">{currentStep.content}</p>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-3 pb-8">
        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            className="flex-1 py-4 bg-white/20 rounded-2xl font-semibold"
          >
            Retour
          </button>
        )}
        <button
          onClick={() => setStep(Math.min(step + 1, steps.length - 1))}
          className="flex-1 py-4 bg-white rounded-2xl text-purple-700 font-semibold shadow-lg"
        >
          {step === steps.length - 1 ? 'Commencer !' : 'Suivant'}
        </button>
      </div>
    </div>
  );
}

// ============================================
// SCREEN: Home
// ============================================
function HomeScreen({ onSelectChild, onNavigate }) {
  const children = [
    { name: 'Gauthier', level: '4ème', emoji: '👦', streak: 12 },
    { name: 'Charles', level: '6ème', emoji: '👦', streak: 8 },
    { name: 'Victoire', level: 'CE2', emoji: '👧', streak: 15 },
  ];

  return (
    <div className="h-full bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white p-6 pb-16 rounded-b-3xl">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-purple-200 text-sm">Bonjour ! 👋</p>
            <h1 className="text-xl font-bold">Famille Ek</h1>
          </div>
          <button className="p-2 bg-white/20 rounded-full">
            <span>⚙️</span>
          </button>
        </div>
      </div>

      {/* Children Cards - Overlapping header */}
      <div className="px-4 -mt-10 space-y-3">
        {children.map((child, i) => (
          <button
            key={i}
            onClick={() => {
              onSelectChild(child);
              onNavigate('chat');
            }}
            className="w-full bg-white rounded-2xl p-4 shadow-md flex items-center gap-4 hover:shadow-lg transition-all text-left"
          >
            <div className="w-14 h-14 bg-purple-100 rounded-full flex items-center justify-center text-2xl">
              {child.emoji}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-800">{child.name}</span>
                <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full">
                  {child.level}
                </span>
              </div>
              <div className="flex items-center gap-1 text-sm text-gray-500">
                <span>🔥</span>
                <span>{child.streak} jours</span>
              </div>
            </div>
            <div className="text-purple-500 text-2xl">→</div>
          </button>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="px-4 mt-6">
        <h2 className="text-sm font-semibold text-gray-500 mb-3">Actions rapides</h2>
        <div className="grid grid-cols-2 gap-3">
          <button 
            onClick={() => onNavigate('photo')}
            className="bg-orange-100 p-4 rounded-2xl text-center hover:bg-orange-200 transition-all"
          >
            <span className="text-3xl block mb-1">📸</span>
            <span className="text-sm text-orange-700 font-medium">Photo devoir</span>
          </button>
          <button 
            onClick={() => onNavigate('mindmap')}
            className="bg-blue-100 p-4 rounded-2xl text-center hover:bg-blue-200 transition-all"
          >
            <span className="text-3xl block mb-1">🧠</span>
            <span className="text-sm text-blue-700 font-medium">Mind Map</span>
          </button>
          <button 
            onClick={() => onNavigate('progress')}
            className="bg-green-100 p-4 rounded-2xl text-center hover:bg-green-200 transition-all"
          >
            <span className="text-3xl block mb-1">📊</span>
            <span className="text-sm text-green-700 font-medium">Progression</span>
          </button>
          <button 
            onClick={() => onNavigate('parent')}
            className="bg-purple-100 p-4 rounded-2xl text-center hover:bg-purple-200 transition-all"
          >
            <span className="text-3xl block mb-1">👨‍👩‍👧</span>
            <span className="text-sm text-purple-700 font-medium">Espace parent</span>
          </button>
        </div>
      </div>

      {/* Bottom Nav */}
      <div className="absolute bottom-0 left-0 right-0 bg-white border-t flex justify-around py-3 px-6">
        <button className="flex flex-col items-center text-purple-600">
          <span className="text-xl">🏠</span>
          <span className="text-xs">Accueil</span>
        </button>
        <button className="flex flex-col items-center text-gray-400">
          <span className="text-xl">🦊</span>
          <span className="text-xs">Foxie</span>
        </button>
        <button className="flex flex-col items-center text-gray-400">
          <span className="text-xl">📚</span>
          <span className="text-xs">Révisions</span>
        </button>
        <button className="flex flex-col items-center text-gray-400">
          <span className="text-xl">👤</span>
          <span className="text-xs">Profil</span>
        </button>
      </div>
    </div>
  );
}

// ============================================
// SCREEN: Chat avec Foxie
// ============================================
function ChatScreen() {
  const [messages, setMessages] = useState([
    { from: 'foxie', text: 'Salut ! 🦊 Sur quoi tu travailles aujourd\'hui ?' },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const foxieResponses = [
    "Hmm, intéressant ! 🤔 Qu'est-ce que tu as déjà essayé ?",
    "Bonne question ! Peux-tu me dire ce que tu sais déjà sur ce sujet ?",
    "Je vois ! Et si on décomposait le problème ? Quelle est la première étape selon toi ?",
    "Tu y es presque ! 💪 Qu'est-ce qui te bloque exactement ?",
  ];

  const handleSend = () => {
    if (!input.trim()) return;
    
    setMessages([...messages, { from: 'user', text: input }]);
    setInput('');
    setIsTyping(true);
    
    setTimeout(() => {
      setIsTyping(false);
      setMessages(prev => [...prev, { 
        from: 'foxie', 
        text: foxieResponses[Math.floor(Math.random() * foxieResponses.length)]
      }]);
    }, 1500);
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3 pt-8">
        <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
          <span className="text-xl">🦊</span>
        </div>
        <div className="flex-1">
          <h2 className="font-semibold text-gray-800">Foxie</h2>
          <p className="text-xs text-green-500">● En ligne</p>
        </div>
        <button className="p-2 bg-purple-100 rounded-full">
          <span>🧠</span>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.from === 'foxie' && (
              <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center mr-2 flex-shrink-0">
                <span>🦊</span>
              </div>
            )}
            <div className={`max-w-[75%] p-3 rounded-2xl ${
              msg.from === 'user' 
                ? 'bg-purple-600 text-white rounded-br-md' 
                : 'bg-white shadow-sm rounded-bl-md'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        
        {isTyping && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
              <span>🦊</span>
            </div>
            <div className="bg-white shadow-sm rounded-2xl rounded-bl-md p-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{animationDelay: '0.1s'}} />
                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{animationDelay: '0.2s'}} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick prompts */}
      <div className="px-4 pb-2">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {['📸 Photo devoir', '🧮 Maths', '📖 Français', '🌍 Histoire'].map((prompt, i) => (
            <button
              key={i}
              onClick={() => setInput(prompt.split(' ')[1])}
              className="flex-shrink-0 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-full text-sm"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="bg-white border-t p-3">
        <div className="flex items-center gap-2 bg-gray-100 rounded-full px-4 py-2">
          <button className="text-xl">📷</button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Pose ta question..."
            className="flex-1 bg-transparent outline-none text-sm"
          />
          <button 
            onClick={handleSend}
            className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// SCREEN: Photo Devoir
// ============================================
function PhotoScreen({ onNavigate }) {
  const [step, setStep] = useState('capture'); // capture, preview, analyzing, result
  
  return (
    <div className="h-full flex flex-col bg-black">
      {step === 'capture' && (
        <>
          {/* Camera View */}
          <div className="flex-1 relative">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="border-2 border-white/50 rounded-lg w-[90%] h-[60%] flex items-center justify-center">
                <p className="text-white/70 text-center px-4">
                  📄 Cadre ton devoir ici
                </p>
              </div>
            </div>
            
            {/* Top bar */}
            <div className="absolute top-8 left-0 right-0 flex justify-between px-4">
              <button 
                onClick={() => onNavigate('home')}
                className="w-10 h-10 bg-black/50 rounded-full flex items-center justify-center text-white"
              >
                ✕
              </button>
              <button className="w-10 h-10 bg-black/50 rounded-full flex items-center justify-center text-white">
                ⚡
              </button>
            </div>
          </div>

          {/* Capture button */}
          <div className="bg-black py-8 flex justify-center items-center gap-8">
            <button className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-white">
              🖼️
            </button>
            <button 
              onClick={() => setStep('preview')}
              className="w-20 h-20 bg-white rounded-full flex items-center justify-center border-4 border-purple-500"
            >
              <div className="w-16 h-16 bg-purple-500 rounded-full" />
            </button>
            <button className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-white">
              🔄
            </button>
          </div>
        </>
      )}

      {step === 'preview' && (
        <div className="flex-1 flex flex-col">
          {/* Preview */}
          <div className="flex-1 bg-gray-200 flex items-center justify-center">
            <div className="bg-white w-[90%] h-[70%] rounded-lg shadow-lg p-4 flex items-center justify-center">
              <div className="text-center text-gray-400">
                <p className="text-6xl mb-4">📝</p>
                <p>Exercice de maths</p>
                <p className="text-sm">3x + 5 = 20</p>
                <p className="text-sm">Trouve la valeur de x</p>
              </div>
            </div>
          </div>
          
          {/* Actions */}
          <div className="bg-white p-6 flex gap-4">
            <button 
              onClick={() => setStep('capture')}
              className="flex-1 py-4 bg-gray-100 rounded-xl font-semibold"
            >
              Reprendre
            </button>
            <button 
              onClick={() => setStep('analyzing')}
              className="flex-1 py-4 bg-purple-600 text-white rounded-xl font-semibold"
            >
              Analyser 🦊
            </button>
          </div>
        </div>
      )}

      {step === 'analyzing' && (
        <div className="flex-1 flex flex-col items-center justify-center bg-purple-600 text-white p-8">
          <div className="text-7xl mb-6 animate-bounce">🦊</div>
          <h2 className="text-xl font-bold mb-2">Foxie analyse...</h2>
          <p className="text-purple-200 text-center mb-8">
            Je regarde ton exercice pour comprendre comment t'aider !
          </p>
          <div className="w-full max-w-xs bg-white/20 rounded-full h-2">
            <div className="bg-white h-2 rounded-full animate-pulse w-2/3" />
          </div>
          <button 
            onClick={() => setStep('result')}
            className="mt-8 text-sm text-purple-200 underline"
          >
            (Simuler résultat)
          </button>
        </div>
      )}

      {step === 'result' && (
        <div className="flex-1 flex flex-col bg-white pt-8">
          {/* Header */}
          <div className="px-4 pb-4 border-b">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                <span className="text-2xl">🧮</span>
              </div>
              <div>
                <h2 className="font-bold">Équation du 1er degré</h2>
                <p className="text-sm text-gray-500">Maths • 6ème</p>
              </div>
            </div>
          </div>

          {/* Foxie response */}
          <div className="flex-1 p-4 overflow-y-auto">
            <div className="bg-orange-50 rounded-2xl p-4 mb-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">🦊</span>
                <div>
                  <p className="font-medium text-gray-800 mb-2">
                    Super exercice ! Voici comment je peux t'aider :
                  </p>
                  <p className="text-gray-600 text-sm mb-3">
                    Tu dois trouver la valeur de <strong>x</strong> dans l'équation 3x + 5 = 20
                  </p>
                  <p className="text-purple-700 font-medium">
                    💡 Indice : Que dois-tu faire pour "isoler" le x ?
                  </p>
                </div>
              </div>
            </div>

            {/* Options */}
            <div className="space-y-2">
              <button className="w-full p-3 bg-purple-100 rounded-xl text-left text-purple-700 hover:bg-purple-200 transition-all">
                🤔 Je ne comprends pas la question
              </button>
              <button className="w-full p-3 bg-purple-100 rounded-xl text-left text-purple-700 hover:bg-purple-200 transition-all">
                💡 Donne-moi un autre indice
              </button>
              <button className="w-full p-3 bg-purple-100 rounded-xl text-left text-purple-700 hover:bg-purple-200 transition-all">
                📝 Montre-moi la méthode étape par étape
              </button>
              <button 
                onClick={() => onNavigate('mindmap')}
                className="w-full p-3 bg-blue-100 rounded-xl text-left text-blue-700 hover:bg-blue-200 transition-all"
              >
                🧠 Créer une mind map sur les équations
              </button>
            </div>
          </div>

          {/* Continue chat */}
          <div className="p-4 border-t">
            <button 
              onClick={() => onNavigate('chat')}
              className="w-full py-4 bg-purple-600 text-white rounded-xl font-semibold"
            >
              Continuer avec Foxie 🦊
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// SCREEN: Mind Map
// ============================================
function MindMapScreen() {
  return (
    <div className="h-full flex flex-col bg-white pt-8">
      {/* Header */}
      <div className="px-4 pb-4 border-b">
        <h1 className="text-lg font-bold text-gray-800">🧠 Mind Map</h1>
        <p className="text-sm text-gray-500">Les équations du 1er degré</p>
      </div>

      {/* Mind Map Visualization */}
      <div className="flex-1 relative overflow-hidden bg-gradient-to-br from-purple-50 to-blue-50 p-4">
        {/* Central node */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="w-32 h-32 bg-purple-600 rounded-full flex items-center justify-center text-white text-center p-2 shadow-lg">
            <span className="text-sm font-bold">Équations 1er degré</span>
          </div>
          
          {/* Branches */}
          <div className="absolute -top-20 left-1/2 -translate-x-1/2">
            <div className="w-1 h-16 bg-purple-300 mx-auto" />
            <div className="w-24 h-24 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs text-center p-2 shadow-md">
              Isoler x
            </div>
          </div>
          
          <div className="absolute top-1/2 -right-28 -translate-y-1/2">
            <div className="h-1 w-16 bg-purple-300 absolute right-full top-1/2" />
            <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center text-white text-xs text-center p-2 shadow-md">
              Opérations inverses
            </div>
          </div>
          
          <div className="absolute top-1/2 -left-28 -translate-y-1/2">
            <div className="h-1 w-16 bg-purple-300 absolute left-full top-1/2" />
            <div className="w-24 h-24 bg-orange-500 rounded-full flex items-center justify-center text-white text-xs text-center p-2 shadow-md">
              Vérifier le résultat
            </div>
          </div>
          
          <div className="absolute -bottom-20 left-1/2 -translate-x-1/2">
            <div className="w-1 h-16 bg-purple-300 mx-auto absolute bottom-full left-1/2" />
            <div className="w-24 h-24 bg-pink-500 rounded-full flex items-center justify-center text-white text-xs text-center p-2 shadow-md">
              Exemples
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 border-t bg-white">
        <div className="flex gap-2 mb-3">
          <button className="flex-1 py-2 bg-purple-100 rounded-lg text-purple-700 text-sm">
            + Ajouter
          </button>
          <button className="flex-1 py-2 bg-blue-100 rounded-lg text-blue-700 text-sm">
            📤 Partager
          </button>
          <button className="flex-1 py-2 bg-green-100 rounded-lg text-green-700 text-sm">
            💾 Sauver
          </button>
        </div>
        <button className="w-full py-3 bg-purple-600 text-white rounded-xl font-semibold">
          🦊 Demander à Foxie d'enrichir
        </button>
      </div>
    </div>
  );
}

// ============================================
// SCREEN: Progress
// ============================================
function ProgressScreen() {
  const subjects = [
    { name: 'Maths', progress: 75, color: 'bg-blue-500', emoji: '🧮' },
    { name: 'Français', progress: 60, color: 'bg-green-500', emoji: '📖' },
    { name: 'Histoire', progress: 45, color: 'bg-orange-500', emoji: '🏛️' },
    { name: 'Sciences', progress: 80, color: 'bg-purple-500', emoji: '🔬' },
  ];

  return (
    <div className="h-full bg-gray-50 pt-8">
      {/* Header */}
      <div className="bg-white px-4 pb-4">
        <h1 className="text-lg font-bold text-gray-800">📊 Progression</h1>
        <p className="text-sm text-gray-500">Victoire • CE2</p>
      </div>

      {/* Stats Cards */}
      <div className="px-4 py-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-xl p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-purple-600">15</p>
            <p className="text-xs text-gray-500">Jours 🔥</p>
          </div>
          <div className="bg-white rounded-xl p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-green-600">42</p>
            <p className="text-xs text-gray-500">Exercices</p>
          </div>
          <div className="bg-white rounded-xl p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-blue-600">8</p>
            <p className="text-xs text-gray-500">Mind Maps</p>
          </div>
        </div>
      </div>

      {/* Subjects */}
      <div className="px-4">
        <h2 className="text-sm font-semibold text-gray-500 mb-3">Par matière</h2>
        <div className="space-y-3">
          {subjects.map((subject, i) => (
            <div key={i} className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{subject.emoji}</span>
                  <span className="font-medium">{subject.name}</span>
                </div>
                <span className="text-sm font-bold text-gray-600">{subject.progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className={`${subject.color} h-2 rounded-full transition-all`}
                  style={{ width: `${subject.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Weekly chart placeholder */}
      <div className="px-4 mt-4">
        <h2 className="text-sm font-semibold text-gray-500 mb-3">Cette semaine</h2>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-end justify-between h-24">
            {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div 
                  className="w-6 bg-purple-200 rounded-t"
                  style={{ height: `${Math.random() * 60 + 20}px` }}
                />
                <span className="text-xs text-gray-400">{day}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// SCREEN: Parent Dashboard
// ============================================
function ParentScreen() {
  return (
    <div className="h-full bg-gray-50 pt-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-4 pb-6 pt-2">
        <h1 className="text-lg font-bold">👨‍👩‍👧 Espace Parent</h1>
        <p className="text-purple-200 text-sm">Vue d'ensemble de la famille</p>
      </div>

      {/* Subscription Card */}
      <div className="px-4 -mt-4">
        <div className="bg-white rounded-xl p-4 shadow-lg border-l-4 border-purple-500">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-500">Abonnement</p>
              <p className="font-bold text-purple-700">Famille 👨‍👩‍👧‍👦</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">5,99€</p>
              <p className="text-xs text-gray-500">/mois</p>
            </div>
          </div>
        </div>
      </div>

      {/* Children Summary */}
      <div className="px-4 mt-4">
        <h2 className="text-sm font-semibold text-gray-500 mb-3">Activité des enfants</h2>
        
        {[
          { name: 'Gauthier', time: '45 min', exercises: 8, status: 'active' },
          { name: 'Charles', time: '30 min', exercises: 5, status: 'active' },
          { name: 'Victoire', time: '1h 15', exercises: 12, status: 'done' },
        ].map((child, i) => (
          <div key={i} className="bg-white rounded-xl p-4 shadow-sm mb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${child.status === 'active' ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className="font-medium">{child.name}</span>
              </div>
              <div className="text-right text-sm">
                <p className="text-gray-600">{child.time} aujourd'hui</p>
                <p className="text-gray-400">{child.exercises} exercices</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Settings */}
      <div className="px-4 mt-4">
        <h2 className="text-sm font-semibold text-gray-500 mb-3">Paramètres rapides</h2>
        <div className="bg-white rounded-xl shadow-sm divide-y">
          {[
            { icon: '🔔', label: 'Notifications', action: 'toggle' },
            { icon: '⏰', label: 'Limites de temps', action: 'arrow' },
            { icon: '📊', label: 'Rapport hebdomadaire', action: 'toggle' },
            { icon: '🔒', label: 'Contrôle parental', action: 'arrow' },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <span className="text-xl">{item.icon}</span>
                <span className="text-gray-700">{item.label}</span>
              </div>
              {item.action === 'toggle' ? (
                <div className="w-12 h-6 bg-purple-600 rounded-full relative">
                  <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full" />
                </div>
              ) : (
                <span className="text-gray-400">→</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Screen Descriptions
// ============================================
function ScreenDescription({ screen }) {
  const descriptions = {
    onboarding: {
      title: '👋 Onboarding',
      purpose: 'Premier contact avec l\'app - créer un lien émotionnel avec Foxie',
      features: [
        'Présentation de Foxie et sa philosophie (ne donne pas les réponses)',
        'Ajout des enfants avec leur niveau scolaire',
        'Configuration initiale rapide (< 2 min)',
        'Ton amical et encourageant',
      ],
      ux: 'Progression par étapes avec indicateur visuel. Pas de création de compte obligatoire au départ (friction minimale).',
    },
    home: {
      title: '🏠 Accueil',
      purpose: 'Hub central - accès rapide à toutes les fonctionnalités',
      features: [
        'Liste des enfants avec streak et progression',
        'Accès direct au chat avec 1 clic',
        'Actions rapides : photo, mind map, stats',
        'Navigation bottom bar intuitive',
      ],
      ux: 'Design "card-based" moderne. Informations clés visibles sans scroll. Gamification visible (streaks 🔥).',
    },
    chat: {
      title: '🦊 Chat Foxie',
      purpose: 'Cœur de l\'app - interaction socratique avec le tuteur IA',
      features: [
        'Interface chat familière (style WhatsApp/iMessage)',
        'Foxie pose des questions au lieu de donner les réponses',
        'Suggestions rapides (matières, photo devoir)',
        'Indicateur "typing" pour sentiment de présence',
      ],
      ux: 'Méthode socratique : Foxie guide vers la réponse par le questionnement. Jamais de réponse directe.',
    },
    photo: {
      title: '📸 Photo Devoir',
      purpose: 'Capturer un exercice pour que Foxie l\'analyse',
      features: [
        'Interface caméra avec guide de cadrage',
        'Preview avant envoi',
        'Analyse IA avec feedback visuel',
        'Propositions d\'aide adaptées au problème détecté',
      ],
      ux: 'Flow en 4 étapes : capture → preview → analyse → résultat. Animation Foxie pendant l\'analyse pour engagement.',
    },
    mindmap: {
      title: '🧠 Mind Map',
      purpose: 'Visualiser et structurer les connaissances',
      features: [
        'Génération automatique par Foxie',
        'Édition manuelle possible',
        'Export et partage',
        'Enrichissement IA à la demande',
      ],
      ux: 'Visualisation interactive des concepts. Aide à la mémorisation et à la compréhension des liens entre notions.',
    },
    progress: {
      title: '📊 Progression',
      purpose: 'Suivre les progrès et maintenir la motivation',
      features: [
        'Stats globales (streak, exercices, mind maps)',
        'Progression par matière avec barres visuelles',
        'Graphique d\'activité hebdomadaire',
        'Badges et récompenses (gamification)',
      ],
      ux: 'Données positives et encourageantes. Focus sur l\'effort, pas juste les résultats.',
    },
    parent: {
      title: '👨‍👩‍👧 Espace Parent',
      purpose: 'Contrôle, visibilité et gestion de l\'abonnement',
      features: [
        'Vue d\'ensemble de tous les enfants',
        'Temps passé et activité par enfant',
        'Paramètres de notification et limites',
        'Gestion de l\'abonnement',
      ],
      ux: 'Interface séparée pour les parents. Contrôle sans intrusion dans l\'expérience enfant.',
    },
  };

  const desc = descriptions[screen];

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-2">{desc.title}</h2>
      <p className="text-purple-600 font-medium mb-4">{desc.purpose}</p>
      
      <div className="mb-6">
        <h3 className="font-semibold text-gray-700 mb-2">✨ Fonctionnalités</h3>
        <ul className="space-y-2">
          {desc.features.map((feature, i) => (
            <li key={i} className="flex items-start gap-2 text-gray-600">
              <span className="text-purple-500 mt-1">•</span>
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-purple-50 rounded-xl p-4">
        <h3 className="font-semibold text-purple-700 mb-2">💡 Notes UX</h3>
        <p className="text-purple-600 text-sm">{desc.ux}</p>
      </div>
    </div>
  );
}
