import React, { useState } from 'react';

const ArchitectureDiagram = () => {
  const [activeLayer, setActiveLayer] = useState(null);
  
  const layers = {
    frontend: {
      title: "Frontend Layer",
      color: "#6C5CE7",
      description: "Apps mobiles (iOS/Android) + Web App React",
      tech: ["React Native", "Next.js", "TailwindCSS"]
    },
    api: {
      title: "API Gateway",
      color: "#00CEC9",
      description: "Orchestration des requêtes, auth, rate limiting",
      tech: ["FastAPI", "JWT Auth", "Redis Cache"]
    },
    agents: {
      title: "Agent Orchestrator",
      color: "#FF7675",
      description: "Coordination des agents autonomes",
      tech: ["LangChain", "CrewAI", "Celery"]
    },
    embeddings: {
      title: "Embedding Engine",
      color: "#FDCB6E",
      description: "Génération et stockage des vecteurs famille",
      tech: ["sentence-transformers", "Pinecone", "PostgreSQL+pgvector"]
    },
    llm: {
      title: "LLM Layer",
      color: "#A29BFE",
      description: "Intelligence conversationnelle",
      tech: ["Claude API", "Prompt Engineering", "RAG"]
    },
    integrations: {
      title: "External Integrations",
      color: "#74B9FF",
      description: "Connexions aux services tiers",
      tech: ["Pronote API", "Hachette API", "Doctolib", "Google Calendar"]
    }
  };

  const agents = [
    { name: "Planning", icon: "🗓️", desc: "Sync calendrier, créneaux optimaux" },
    { name: "Révisions", icon: "📚", desc: "Détection contrôles, programmes" },
    { name: "Santé", icon: "🏥", desc: "RDV médicaux, rappels vaccins" },
    { name: "Vacances", icon: "🏖️", desc: "Activités selon passions" },
    { name: "Garde", icon: "👶", desc: "Planning nounou, backups" },
  ];

  const embedDimensions = [
    "Âge & Classe",
    "Style apprentissage",
    "Matières fortes/faibles",
    "Caractère",
    "Passions",
    "Rythme circadien",
    "Contraintes santé",
    "Historique interactions"
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 p-8 text-white">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-2">🦊 EduFamily</h1>
          <h2 className="text-2xl text-gray-300">Architecture Technique</h2>
          <p className="text-gray-400 mt-2">Cliquez sur les composants pour plus de détails</p>
        </div>

        {/* Main Architecture Grid */}
        <div className="grid grid-cols-12 gap-4 mb-8">
          
          {/* Frontend Layer */}
          <div 
            className="col-span-12 p-4 rounded-xl cursor-pointer transition-all hover:scale-[1.02]"
            style={{ backgroundColor: activeLayer === 'frontend' ? layers.frontend.color : '#374151' }}
            onClick={() => setActiveLayer(activeLayer === 'frontend' ? null : 'frontend')}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📱</span>
                <div>
                  <h3 className="font-bold">Frontend Layer</h3>
                  <p className="text-sm opacity-80">Mobile Apps + Web Dashboard</p>
                </div>
              </div>
              <div className="flex gap-2">
                <span className="px-3 py-1 bg-black/20 rounded-full text-xs">iOS</span>
                <span className="px-3 py-1 bg-black/20 rounded-full text-xs">Android</span>
                <span className="px-3 py-1 bg-black/20 rounded-full text-xs">Web</span>
              </div>
            </div>
          </div>

          {/* API Gateway */}
          <div 
            className="col-span-12 p-4 rounded-xl cursor-pointer transition-all hover:scale-[1.02]"
            style={{ backgroundColor: activeLayer === 'api' ? layers.api.color : '#374151' }}
            onClick={() => setActiveLayer(activeLayer === 'api' ? null : 'api')}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🔀</span>
                <div>
                  <h3 className="font-bold">API Gateway</h3>
                  <p className="text-sm opacity-80">FastAPI + Auth + Rate Limiting</p>
                </div>
              </div>
              <div className="flex gap-2">
                <span className="px-3 py-1 bg-black/20 rounded-full text-xs">REST</span>
                <span className="px-3 py-1 bg-black/20 rounded-full text-xs">WebSocket</span>
                <span className="px-3 py-1 bg-black/20 rounded-full text-xs">GraphQL</span>
              </div>
            </div>
          </div>

          {/* Middle Layer - Agents + Embeddings + LLM */}
          <div className="col-span-12 grid grid-cols-3 gap-4">
            
            {/* Agent Orchestrator */}
            <div 
              className="p-4 rounded-xl cursor-pointer transition-all hover:scale-[1.02]"
              style={{ backgroundColor: activeLayer === 'agents' ? layers.agents.color : '#374151' }}
              onClick={() => setActiveLayer(activeLayer === 'agents' ? null : 'agents')}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">🤖</span>
                <h3 className="font-bold">Agent Orchestrator</h3>
              </div>
              <div className="space-y-2">
                {agents.map((agent, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm bg-black/20 p-2 rounded-lg">
                    <span>{agent.icon}</span>
                    <span>{agent.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Embedding Engine */}
            <div 
              className="p-4 rounded-xl cursor-pointer transition-all hover:scale-[1.02]"
              style={{ backgroundColor: activeLayer === 'embeddings' ? layers.embeddings.color : '#374151' }}
              onClick={() => setActiveLayer(activeLayer === 'embeddings' ? null : 'embeddings')}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">🧠</span>
                <h3 className="font-bold">Embedding Engine</h3>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {embedDimensions.map((dim, i) => (
                  <div key={i} className="text-xs bg-black/20 p-1.5 rounded text-center">
                    {dim}
                  </div>
                ))}
              </div>
              <div className="mt-3 text-center">
                <span className="px-3 py-1 bg-black/30 rounded-full text-xs">384 dimensions</span>
              </div>
            </div>

            {/* LLM Layer */}
            <div 
              className="p-4 rounded-xl cursor-pointer transition-all hover:scale-[1.02]"
              style={{ backgroundColor: activeLayer === 'llm' ? layers.llm.color : '#374151' }}
              onClick={() => setActiveLayer(activeLayer === 'llm' ? null : 'llm')}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">💬</span>
                <h3 className="font-bold">LLM Layer</h3>
              </div>
              <div className="space-y-2">
                <div className="bg-black/20 p-3 rounded-lg">
                  <p className="text-xs font-semibold mb-1">Claude API</p>
                  <p className="text-xs opacity-70">Conversations Foxie</p>
                </div>
                <div className="bg-black/20 p-3 rounded-lg">
                  <p className="text-xs font-semibold mb-1">RAG Pipeline</p>
                  <p className="text-xs opacity-70">Manuels + Contexte</p>
                </div>
                <div className="bg-black/20 p-3 rounded-lg">
                  <p className="text-xs font-semibold mb-1">Prompt Templates</p>
                  <p className="text-xs opacity-70">Socratique strict</p>
                </div>
              </div>
            </div>
          </div>

          {/* Data Layer */}
          <div className="col-span-12 grid grid-cols-4 gap-4">
            <div className="bg-gray-700 p-3 rounded-xl text-center">
              <span className="text-2xl">🐘</span>
              <p className="text-sm font-semibold mt-1">PostgreSQL</p>
              <p className="text-xs opacity-70">Users, Families</p>
            </div>
            <div className="bg-gray-700 p-3 rounded-xl text-center">
              <span className="text-2xl">🌲</span>
              <p className="text-sm font-semibold mt-1">Pinecone</p>
              <p className="text-xs opacity-70">Vector Store</p>
            </div>
            <div className="bg-gray-700 p-3 rounded-xl text-center">
              <span className="text-2xl">🔴</span>
              <p className="text-sm font-semibold mt-1">Redis</p>
              <p className="text-xs opacity-70">Cache, Sessions</p>
            </div>
            <div className="bg-gray-700 p-3 rounded-xl text-center">
              <span className="text-2xl">📦</span>
              <p className="text-sm font-semibold mt-1">S3</p>
              <p className="text-xs opacity-70">Documents, Images</p>
            </div>
          </div>

          {/* External Integrations */}
          <div 
            className="col-span-12 p-4 rounded-xl cursor-pointer transition-all hover:scale-[1.02]"
            style={{ backgroundColor: activeLayer === 'integrations' ? layers.integrations.color : '#374151' }}
            onClick={() => setActiveLayer(activeLayer === 'integrations' ? null : 'integrations')}
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">🔌</span>
              <h3 className="font-bold">External Integrations</h3>
            </div>
            <div className="flex gap-3 flex-wrap">
              <div className="bg-black/20 px-4 py-2 rounded-lg flex items-center gap-2">
                <span>📊</span><span className="text-sm">Pronote</span>
              </div>
              <div className="bg-black/20 px-4 py-2 rounded-lg flex items-center gap-2">
                <span>📘</span><span className="text-sm">Hachette</span>
              </div>
              <div className="bg-black/20 px-4 py-2 rounded-lg flex items-center gap-2">
                <span>📗</span><span className="text-sm">Nathan</span>
              </div>
              <div className="bg-black/20 px-4 py-2 rounded-lg flex items-center gap-2">
                <span>🏥</span><span className="text-sm">Doctolib</span>
              </div>
              <div className="bg-black/20 px-4 py-2 rounded-lg flex items-center gap-2">
                <span>📅</span><span className="text-sm">Google Calendar</span>
              </div>
              <div className="bg-black/20 px-4 py-2 rounded-lg flex items-center gap-2">
                <span>🔔</span><span className="text-sm">FCM/APNs</span>
              </div>
            </div>
          </div>
        </div>

        {/* Detail Panel */}
        {activeLayer && (
          <div 
            className="p-6 rounded-xl mb-8 transition-all"
            style={{ backgroundColor: layers[activeLayer].color }}
          >
            <h3 className="text-xl font-bold mb-2">{layers[activeLayer].title}</h3>
            <p className="opacity-90 mb-4">{layers[activeLayer].description}</p>
            <div className="flex gap-2 flex-wrap">
              {layers[activeLayer].tech.map((t, i) => (
                <span key={i} className="px-3 py-1 bg-white/20 rounded-full text-sm">{t}</span>
              ))}
            </div>
          </div>
        )}

        {/* Data Flow Legend */}
        <div className="bg-gray-800 p-6 rounded-xl">
          <h3 className="font-bold mb-4">🔄 Flux de données type</h3>
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <span className="bg-gray-700 px-3 py-1 rounded">📸 Photo devoir</span>
            <span>→</span>
            <span className="bg-gray-700 px-3 py-1 rounded">🔀 API</span>
            <span>→</span>
            <span className="bg-gray-700 px-3 py-1 rounded">🔍 OCR</span>
            <span>→</span>
            <span className="bg-gray-700 px-3 py-1 rounded">🧠 Embedding lookup</span>
            <span>→</span>
            <span className="bg-gray-700 px-3 py-1 rounded">💬 Claude + contexte enfant</span>
            <span>→</span>
            <span className="bg-gray-700 px-3 py-1 rounded">🦊 Réponse Foxie personnalisée</span>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ArchitectureDiagram;
