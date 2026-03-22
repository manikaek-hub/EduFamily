# Family Flow — Spécifications Techniques

## Vision

Family Flow est un tuteur IA adaptatif pour enfants du CP à la 3ème, aligné sur les programmes officiels de l'Éducation Nationale française. L'objectif est de construire un système qui comprend comment chaque enfant apprend, détecte ses difficultés en temps réel, et adapte sa pédagogie de manière causale — pas juste corrélative.

---

## 1. Architecture actuelle (v1 — MVP)

**Stack technique :**
- Frontend : React 19, Tailwind CSS (custom theme)
- Backend : Express.js, SQLite
- IA : Claude Sonnet 4 via Anthropic SDK
- Knowledge Base : `familyflow_curriculum.json` (117 fiches, 9 niveaux, 7 matières)

**Design System :**
- Palette : fond `#FAF8F5`, texte `#3D3D3D`, accent sage green `#7C9082`, warm `#C4A484`
- Style : moderne, chaleureux, mobile-first
- Chat : interface conversationnelle avec avatar Foxie, bulles gradient, typing indicator

**Pédagogie actuelle (prompt engineering) :**
- MODE 1 : enfant en difficulté (mastery ≤ 2/5) → socratique doux, micro-étapes
- MODE 2 : enfant à l'aise (mastery ≥ 3/5) → défis, approfondissement
- Contexte injecté : fiches programme (méthode, erreurs fréquentes, exemples guidés, astuces Foxie)

---

## 2. Architecture cible — Système Multi-Agents

### Pourquoi des agents ?

Un LLM seul avec du prompt engineering atteint un plafond. Il ne peut pas :
- Apprendre des patterns sur la durée (chaque session repart de zéro sans mémoire structurée)
- Distinguer corrélation et causalité dans les difficultés d'un enfant
- Optimiser sa stratégie pédagogique par essai-erreur
- Détecter des signaux faibles (désengagement progressif, fatigue cognitive)

L'architecture multi-agents résout ça en séparant les responsabilités.

### Vue d'ensemble des agents

```
┌─────────────────────────────────────────────────────────────────┐
│                        FAMILY FLOW                              │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   AGENT 1    │  │   AGENT 2    │  │      AGENT 3         │  │
│  │  Collecteur  │  │  Planifieur  │  │      Causal          │  │
│  │  de Données  │  │  Adaptatif   │  │   (Diagnostic)       │  │
│  │              │  │              │  │                      │  │
│  │ Observe      │  │ Ajuste le    │  │ Comprend POURQUOI    │  │
│  │ Annote       │  │ programme    │  │ l'enfant bloque      │  │
│  │ Structure    │  │ de révision  │  │ et recommande         │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         │                 │                      │              │
│         ▼                 ▼                      ▼              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              AGENT 4 — Orchestrateur Foxie              │   │
│  │     Synthétise tout et parle à l'enfant/parent          │   │
│  └──────────────────────────┬──────────────────────────────┘   │
│                             │                                   │
│  ┌──────────────┐  ┌───────┴────────┐  ┌──────────────────┐   │
│  │   AGENT 5    │  │   AGENT 6      │  │    AGENT 7       │   │
│  │  Engagement  │  │  Style         │  │   Coach Parent   │   │
│  │  & Motivation│  │  d'Apprentiss. │  │                  │   │
│  └──────────────┘  └────────────────┘  └──────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### AGENT 1 — Collecteur de Données d'Entraînement

**Rôle :** Observer chaque interaction et structurer les données pour le fine-tuning futur.

**Ce qu'il capture :**
- Paires (question Foxie → réponse enfant) avec métadonnées (temps de réponse, nb tentatives, abandon)
- Classification automatique : réponse correcte / partiellement correcte / incorrecte / hors-sujet
- Type d'erreur : conceptuelle, calcul, lecture d'énoncé, inattention, méconnaissance du vocabulaire
- Signal émotionnel : longueur de réponse, ponctuation, émojis, temps avant réponse, pattern d'abandon
- Efficacité de l'explication Foxie : est-ce que l'enfant a compris après 1, 2, 3 relances ?

**Sortie :** Dataset JSONL structuré par enfant, prêt pour fine-tuning :
```json
{
  "child_id": "emma_cm2",
  "session_id": "2026-03-22_maths",
  "turns": [
    {
      "foxie": "Comment tu ferais pour calculer 3/4 + 1/2 ?",
      "child": "je sais pas trop, on additionne en haut et en bas ?",
      "label": "erreur_conceptuelle",
      "error_type": "addition_fractions_sans_denominateur_commun",
      "response_time_ms": 8200,
      "attempt": 1,
      "foxie_strategy": "socratique_micro_etapes",
      "strategy_effective": false
    },
    {
      "foxie": "Imagine que tu coupes un gâteau. Un en 4 parts, l'autre en 2...",
      "child": "ah il faut couper pareil ! Donc 2/4 !",
      "label": "correct_apres_aide",
      "response_time_ms": 4100,
      "attempt": 2,
      "foxie_strategy": "analogie_concrete",
      "strategy_effective": true
    }
  ]
}
```

**Phase de collecte :** Dès que les 3 enfants testent l'app. Pas besoin de fine-tuning pour commencer — on accumule d'abord.

**Implémentation technique :**
- Middleware Express qui intercepte chaque échange chat
- Stockage SQLite (table `training_data`) + export JSONL périodique
- Annotation semi-automatique par Claude (classification des erreurs) + validation manuelle possible

---

### AGENT 2 — Planifieur Adaptatif de Révision

**Rôle :** Mettre à jour dynamiquement le programme de révision en fonction de l'évolution des réponses.

**Logique :**
- Maintient un "graphe de maîtrise" par enfant : chaque concept du curriculum a un score (0-5) basé sur les dernières interactions
- Applique la répétition espacée (algorithme type SM-2 / Anki) : les concepts faibles reviennent plus souvent
- Détecte les régressions : si un concept maîtrisé (4/5) tombe à 2/5, alerte et re-planifie
- Priorise les prérequis : ne propose pas les fractions si la division n'est pas acquise

**Entrées :**
- Résultats de l'Agent 1 (performance par concept)
- Graphe de prérequis du curriculum (déjà dans `familyflow_curriculum.json` via le champ `prerequis`)
- Calendrier scolaire (contrôles à venir si connecté à École Directe)

**Sortie :** Plan de révision personnalisé mis à jour en temps réel :
```json
{
  "child_id": "emma_cm2",
  "date": "2026-03-23",
  "priority_queue": [
    { "concept": "addition_fractions", "urgency": "haute", "reason": "échec_récent + contrôle_vendredi" },
    { "concept": "accord_participe_passé", "urgency": "moyenne", "reason": "régression_détectée" },
    { "concept": "proportionnalité", "urgency": "basse", "reason": "révision_espacée_J+7" }
  ]
}
```

**Implémentation technique :**
- Service `revisionPlanner.js` côté backend
- Table SQLite `mastery_graph` (child_id, concept_id, score, last_seen, next_review)
- Cron job ou trigger post-session qui recalcule les priorités
- API `/api/revision/plan/:childId` consommée par le frontend `RevisionPage.jsx`

---

### AGENT 3 — Agent Causal (Diagnostic)

**Rôle :** Comprendre POURQUOI un enfant bloque, pas juste constater QU'il bloque.

**C'est l'agent le plus ambitieux.** La plupart des outils ed-tech se contentent de dire "ton enfant a 3/10 en fractions". L'Agent Causal cherche la cause racine :

**Types de diagnostics :**

1. **Lacune de prérequis** — L'enfant échoue en fractions parce que la division euclidienne n'est pas acquise. L'agent remonte la chaîne de prérequis pour trouver le maillon cassé.

2. **Erreur de modèle mental** — L'enfant pense que "multiplier rend toujours plus grand" (faux avec les décimaux < 1). L'agent détecte les misconceptions persistantes à travers les patterns d'erreurs.

3. **Problème de compréhension de l'énoncé** — L'enfant sait calculer mais ne comprend pas ce qu'on lui demande. L'agent analyse si les erreurs sont liées au vocabulaire ou à la formulation.

4. **Facteur attentionnel / charge cognitive** — L'enfant réussit les exercices simples mais échoue dès que l'énoncé est long. Ce n'est pas un problème de compréhension mathématique mais de mémoire de travail.

5. **Pattern temporel** — L'enfant est meilleur le matin que le soir, ou pire le mercredi après le sport. L'agent corrèle performance et contexte.

**Méthode :**
- Analyse contrefactuelle : "Si on reformule l'énoncé plus simplement, l'enfant réussit-il ?" → problème de lecture, pas de maths
- Graphe causal bayésien : modélise les relations cause-effet entre prérequis, types d'erreurs, et contexte
- Tests d'hypothèse actifs : l'agent peut demander à Foxie de poser une question spécifique pour valider/invalider une hypothèse

**Sortie :** Diagnostic structuré :
```json
{
  "child_id": "emma_cm2",
  "concept": "addition_fractions",
  "diagnostic": {
    "cause_racine": "lacune_prerequis",
    "prerequis_manquant": "notion_denominateur_commun",
    "confiance": 0.85,
    "evidence": ["3 échecs consécutifs sur mise au même dénominateur", "réussit si dénominateurs identiques"],
    "misconception_detectee": "on_additionne_numerateurs_et_denominateurs",
    "recommandation": "Revenir sur la notion d'équivalence de fractions avec support visuel (parts de gâteau)"
  }
}
```

**Implémentation technique :**
- Phase 1 (prompt engineering) : Prompt spécialisé "diagnosticien" envoyé à Claude avec l'historique de l'enfant
- Phase 2 (avec données) : Modèle bayésien léger (Python, bibliothèque `pgmpy` ou `causalnex`)
- Phase 3 (fine-tuning) : Modèle fine-tuné sur les diagnostics validés par des enseignants

---

### AGENT 4 — Orchestrateur Foxie

**Rôle :** C'est le "cerveau" de Foxie — il reçoit les inputs des autres agents et génère la réponse finale adaptée à l'enfant.

**Ce qu'il prend en compte :**
- Diagnostic de l'Agent 3 (pourquoi l'enfant bloque)
- Plan de révision de l'Agent 2 (quoi travailler aujourd'hui)
- Niveau d'engagement de l'Agent 5 (est-ce qu'on perd l'enfant ?)
- Style d'apprentissage de l'Agent 6 (visuel ? textuel ? par analogie ?)

**Décisions en temps réel :**
- Choisir la stratégie pédagogique (socratique, analogie concrète, défi, jeu)
- Ajuster la difficulté (micro-étapes vs problème ouvert)
- Décider quand passer à un autre sujet (fatigue cognitive détectée)
- Donner du sens : relier l'exercice à la vie réelle de l'enfant

---

### AGENT 5 — Engagement & Motivation

**Rôle :** Détecter le désengagement AVANT que l'enfant ne décroche.

**Signaux analysés :**
- Temps de réponse qui augmente progressivement (fatigue)
- Réponses de plus en plus courtes ("oui", "non", "jsais pas")
- Abandon de session (l'enfant ferme l'app sans finir)
- Pattern de connexion (se connecte de moins en moins souvent)
- Émojis / ton qui change (de enthousiaste à résigné)

**Actions déclenchées :**
- Alerte douce à Foxie : "change de sujet" ou "propose un mini-jeu"
- Gamification contextuelle : badges, streaks, défis entre frères/soeurs
- Notification parent si désengagement persistant (via Agent 7)

**Implémentation technique :**
- Scoring d'engagement en temps réel (0-100) basé sur les signaux ci-dessus
- Seuils configurables : < 60 = alerte Foxie, < 30 = notification parent
- Table SQLite `engagement_log` (timestamp, child_id, score, signals)

---

### AGENT 6 — Détecteur de Style d'Apprentissage

**Rôle :** Identifier comment chaque enfant apprend le mieux et adapter le format des explications.

**Dimensions analysées :**
- **Visuel vs Textuel** : L'enfant comprend-il mieux avec un schéma ou une explication écrite ?
- **Analogie concrète vs Abstraction** : Préfère "les parts de gâteau" ou "a/b + c/d" ?
- **Guidé vs Exploratoire** : A besoin qu'on lui dise chaque étape ou préfère chercher seul ?
- **Répétition vs Variété** : Apprend en refaisant le même type d'exercice ou en variant les contextes ?

**Méthode :**
- A/B testing implicite : Foxie essaie une explication visuelle, puis textuelle, et mesure laquelle fonctionne
- Profil évolutif : le style n'est pas figé, il peut varier par matière (visuel en géométrie, textuel en grammaire)
- Feedback explicite possible : "Tu préfères que je t'explique avec un dessin ou avec des mots ?"

**Sortie :** Profil d'apprentissage :
```json
{
  "child_id": "emma_cm2",
  "profile": {
    "maths": { "preferred": "analogie_concrete", "confidence": 0.78 },
    "francais": { "preferred": "textuel_structure", "confidence": 0.65 },
    "sciences": { "preferred": "visuel_schema", "confidence": 0.82 },
    "general": { "guided_vs_exploratory": 0.7, "repetition_vs_variety": 0.4 }
  }
}
```

---

### AGENT 7 — Coach Parent

**Rôle :** Traduire les données des autres agents en conseils actionnables pour les parents.

**Ce qu'il produit :**
- Bilan hebdomadaire : "Cette semaine, Emma a bien progressé en conjugaison mais bloque toujours sur les fractions. La cause identifiée est une lacune sur les dénominateurs communs."
- Alertes contextuelles : "Léo se désengage depuis 3 jours, peut-être lié à la fatigue de fin de trimestre. Suggestion : sessions plus courtes (10 min max)."
- Conseils pédagogiques : "Noah apprend mieux avec des exemples concrets. Pour l'aider en histoire, essayez de visiter le musée X ce week-end."
- Préparation contrôle : "Contrôle de maths vendredi. Points à revoir : fractions et proportionnalité. Plan de révision proposé pour la semaine."

---

## 3. Roadmap d'implémentation

### Phase 0 — Avatar Parlant (PRIORITÉ ABSOLUE — moteur d'adoption)
- [ ] **HeyGen LiveAvatar intégré dans le chat** : Foxie parle en temps réel avec lip-sync
- [ ] SDK : `@heygen/liveavatar-web-sdk` (npm)
- [ ] Composant `FoxieLiveAvatar.jsx` avec fallback sur SVG statique si API indisponible
- [ ] Mode plein écran "conversation face-à-face" (avatar en haut, chat en bas)
- [ ] Bouton mute/unmute pour basculer voix/texte
- [ ] Coût estimé : ~0.10$/30s de streaming, ~12$/mois pour 3 enfants

### Phase 1 — MVP enrichi + collecte de données
- [x] Knowledge Base curriculum officiel (117 fiches)
- [x] Chat Foxie avec pédagogie adaptative (2 modes)
- [x] Interface chat moderne
- [ ] **Profil apprenant en SQLite** (scores par concept, historique sessions)
- [ ] **Agent 1 (Collecteur) — version simple** : logger chaque échange avec métadonnées

### Phase 2 — Intelligence adaptative (après premières données collectées)
- [ ] Agent 2 (Planifieur) : révision espacée + graphe de maîtrise
- [ ] Agent 5 (Engagement) : scoring temps réel + alertes
- [ ] Agent 6 (Style) : A/B testing des stratégies pédagogiques
- [ ] Agent 7 (Coach Parent) : bilans hebdomadaires automatiques
- [ ] Dashboard parent avec visualisation de la progression

### Phase 3 — Intelligence causale (avec dataset suffisant ~500+ sessions)
- [ ] Agent 3 (Causal) : diagnostic de cause racine via prompt spécialisé
- [ ] Fine-tuning modèle de scoring des réponses (sur les données de l'Agent 1)
- [ ] Graphe causal bayésien pour les misconceptions récurrentes

### Phase 4 — Reinforcement Learning (avec dataset massif ~5000+ sessions)
- [ ] RLHF sur les stratégies pédagogiques : optimiser quelle approche fonctionne pour quel profil
- [ ] Reward model entraîné sur : compréhension effective (pas juste réponse correcte)
- [ ] Boucle d'amélioration continue : Agent 1 collecte → fine-tune → déploie → Agent 1 re-collecte

---

## 4. LLM Router — Orchestration Multi-Modèles

### Principe

Tous les agents n'ont pas besoin du même LLM. Envoyer une classification binaire (réponse correcte/incorrecte) à Claude Opus coûte 20x plus cher qu'à Mistral Small — pour un résultat équivalent. Le LLM Router choisit automatiquement le bon modèle pour chaque tâche selon 3 critères : qualité requise, latence acceptable, et coût.

### Matrice Agent × Modèle

```
┌────────────────────────┬──────────────────────┬────────────┬──────────┐
│ Agent / Tâche          │ Modèle recommandé    │ Coût/appel │ Latence  │
├────────────────────────┼──────────────────────┼────────────┼──────────┤
│ Agent 1 — Annotation   │ Haiku / Gemini Flash │ ~0.001€   │ < 500ms  │
│  (classification)      │ / Mistral Small      │            │          │
├────────────────────────┼──────────────────────┼────────────┼──────────┤
│ Agent 2 — Planifieur   │ Rule-based + Sonnet  │ ~0.003€   │ < 1s     │
│  (algo SM-2 + LLM      │ (pour reformulation) │            │          │
│   pour contexte)       │                      │            │          │
├────────────────────────┼──────────────────────┼────────────┼──────────┤
│ Agent 3 — Diagnostic   │ Claude Opus /        │ ~0.02€    │ < 5s     │
│  causal (raisonnement  │ GPT-4o (le meilleur  │            │ (async)  │
│   complexe)            │ en raisonnement)     │            │          │
├────────────────────────┼──────────────────────┼────────────┼──────────┤
│ Agent 4 — Foxie        │ Claude Sonnet        │ ~0.008€   │ < 2s     │
│  (conversation enfant) │ (meilleur FR +       │            │ (stream) │
│                        │  ton naturel)        │            │          │
├────────────────────────┼──────────────────────┼────────────┼──────────┤
│ Agent 5 — Engagement   │ Pas de LLM           │ ~0€       │ < 50ms   │
│  (scoring temps réel)  │ (rule-based Python)  │            │          │
├────────────────────────┼──────────────────────┼────────────┼──────────┤
│ Agent 6 — Style        │ Haiku / Mistral      │ ~0.001€   │ < 500ms  │
│  (analyse patterns)    │ Small                │            │          │
├────────────────────────┼──────────────────────┼────────────┼──────────┤
│ Agent 7 — Coach Parent │ Sonnet / Mistral     │ ~0.005€   │ < 3s     │
│  (bilans + conseils)   │ Medium               │            │          │
└────────────────────────┴──────────────────────┴────────────┴──────────┘
```

### Impact coût estimé

| Scénario | Coût/session (20 échanges) | Coût/mois (1 enfant, 5 sessions/semaine) |
|----------|---------------------------|------------------------------------------|
| Tout sur Claude Sonnet | ~0.18€ | ~3.60€ |
| Avec LLM Router | ~0.05€ | ~1.00€ |
| **Économie** | **-72%** | **-72%** |

À 1000 familles (3 enfants chacune) : ~3 000€/mois au lieu de ~10 800€/mois.

### Architecture technique

```
                    ┌─────────────────────┐
                    │    LLM Router       │
                    │                     │
  Requête Agent ──▶ │  1. Identifie la    │
                    │     tâche (type)    │
                    │  2. Choisit le      │ ──▶ API Provider
                    │     modèle optimal  │     (Anthropic / OpenAI /
                    │  3. Formate l'appel │      Google / Mistral)
                    │  4. Fallback si     │
                    │     erreur/timeout  │
                    └─────────────────────┘
```

**Implémentation recommandée :**
- Couche d'abstraction via **LiteLLM** (open-source, Python) ou **OpenRouter** (API unifiée)
- Interface unique : tous les agents appellent `router.complete(task_type, messages)`
- Le router mappe `task_type` → `model_id` via une config YAML
- Fallback automatique : si Mistral timeout → reroute vers Haiku
- Logging de chaque appel (modèle utilisé, latence, coût, qualité) pour optimiser le routing

### Config de routing (`llm_router.yaml`)

```yaml
routes:
  classification:
    primary: mistral-small-latest
    fallback: claude-haiku-4-5
    max_tokens: 100
    timeout_ms: 2000

  conversation_enfant:
    primary: claude-sonnet-4-6
    fallback: claude-sonnet-4-6  # pas de downgrade pour la conversation
    max_tokens: 800
    timeout_ms: 8000
    stream: true

  diagnostic_causal:
    primary: claude-opus-4-6
    fallback: gpt-4o
    max_tokens: 1500
    timeout_ms: 15000

  bilan_parent:
    primary: claude-sonnet-4-6
    fallback: mistral-medium-latest
    max_tokens: 1000
    timeout_ms: 10000

  scoring_engagement:
    primary: rule_based  # pas de LLM
    fallback: null
```

### Règle d'or

Tout ce qui est **face enfant** (Agent 4) reste sur un seul modèle (Claude Sonnet) pour garantir la cohérence du ton de Foxie. Le routing multi-modèles ne s'applique qu'aux tâches **backend** invisibles pour l'utilisateur.

### Roadmap du Router

- **Phase 1** : Tout sur Claude Sonnet (simplicité, 3 enfants, coût négligeable)
- **Phase 2** : Introduire Haiku/Flash pour l'Agent 1 (classification) et l'Agent 6 (analyse patterns)
- **Phase 3** : Router complet avec benchmarks par modèle × tâche, basculer l'Agent 3 sur Opus
- **Phase 4** : Auto-routing intelligent — le router apprend quel modèle performe le mieux sur quelle tâche en analysant ses propres logs

---

## 5. Données et fine-tuning

### Stratégie de collecte (les 3 enfants = premiers testeurs)

Chaque session produit :
- ~10-30 paires (question/réponse) annotées automatiquement
- Avec 3 enfants × 5 sessions/semaine × 20 échanges/session = ~300 datapoints/semaine
- En 3 mois : ~3600 datapoints — suffisant pour un premier fine-tuning ciblé

### Ce qu'on fine-tune et quand

| Modèle | Quand | Dataset min | Objectif |
|--------|-------|-------------|----------|
| Scoring des réponses | Phase 3 | ~1000 paires annotées | Classifier : correct / erreur conceptuelle / erreur calcul / hors-sujet |
| Détection engagement | Phase 3 | ~500 sessions | Prédire désengagement 2-3 échanges avant l'abandon |
| Stratégie pédagogique | Phase 4 | ~5000 sessions | Choisir la meilleure approche par profil × concept × contexte |
| Diagnostic causal | Phase 4 | ~2000 diagnostics validés | Identifier la cause racine d'une difficulté |

### Reinforcement Learning — approche

Le RL intervient à la Phase 4 pour optimiser le choix de stratégie pédagogique :

**Reward function :**
- +3 : l'enfant comprend et peut résoudre un exercice similaire seul
- +1 : l'enfant comprend avec aide
- 0 : l'enfant répond correctement mais ne peut pas transférer
- -1 : l'enfant ne comprend pas malgré l'explication
- -2 : l'enfant se désengage (ferme l'app, réponses courtes)

**State :** profil enfant + concept + historique récent + niveau d'engagement
**Action :** choix de stratégie (socratique / analogie / visuel / défi / jeu / changement de sujet)

L'objectif n'est pas de maximiser le taux de bonnes réponses (ça encouragerait des questions trop faciles) mais de maximiser la progression réelle — la capacité de l'enfant à résoudre demain un problème qu'il ne savait pas résoudre aujourd'hui.

---

## 6. Modules existants (référence technique)

### Chat Foxie (`ChatWindow.jsx`)
- Interface conversationnelle moderne (style messagerie)
- Bulles utilisateur en gradient sage green, bulles Foxie en blanc
- Avatar groupé intelligemment (affiché uniquement en début de groupe de messages)
- Support photo (upload + analyse via Claude Vision)
- Dictée vocale (Web Speech API, fr-FR)
- 3 modes : standard, contrôle (analyse d'erreurs), oral (coaching expression)

### Curriculum Engine (`curriculum.js`)
- Détection automatique matière (8 matières) et niveau (CP→3ème)
- Recherche sémantique dans les 117 fiches du programme officiel
- Scoring par pertinence (concept + chapitre + mots-clés)
- Chemin : `backend/data/familyflow_curriculum.json`

### Prompt Builder (`prompts.js`)
- Injection du contexte pédagogique officiel dans les prompts Claude
- Pédagogie adaptative : MODE 1 (enfant en difficulté) vs MODE 2 (enfant à l'aise)
- Inclut méthode, erreurs fréquentes, exemples guidés, astuces Foxie

### Learner Profile (`learnerProfile.js`)
- Service existant côté backend (à enrichir)
- Stockage profil par enfant dans SQLite

---

## 7. Avatar Foxie — Système Expressif Animé

### Concept
L'enfant choisit entre 2 styles d'avatar dans ses paramètres :
1. **Humanoïde** — Jeune femme rousse, yeux verts, style tutrice bienveillante
2. **Mascotte Renard** — Renard stylisé avec écharpe verte, expressif et mignon

### 4 Expressions dynamiques
Chaque avatar a 4 expressions qui changent selon le contexte du chat :
- **Souriante** (défaut) → message d'accueil, réponse positive
- **Réfléchit** (tête penchée, bulle de pensée) → Foxie analyse l'exercice
- **Encourage** (yeux joyeux, étoiles) → l'enfant a trouvé la bonne réponse
- **Écoute** (tête inclinée, regard doux) → l'enfant explique son raisonnement

### Implémentation
- **Prototype fonctionnel** : `foxie-avatar-demo.html` (fichier de référence avec tous les SVG et animations)
- Les SVGs sont stockés en tant que strings JS, injectés dynamiquement selon l'expression
- Animations CSS : clignement des yeux (blink), flottement (floatAvatar), étoiles (twinkle)
- Pastille verte "en ligne" avec animation pulse

### Fichiers à modifier pour intégration
- `frontend/src/components/homework/ChatWindow.jsx` → remplacer l'avatar statique par le composant expressif
- `frontend/src/components/revision/RevisionPage.jsx` → idem
- Créer `frontend/src/components/common/FoxieAvatar.jsx` → composant réutilisable avec props `style` (human/fox) et `expression` (smile/think/encourage/listen)
- Le choix d'avatar est stocké dans le profil de l'enfant (table `members`, nouveau champ `avatar_style`)

### Avatar Parlant — HeyGen LiveAvatar (Phase 0)

**Pourquoi c'est la priorité :** L'avatar parlant est le moteur d'adoption. Plus les enfants utilisent l'app → plus de données collectées → meilleurs agents → meilleure expérience → plus d'adoption. Le flywheel commence ici.

**Technologie :** HeyGen LiveAvatar — avatar IA temps réel avec lip-sync, expressions et gestes.

**Flux technique :**
```
Enfant tape/parle → Claude Sonnet génère la réponse (texte)
                   → Le texte est affiché dans la bulle de chat
                   → EN PARALLÈLE : HeyGen LiveAvatar prononce le texte
                     avec lip-sync et expressions faciales
```

**SDK :** `@heygen/liveavatar-web-sdk` (npm)
**API Key :** stockée dans `backend/.env` (`HEYGEN_API_KEY`)
**Coût :** ~0.10$ / 30 secondes de streaming
**Estimation mensuelle :** 3 enfants × 20 min/jour × 30 jours = ~36$ /mois

**Composants :**
- `backend/src/routes/avatar.js` — route POST /api/avatar/session-token
- `frontend/src/components/common/FoxieLiveAvatar.jsx` — composant React
- Fallback automatique : si HeyGen indisponible → avatar SVG statique

**Modes d'affichage :**
1. Mini (44px) — dans le header du chat, avatar rond avec pastille verte
2. Plein écran — moitié supérieure = avatar, moitié inférieure = bulles de chat

### Évolution future
- Lottie : animations vectorielles fluides pour le mode hors-ligne / fallback
- Voix personnalisée : cloner une voix spécifique pour Foxie via HeyGen Voice Clone
- Multi-langue : Foxie peut parler en anglais pour les cours de langues vivantes

---

## 8. Documents projet

| Fichier | Contenu |
|---------|---------|
| `FamilyFlow_BusinessPlan_v3.docx` | Business plan complet |
| `FamilyFlow_BusinessPlan_Narratif.docx` | Version narrative du BP |
| `FamilyFlow_CahierDesCharges.docx` | Cahier des charges fonctionnel |
| `FamilyFlow_PitchDeck_v3.pptx` | Pitch deck investisseurs (dernière version) |
| `FamilyFlow_Programmes_Pedagogiques.docx` | Synthèse des programmes officiels intégrés |
