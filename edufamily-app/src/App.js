import React, { useState, useRef, useEffect } from 'react';
import './App.css';

const colors = {
  fond: '#FAF8F5',
  texte: '#3D3D3D',
  texteLight: '#8B8680',
  accent: '#7C9082',
  accentLight: '#E8EEEA',
  warm: '#C4A484',
  warmLight: '#F5EDE4',
  blanc: '#FFFFFF',
  border: '#E8E4DF',
};

const familyData = {
  name: 'Famille Ek',
  children: [
    { id: 1, name: 'Gauthier', level: '4ème', age: 14, initial: 'G' },
    { id: 2, name: 'Charles', level: '6ème', age: 11, initial: 'C' },
    { id: 3, name: 'Victoire', level: 'CE2', age: 8, initial: 'V' },
  ],
};

function App() {
  const [currentView, setCurrentView] = useState('home');
  const [selectedChild, setSelectedChild] = useState(null);
  const [conversation, setConversation] = useState([]);

  const startChat = (child) => {
    setSelectedChild(child);
    setConversation([]);
    setCurrentView('chat');
  };

  return (
    <div style={{minHeight: '100vh', backgroundColor: colors.fond}}>
      <div style={{maxWidth: '448px', margin: '0 auto', backgroundColor: colors.fond, minHeight: '100vh'}}>
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
}function HomeView({ family, onSelectChild }) {
  return (
    <div style={{padding: '40px 24px'}}>
      
      <div style={{marginBottom: '48px'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px'}}>
          <span style={{fontSize: '28px'}}>🦊</span>
          <h1 style={{margin: 0, fontSize: '24px', fontWeight: '600', color: colors.texte, letterSpacing: '-0.5px'}}>
            edufamily
          </h1>
        </div>
        <p style={{margin: 0, fontSize: '15px', color: colors.texteLight}}>
          Bonjour, {family.name}
        </p>
      </div>

      <div style={{marginBottom: '32px'}}>
        <h2 style={{margin: '0 0 20px 0', fontSize: '14px', fontWeight: '500', color: colors.texteLight, textTransform: 'uppercase', letterSpacing: '1px'}}>
          Choisir un profil
        </h2>
        
        {family.children.map((child) => (
          <button
            key={child.id}
            onClick={() => onSelectChild(child)}
            style={{
              width: '100%',
              padding: '20px',
              marginBottom: '12px',
              border: `1px solid ${colors.border}`,
              borderRadius: '16px',
              backgroundColor: colors.blanc,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
            }}
          >
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: colors.accentLight,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              fontWeight: '600',
              color: colors.accent,
            }}>
              {child.initial}
            </div>
            <div style={{textAlign: 'left', flex: 1}}>
              <div style={{fontWeight: '600', fontSize: '16px', color: colors.texte}}>{child.name}</div>
              <div style={{color: colors.texteLight, fontSize: '14px', marginTop: '2px'}}>{child.level} · {child.age} ans</div>
            </div>
            <div style={{color: colors.texteLight, fontSize: '20px'}}>→</div>
          </button>
        ))}
      </div>

      <div style={{padding: '20px', backgroundColor: colors.warmLight, borderRadius: '12px'}}>
        <p style={{margin: 0, fontSize: '14px', color: colors.texte, lineHeight: '1.5'}}>
          <strong>Comment ça marche ?</strong><br/>
          Foxie guide sans donner les réponses. Il aide à réfléchir et comprendre.
        </p>
      </div>
    </div>
  );
}function ChatView({ child, conversation, setConversation, onBack }) {
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation]);

  useEffect(() => {
    setIsTyping(true);
    setTimeout(() => {
      setConversation([{
        id: 1,
        from: 'foxie',
        text: `Bonjour ${child.name} ! Je suis là pour t'accompagner. Sur quoi travailles-tu aujourd'hui ?`,
      }]);
      setIsTyping(false);
    }, 800);
  }, [child.name, setConversation]);

const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result.split(',')[1];
        setSelectedImage(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSend = () => {
    if ((!input.trim() && !selectedImage) || isTyping) return;

    const userMessage = {
      id: Date.now(),
      from: 'user',
      text: input.trim() || "📸 [Photo envoyée]",
      hasImage: !!selectedImage,
    };

    const newConversation = [...conversation, userMessage];
    setConversation(newConversation);
    const currentInput = input;
    const currentImage = selectedImage;
    setInput('');
    setSelectedImage(null);
    setIsTyping(true);

    fetch('http://localhost:3001/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: currentInput || "Voici mon exercice. Peux-tu m'aider ?",
        child: child,
        history: conversation,
        image: currentImage,
      }),
    })
      .then(res => res.json())
      .then(data => {
        const foxieMessage = {
          id: Date.now() + 1,
          from: 'foxie',
          text: data.response,
        };
        setConversation([...newConversation, foxieMessage]);
        setIsTyping(false);
      })
      .catch(err => {
        console.error(err);
        setIsTyping(false);
      });
  };return (
    <div style={{height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: colors.fond}}>
      
      <div style={{padding: '20px 24px', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: '16px', backgroundColor: colors.blanc}}>
        <button onClick={onBack} style={{border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer', color: colors.texte, padding: '4px'}}>←</button>
        <div style={{width: '40px', height: '40px', borderRadius: '10px', backgroundColor: colors.accentLight, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
          <span style={{fontSize: '20px'}}>🦊</span>
        </div>
        <div style={{flex: 1}}>
          <div style={{fontWeight: '600', fontSize: '15px', color: colors.texte}}>Foxie</div>
          <div style={{fontSize: '13px', color: colors.accent}}>Aide {child.name} · {child.level}</div>
        </div>
      </div>

      <div style={{flex: 1, overflowY: 'auto', padding: '24px'}}>
        {conversation.map((msg) => (
          <div key={msg.id} style={{marginBottom: '16px', display: 'flex', justifyContent: msg.from === 'user' ? 'flex-end' : 'flex-start'}}>
            <div style={{
              maxWidth: '85%',
              padding: '14px 18px',
              borderRadius: msg.from === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
              backgroundColor: msg.from === 'user' ? colors.accent : colors.blanc,
              color: msg.from === 'user' ? colors.blanc : colors.texte,
              fontSize: '15px',
              lineHeight: '1.5',
            }}>
              <span style={{whiteSpace: 'pre-wrap'}}>{msg.text}</span>
            </div>
          </div>
        ))}
        {isTyping && (
          <div style={{marginBottom: '16px'}}>
            <div style={{padding: '14px 18px', borderRadius: '18px 18px 18px 4px', backgroundColor: colors.blanc, display: 'inline-block'}}>
              <span style={{color: colors.texteLight}}>...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div style={{padding: '16px 24px 24px', borderTop: `1px solid ${colors.border}`, backgroundColor: colors.blanc}}>
        <div style={{display: 'flex', gap: '12px'}}>
<input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageSelect} style={{display: 'none'}} />
          <button onClick={() => fileInputRef.current?.click()} style={{padding: '14px', borderRadius: '12px', border: `1px solid ${colors.border}`, backgroundColor: selectedImage ? colors.accentLight : colors.fond, cursor: 'pointer', fontSize: '18px'}}>📸</button>
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSend()} placeholder="Écris ta question..." style={{flex: 1, padding: '14px 18px', borderRadius: '12px', border: `1px solid ${colors.border}`, fontSize: '15px', backgroundColor: colors.fond, color: colors.texte, outline: 'none'}} />
          <button onClick={handleSend} style={{padding: '14px 24px', borderRadius: '12px', border: 'none', backgroundColor: colors.accent, color: colors.blanc, cursor: 'pointer', fontSize: '15px', fontWeight: '500'}}>Envoyer</button>        </div>
      </div>
    </div>
  );
}

export default App;
