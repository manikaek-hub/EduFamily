const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const { spawn } = require('child_process');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function searchRAG(query, niveau, matiere) {
  return new Promise((resolve, reject) => {
    const args = ['search_rag.py', query, niveau];
    if (matiere) args.push(matiere);
    
    const python = spawn('python3', args);
    let result = '';
    
    python.stdout.on('data', (data) => {
      result += data.toString();
    });
    
    python.stderr.on('data', (data) => {
      console.error('RAG Error:', data.toString());
    });
    
    python.on('close', (code) => {
      if (code === 0 && result) {
        try {
          resolve(JSON.parse(result));
        } catch (e) {
          resolve([]);
        }
      } else {
        resolve([]);
      }
    });
  });
}

function buildSystemPrompt(child, fiches) {
  let context = '';
  
  if (fiches && fiches.length > 0) {
    context = '\n\n[CONTEXTE PÉDAGOGIQUE]\n';
    fiches.forEach((fiche, i) => {
      context += `\n--- Fiche ${i+1}: ${fiche.concept} ---\n`;
      if (fiche.definition) context += `Définition: ${fiche.definition}\n`;
      if (fiche.methode) context += `Méthode: ${fiche.methode.slice(0,3).join(' | ')}\n`;
      if (fiche.erreurs_frequentes) context += `Erreurs fréquentes: ${fiche.erreurs_frequentes.slice(0,2).join(', ')}\n`;
      if (fiche.questions_socratiques) context += `Questions à poser: ${fiche.questions_socratiques.slice(0,2).join(' / ')}\n`;
    });
    context += '\n[FIN CONTEXTE]\n';
  }

  return `Tu es Foxie 🦊, un tuteur IA bienveillant pour les devoirs.
Tu aides ${child.name}, ${child.age} ans, en classe de ${child.level}.

RÈGLES ABSOLUES:
1. Tu ne donnes JAMAIS les réponses directement
2. Tu guides par des questions (méthode socratique)
3. Tu adaptes ton langage à l'âge de l'enfant
4. Tu es encourageant et patient
5. Tes réponses sont courtes (2-4 phrases max)
6. IMPORTANT - Pour les calculs posés, utilise TOUJOURS ce format exact avec les espaces:

\`\`\`
  45
+ 38
----
\`\`\`

Cela aide l'enfant à visualiser comme sur son cahier.

Si l'enfant est frustré, reconnais son émotion d'abord.
Utilise des emojis avec modération.
Termine souvent par une question pour faire réfléchir.

UTILISE le contexte pédagogique ci-dessous pour guider l'enfant avec la bonne méthode, mais ne récite jamais le contexte directement !
${context}`;
}

app.post('/api/chat', async (req, res) => {
  try {
    const { message, child, history, image } = req.body;

    const lower = message.toLowerCase();
    let matiere = null;
    if (lower.includes('math') || lower.includes('calcul') || lower.includes('équation') || lower.includes('fraction')) {
      matiere = 'maths';
    } else if (lower.includes('français') || lower.includes('conjugaison') || lower.includes('verbe') || lower.includes('grammaire')) {
      matiere = 'français';
    }

    console.log(`🔍 Recherche RAG: "${message.substring(0,30)}..." (${child.level}, ${matiere || 'toutes matières'})`);
    const fiches = await searchRAG(message, child.level, matiere);
    console.log(`📚 ${fiches.length} fiche(s) trouvée(s)`);

    const messages = history.map(msg => ({
      role: msg.from === 'user' ? 'user' : 'assistant',
      content: msg.text,
    }));

    // Si image présente, créer un message avec image
    if (image) {
      console.log('📸 Image reçue !');
      messages.push({
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
          { type: 'text', text: message || "Voici mon exercice. Peux-tu m'aider ?" }
        ],
      });
    } else {
      messages.push({ role: 'user', content: message });
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: buildSystemPrompt(child, fiches),
      messages: messages,
    });

    res.json({ success: true, response: response.content[0].text });

  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`🦊 Serveur Foxie + RAG démarré sur http://localhost:3001`);
});
