# 🦊 EduFamily - RAG Curriculum

Système de vectorisation du curriculum pédagogique pour Foxie, le tuteur IA socratique.

## 📋 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Question de l'enfant                    │
│              "Comment résoudre 3x + 5 = 20 ?"              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      1. RECHERCHE RAG                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Pinecone Vector DB                                  │   │
│  │  - Filtre: niveau="6ème", matiere="maths"           │   │
│  │  - Recherche sémantique sur la question             │   │
│  │  → Trouve: "Équations du 1er degré"                 │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   2. CONTEXTE INJECTÉ                       │
│  - Définition de l'équation                                 │
│  - Méthode pas-à-pas                                        │
│  - Erreurs fréquentes à anticiper                           │
│  - Questions socratiques suggérées                          │
│  - Astuces Foxie                                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    3. RÉPONSE FOXIE                         │
│  "Je vois une équation ! 👀 Pour trouver x, il faut        │
│   l'isoler. Qu'est-ce que tu pourrais faire en premier     │
│   pour commencer à 'libérer' le x ?"                       │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Installation

### 1. Prérequis

```bash
# Python 3.9+
python --version

# Installer les dépendances
pip install pinecone-client openai python-dotenv
```

### 2. Configuration

```bash
# Copier le fichier d'exemple
cp .env.example .env

# Éditer avec vos clés API
nano .env
```

**Clés nécessaires:**
- **Pinecone**: Gratuit sur [pinecone.io](https://www.pinecone.io/) (100K vecteurs gratuits)
- **OpenAI**: Pour les embeddings sur [platform.openai.com](https://platform.openai.com/)
- **Anthropic**: Pour Claude/Foxie sur [console.anthropic.com](https://console.anthropic.com/)

### 3. Vectorisation

```bash
# Vectoriser le curriculum (avec API)
python vectorize_curriculum.py

# OU tester la structure sans API
python vectorize_curriculum.py --demo
```

## 📁 Fichiers

| Fichier | Description |
|---------|-------------|
| `edufamily_curriculum.json` | 26 fiches pédagogiques (CE2, 6ème, 4ème) |
| `vectorize_curriculum.py` | Script de vectorisation + FoxieRAG |
| `.env.example` | Template de configuration |

## 📚 Structure du Curriculum

### Niveaux couverts

| Niveau | Maths | Français | Total |
|--------|-------|----------|-------|
| CE2 (Victoire) | 5 | 5 | 10 |
| 6ème (Charles) | 5 | 3 | 8 |
| 4ème (Gauthier) | 5 | 3 | 8 |

### Structure d'une fiche

```json
{
  "id": "6eme-math-002",
  "niveau": "6ème",
  "matiere": "maths",
  "chapitre": "Nombres et calculs",
  "concept": "Additionner des fractions",
  
  "definition": "...",
  "methode": ["1. ...", "2. ...", "3. ..."],
  "erreurs_frequentes": ["...", "..."],
  "exemples": [{"enonce": "...", "solution_guidee": "..."}],
  "astuces_foxie": ["...", "..."],
  "questions_socratiques": ["...", "..."],
  "prerequis": ["...", "..."],
  "mots_cles": ["...", "..."]
}
```

## 🔍 Utilisation dans le code

### Recherche simple

```python
from vectorize_curriculum import CurriculumVectorizer, Config

# Initialiser
config = Config()
vectorizer = CurriculumVectorizer(config)
vectorizer.initialize()

# Rechercher
results = vectorizer.search(
    query="comment calculer l'aire d'un triangle",
    niveau="6ème",
    matiere="maths",
    top_k=2
)

for r in results:
    print(f"{r['concept']} (score: {r['score']:.3f})")
```

### Intégration avec Foxie

```python
from vectorize_curriculum import CurriculumVectorizer, FoxieRAG, Config

# Initialiser
config = Config()
vectorizer = CurriculumVectorizer(config)
vectorizer.initialize()

foxie = FoxieRAG(vectorizer)

# Générer le prompt complet pour Foxie
system_prompt = foxie.build_foxie_prompt(
    question="3x + 5 = 20, c'est quoi x ?",
    child_name="Charles",
    child_level="6ème",
    child_age=11,
    subject="maths",
    passions=["foot", "jeux vidéo"]  # Pour les analogies
)

# Utiliser avec Claude
import anthropic
client = anthropic.Anthropic()

response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=300,
    system=system_prompt,
    messages=[
        {"role": "user", "content": "3x + 5 = 20, c'est quoi x ?"}
    ]
)

print(response.content[0].text)
```

## 💰 Coûts estimés

### Vectorisation initiale (26 fiches)
| Service | Coût |
|---------|------|
| OpenAI Embeddings | ~$0.001 |
| Pinecone Storage | Gratuit (plan free) |

### Utilisation quotidienne (100 requêtes/jour)
| Service | Coût/mois |
|---------|-----------|
| OpenAI Embeddings | ~$0.06 |
| Claude Sonnet | ~$3-5 |
| Pinecone | Gratuit |
| **TOTAL** | **~$5/mois** |

## 🔧 Étendre le curriculum

### Ajouter des fiches

1. Éditer `edufamily_curriculum.json`
2. Ajouter dans la section appropriée (niveau/matière)
3. Relancer la vectorisation

### Générer des fiches avec Claude

```python
prompt = """
Génère une fiche pédagogique pour EduFamily au format JSON:

Sujet: [SUJET]
Niveau: [NIVEAU]

Structure requise:
- id, niveau, matiere, chapitre, concept
- definition (1-2 phrases simples)
- methode (étapes numérotées)
- erreurs_frequentes (3-5 erreurs courantes)
- exemples (2-3 avec solution_guidee)
- astuces_foxie (2-3 tips pour enfants)
- questions_socratiques (3-4 questions pour guider sans donner la réponse)
- prerequis, mots_cles
"""
```

## 🧪 Tests

```bash
# Tester sans API
python vectorize_curriculum.py --demo

# Tester avec API (après configuration .env)
python vectorize_curriculum.py
```

## 📝 Notes importantes

### Ce qui est vectorisé (→ Pinecone)
- ✅ Concepts et définitions
- ✅ Méthodes de résolution
- ✅ Mots-clés
- ✅ Erreurs fréquentes

### Ce qui N'est PAS vectorisé (→ Profil JSON)
- ❌ Passions de l'enfant
- ❌ Historique des conversations
- ❌ Habitudes de travail
- ❌ Progression personnelle

**Pourquoi ?** Éviter le bruit dans les recherches. Les infos personnelles sont injectées directement dans le prompt, pas dans la recherche vectorielle.

## 🦊 Roadmap

- [x] Curriculum de base (26 fiches)
- [x] Script de vectorisation
- [x] Interface FoxieRAG
- [ ] API Backend (FastAPI)
- [ ] Intégration prototype React
- [ ] Ajout matières (histoire, sciences, anglais)
- [ ] Génération automatique de fiches

---

Fait avec 💜 pour Gauthier, Charles et Victoire
