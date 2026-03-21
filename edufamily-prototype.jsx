import React, { useState, useRef, useEffect } from 'react';

// Simulated AI responses (in production = Claude API)
const simulateAIResponse = (message, mode, lessonContext) => {
  const lowerMessage = message.toLowerCase();
  
  if (mode === 'parent' && lessonContext) {
    return {
      summary: "Cette leçon porte sur les fractions. L'essentiel à retenir :",
      keyPoints: [
        "Une fraction représente une partie d'un tout",
        "Le numérateur (en haut) = combien de parts on prend",
        "Le dénominateur (en bas) = en combien de parts on divise"
      ],
      helpTip: "Utilisez des exemples concrets : couper une pizza, partager des bonbons..."
    };
  }
  
  // Socratic mode - never give direct answers
  if (lowerMessage.includes('réponse') || lowerMessage.includes('combien')) {
    return "Bonne question ! 🤔 Avant de te donner la réponse, réfléchissons ensemble. Qu'est-ce que tu as déjà essayé ?";
  }
  if (lowerMessage.includes('fraction')) {
    return "Les fractions, c'est comme couper un gâteau ! 🎂 Si tu coupes en 4 parts égales et tu en prends 1, quelle fraction as-tu ?";
  }
  if (lowerMessage.includes('comprends pas') || lowerMessage.includes('difficile')) {
    return "C'est normal de trouver ça difficile ! 💪 Dis-moi ce que tu comprends déjà, on partira de là.";
  }
  if (lowerMessage.includes('1/4') || lowerMessage.includes('quart')) {
    return "Excellent ! 🌟 Maintenant, si tu prends 2 parts sur 4, quelle fraction ça fait ?";
  }
  return "Intéressant ! 🧠 Peux-tu m'en dire plus ? Il n'y a pas de mauvaise réponse !";
};

// Mind Map Component
const MindMap = ({ topic, concepts }) => {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'];
  return (
    <div style={{ background: '#fff', borderRadius: 20, padding: 16, marginTop: 16 }}>
      <svg viewBox="0 0 400 280" style={{ width: '100%', maxHeight: 260 }}>
        <circle cx="200" cy="140" r="40" fill="#6C5CE7" />
        <text x="200" y="145" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">{topic}</text>
        {concepts.map((c, i) => {
          const angle = (i * 360 / concepts.length - 90) * (Math.PI / 180);
          const x = 200 + Math.cos(angle) * 110;
          const y = 140 + Math.sin(angle) * 90;
          return (
            <g key={i}>
              <line x1={200 + Math.cos(angle) * 40} y1={140 + Math.sin(angle) * 40} x2={x} y2={y} stroke={colors[i]} strokeWidth="2" strokeDasharray="4,4" />
              <circle cx={x} cy={y} r="32" fill={colors[i]} />
              <text x={x} y={y + 4} textAnchor="middle" fill="white" fontSize="9" fontWeight="500">{c}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// Chat Message
const ChatMessage = ({ message, isUser, isTyping }) => (
  <div style={{ display: 'flex', gap: 10, flexDirection: isUser ? 'row-reverse' : 'row', marginBottom: 12 }}>
    <div style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, background: isUser ? 'linear-gradient(135deg, #A29BFE, #6C5CE7)' : 'linear-gradient(135deg, #FAB1A0, #FF7675)' }}>
      {isUser ? '👤' : '🦊'}
    </div>
    <div style={{ maxWidth: '75%', padding: '12px 16px', borderRadius: 16, fontSize: 15, lineHeight: 1.5, whiteSpace: 'pre-wrap', background: isUser ? 'linear-gradient(135deg, #6C5CE7, #5849C2)' : '#fff', color: isUser ? '#fff' : '#2D3436', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
      {isTyping ? <span style={{ display: 'flex', gap: 4 }}><span style={{ width: 6, height: 6, background: '#B2BEC3', borderRadius: '50%', animation: 'pulse 1s infinite' }}></span><span style={{ width: 6, height: 6, background: '#B2BEC3', borderRadius: '50%', animation: 'pulse 1s infinite 0.2s' }}></span><span style={{ width: 6, height: 6, background: '#B2BEC3', borderRadius: '50%', animation: 'pulse 1s infinite 0.4s' }}></span></span> : message}
    </div>
  </div>
);

// Main App
export default function EduFamily() {
  const [mode, setMode] = useState('landing');
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [lessonContext, setLessonContext] = useState(null);
  const [parentSummary, setParentSummary] = useState(null);
  const [childName, setChildName] = useState('');
  const [showMindMap, setShowMindMap] = useState(false);
  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setUploadedImage(ev.target.result);
        setTimeout(() => {
          setLessonContext({ subject: "Mathématiques", topic: "Les Fractions" });
          if (mode === 'parent') setParentSummary(simulateAIResponse('', 'parent', true));
        }, 1200);
      };
      reader.readAsDataURL(file);
    }
  };

  const sendMessage = () => {
    if (!inputValue.trim()) return;
    setMessages(prev => [...prev, { text: inputValue, isUser: true }]);
    setInputValue('');
    setIsTyping(true);
    setTimeout(() => {
      setMessages(prev => [...prev, { text: simulateAIResponse(inputValue, mode, lessonContext), isUser: false }]);
      setIsTyping(false);
    }, 1000 + Math.random() * 800);
  };

  const startMode = (m) => {
    setMode(m);
    setMessages([]);
    setUploadedImage(null);
    setLessonContext(null);
    setParentSummary(null);
    setShowMindMap(false);
    if (m === 'child') {
      setTimeout(() => setMessages([{ text: `Salut${childName ? ' ' + childName : ''} ! 👋 Je suis Foxie, ton compagnon d'apprentissage. Je ne te donnerai jamais la réponse directement — mon but c'est de t'aider à trouver par toi-même ! 🧠✨\n\nSur quoi tu travailles aujourd'hui ?`, isUser: false }]), 400);
    }
  };

  const styles = {
    container: { minHeight: '100vh', fontFamily: "'Nunito', sans-serif", background: 'linear-gradient(135deg, #FFF9F0 0%, #FFF5E6 50%, #F0E6FF 100%)' },
    header: { padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 },
    logo: { display: 'flex', alignItems: 'center', gap: 10 },
    logoIcon: { fontSize: 40 },
    logoText: { fontSize: 28, fontWeight: 700, background: 'linear-gradient(135deg, #6C5CE7, #FF7675)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
    tagline: { fontSize: 14, color: '#636E72', fontWeight: 600 },
    main: { padding: '0 24px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 },
    title: { textAlign: 'center' },
    titleLine1: { display: 'block', fontSize: 48, fontWeight: 800, color: '#2D3436', lineHeight: 1.1 },
    titleLine2: { display: 'block', fontSize: 48, fontWeight: 800, background: 'linear-gradient(135deg, #6C5CE7, #00CEC9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1.1 },
    description: { textAlign: 'center', fontSize: 16, color: '#636E72', lineHeight: 1.6, maxWidth: 420 },
    nameInput: { padding: '14px 20px', border: '2px solid #A29BFE', borderRadius: 50, fontSize: 15, width: 260, textAlign: 'center', background: '#fff', outline: 'none' },
    cards: { display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' },
    card: { background: '#fff', border: 'none', borderRadius: 24, padding: 24, width: 280, cursor: 'pointer', textAlign: 'left', boxShadow: '0 4px 20px rgba(108,92,231,0.1)', transition: 'transform 0.3s, box-shadow 0.3s', position: 'relative', overflow: 'hidden' },
    cardIcon: { fontSize: 40, marginBottom: 12 },
    cardTitle: { fontSize: 20, fontWeight: 700, marginBottom: 6, color: '#2D3436' },
    cardDesc: { fontSize: 14, color: '#636E72', marginBottom: 12, lineHeight: 1.4 },
    cardFeatures: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 },
    cardFeature: { fontSize: 13, color: '#636E72' },
    badges: { display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' },
    badge: { background: '#fff', padding: '8px 16px', borderRadius: 50, fontSize: 13, fontWeight: 600, color: '#636E72', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' },
    footer: { padding: 24, textAlign: 'center', color: '#B2BEC3', fontSize: 13 },
    appHeader: { display: 'flex', alignItems: 'center', padding: '12px 20px', background: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', gap: 12 },
    backBtn: { background: 'none', border: 'none', fontSize: 15, color: '#636E72', cursor: 'pointer', padding: 8 },
    modeBadge: { padding: '8px 16px', borderRadius: 50, fontSize: 14, fontWeight: 700, color: '#fff' },
    uploadZone: { border: '3px dashed #A29BFE', borderRadius: 24, padding: '48px 24px', cursor: 'pointer', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, transition: 'all 0.3s' },
    uploadIcon: { fontSize: 48, opacity: 0.5 },
    uploadText: { color: '#636E72', fontWeight: 600 },
    summary: { background: '#fff', borderRadius: 24, padding: 20, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' },
    summaryHeader: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 },
    summaryIcon: { fontSize: 24 },
    summaryTitle: { fontSize: 18, fontWeight: 700, color: '#2D3436' },
    keyPoints: { listStyle: 'none', padding: 0, margin: '12px 0', display: 'flex', flexDirection: 'column', gap: 8 },
    keyPoint: { paddingLeft: 24, position: 'relative', color: '#636E72', fontSize: 14 },
    helpTip: { display: 'flex', gap: 10, marginTop: 16, padding: 14, background: 'linear-gradient(135deg, #FFF9E6, #FFF5F0)', borderRadius: 14 },
    tipIcon: { fontSize: 20 },
    tipText: { fontSize: 14, color: '#2D3436', lineHeight: 1.5, margin: 0 },
    chatMain: { flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 600, margin: '0 auto', width: '100%', padding: 16 },
    chatMessages: { flex: 1, overflowY: 'auto', padding: 12 },
    chatInputContainer: { padding: 16, background: '#fff', borderRadius: '24px 24px 0 0', boxShadow: '0 -4px 20px rgba(0,0,0,0.05)' },
    chatInputWrapper: { display: 'flex', alignItems: 'center', gap: 10, background: '#F8F4F0', borderRadius: 50, padding: 6 },
    chatInput: { flex: 1, border: 'none', background: 'none', fontSize: 15, padding: 10, outline: 'none' },
    sendBtn: { background: 'linear-gradient(135deg, #6C5CE7, #5849C2)', color: '#fff', border: 'none', width: 42, height: 42, borderRadius: '50%', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    hint: { textAlign: 'center', fontSize: 12, color: '#B2BEC3', marginTop: 10 },
    launchBtn: { background: 'linear-gradient(135deg, #FF7675, #FAB1A0)', color: '#fff', border: 'none', padding: '14px 28px', borderRadius: 50, fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 20, boxShadow: '0 4px 15px rgba(255,118,117,0.3)' },
    mindmapBtn: { background: 'linear-gradient(135deg, #6C5CE7, #A29BFE)', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 50, fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 16 },
  };

  // Landing
  if (mode === 'landing') {
    return (
      <div style={styles.container}>
        <header style={styles.header}>
          <div style={styles.logo}>
            <span style={styles.logoIcon}>🦊</span>
            <span style={styles.logoText}>EduFamily</span>
          </div>
          <div style={styles.tagline}>Le tuteur IA qui apprend à apprendre</div>
        </header>
        <main style={styles.main}>
          <h1 style={styles.title}>
            <span style={styles.titleLine1}>Devoirs</span>
            <span style={styles.titleLine2}>sans stress</span>
          </h1>
          <p style={styles.description}>Un tuteur personnel qui guide vos enfants vers la réflexion, pas vers les réponses toutes faites.</p>
          <input type="text" placeholder="Prénom de l'enfant (optionnel)" value={childName} onChange={(e) => setChildName(e.target.value)} style={styles.nameInput} />
          <div style={styles.cards}>
            <button style={{ ...styles.card, borderTop: '4px solid #6C5CE7' }} onClick={() => startMode('parent')} onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-6px)'; e.currentTarget.style.boxShadow = '0 12px 30px rgba(108,92,231,0.2)'; }} onMouseOut={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(108,92,231,0.1)'; }}>
              <div style={styles.cardIcon}>👨‍👩‍👧</div>
              <h2 style={styles.cardTitle}>Mode Parent</h2>
              <p style={styles.cardDesc}>Comprenez la leçon en 2 minutes</p>
              <ul style={styles.cardFeatures}>
                <li style={styles.cardFeature}>📸 Photo → résumé clair</li>
                <li style={styles.cardFeature}>🗺️ Carte mentale auto</li>
                <li style={styles.cardFeature}>💡 Conseils pour aider</li>
              </ul>
            </button>
            <button style={{ ...styles.card, borderTop: '4px solid #FF7675' }} onClick={() => startMode('child')} onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-6px)'; e.currentTarget.style.boxShadow = '0 12px 30px rgba(255,118,117,0.2)'; }} onMouseOut={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(108,92,231,0.1)'; }}>
              <div style={styles.cardIcon}>🎒</div>
              <h2 style={styles.cardTitle}>Mode Enfant</h2>
              <p style={styles.cardDesc}>Apprends avec Foxie 🦊</p>
              <ul style={styles.cardFeatures}>
                <li style={styles.cardFeature}>🤔 Questions guidées</li>
                <li style={styles.cardFeature}>🚫 Jamais de réponse directe</li>
                <li style={styles.cardFeature}>🌟 Encouragements</li>
              </ul>
            </button>
          </div>
          <div style={styles.badges}>
            <span style={styles.badge}>🔒 Sécurisé</span>
            <span style={styles.badge}>🌍 Multilingue</span>
            <span style={styles.badge}>💰 4,99€/mois</span>
          </div>
        </main>
        <footer style={styles.footer}>Conçu avec ❤️ par une maman de 3 enfants</footer>
      </div>
    );
  }

  // Parent Mode
  if (mode === 'parent') {
    return (
      <div style={{ ...styles.container, background: '#FFF9F0' }}>
        <header style={styles.appHeader}>
          <button style={styles.backBtn} onClick={() => setMode('landing')}>← Retour</button>
          <span style={{ ...styles.modeBadge, background: 'linear-gradient(135deg, #A29BFE, #6C5CE7)' }}>👨‍👩‍👧 Mode Parent</span>
        </header>
        <main style={{ padding: 20, maxWidth: 500, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>📸 Scannez la leçon</h2>
            <p style={{ fontSize: 14, color: '#636E72' }}>Photo du cours → résumé instantané</p>
          </div>
          <div style={{ ...styles.uploadZone, borderColor: uploadedImage ? '#55EFC4' : '#A29BFE', borderStyle: uploadedImage ? 'solid' : 'dashed' }} onClick={() => fileInputRef.current?.click()}>
            {uploadedImage ? <img src={uploadedImage} alt="Leçon" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 16 }} /> : <><div style={styles.uploadIcon}>📷</div><span style={styles.uploadText}>Cliquez pour ajouter une photo</span></>}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
          </div>
          {lessonContext && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, background: 'linear-gradient(135deg, #E8F8F5, #E8F5E9)', borderRadius: 14, marginTop: 16 }}>
              <span style={{ background: '#55EFC4', padding: '4px 12px', borderRadius: 50, fontSize: 13, fontWeight: 700 }}>✅ Détecté</span>
              <span style={{ fontWeight: 600 }}>{lessonContext.subject} — {lessonContext.topic}</span>
            </div>
          )}
          {parentSummary && (
            <div style={styles.summary}>
              <div style={styles.summaryHeader}>
                <span style={styles.summaryIcon}>📚</span>
                <h3 style={styles.summaryTitle}>Résumé pour les parents</h3>
              </div>
              <p style={{ color: '#636E72', lineHeight: 1.6, marginBottom: 12 }}>{parentSummary.summary}</p>
              <ul style={styles.keyPoints}>
                {parentSummary.keyPoints.map((p, i) => <li key={i} style={styles.keyPoint}><span style={{ position: 'absolute', left: 0, color: '#55EFC4', fontWeight: 'bold' }}>✓</span>{p}</li>)}
              </ul>
              <div style={styles.helpTip}>
                <span style={styles.tipIcon}>💡</span>
                <p style={styles.tipText}>{parentSummary.helpTip}</p>
              </div>
            </div>
          )}
          {lessonContext && (
            <>
              <button style={styles.mindmapBtn} onClick={() => setShowMindMap(!showMindMap)}>
                {showMindMap ? '🗺️ Masquer la carte' : '🗺️ Voir la carte mentale'}
              </button>
              {showMindMap && <MindMap topic={lessonContext.topic} concepts={["Numérateur", "Dénominateur", "Partie/Tout", "Équivalence", "Simplifier"]} />}
            </>
          )}
          <button style={styles.launchBtn} onClick={() => startMode('child')}>🎒 Lancer le mode enfant</button>
        </main>
      </div>
    );
  }

  // Child Mode (Chat)
  return (
    <div style={{ ...styles.container, background: 'linear-gradient(180deg, #FFF5F0, #FFF9F0)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={styles.appHeader}>
        <button style={styles.backBtn} onClick={() => setMode('landing')}>← Retour</button>
        <span style={{ ...styles.modeBadge, background: 'linear-gradient(135deg, #FAB1A0, #FF7675)' }}>🦊 Foxie</span>
        {childName && <span style={{ fontSize: 14, color: '#636E72' }}>avec {childName}</span>}
      </header>
      <main style={styles.chatMain}>
        <div style={styles.chatMessages}>
          {messages.map((m, i) => <ChatMessage key={i} message={m.text} isUser={m.isUser} />)}
          {isTyping && <ChatMessage isUser={false} isTyping={true} />}
          <div ref={chatEndRef} />
        </div>
        <div style={styles.chatInputContainer}>
          <div style={styles.chatInputWrapper}>
            <input type="text" style={styles.chatInput} placeholder="Pose ta question ici..." value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && sendMessage()} />
            <button style={{ ...styles.sendBtn, opacity: inputValue.trim() ? 1 : 0.5 }} onClick={sendMessage} disabled={!inputValue.trim()}>➤</button>
          </div>
          <p style={styles.hint}>💡 Dis-moi ce que tu comprends déjà !</p>
        </div>
      </main>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }`}</style>
    </div>
  );
}
