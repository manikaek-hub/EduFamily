# Family Flow — Prompts pour Claude Code

## Comment utiliser ce fichier

1. Commence TOUJOURS par donner le **Prompt Maître** à Claude Code (une seule fois en début de session)
2. Puis lance les itérations **une par une**, dans l'ordre
3. À chaque itération : teste que tout fonctionne AVANT de passer à la suivante
4. Si une itération casse quelque chose, demande à Claude Code de fixer avant de continuer

---

## PROMPT MAÎTRE (à donner en début de chaque session)

```
Tu es le développeur principal de Family Flow, un tuteur IA adaptatif pour enfants
du CP à la 3ème, aligné sur les programmes officiels de l'Éducation Nationale française.

CONTEXTE PROJET :
- Lis le fichier SPECS_TECHNIQUES.md à la racine du projet — c'est ta bible.
  Il contient la vision, l'architecture multi-agents, le LLM Router, et la roadmap.
- Stack actuelle : React 19 + Tailwind CSS (frontend), Express.js + SQLite (backend),
  Claude Sonnet 4 via Anthropic SDK (IA)
- Le backend/data/familyflow_curriculum.json contient 117 fiches pédagogiques
  (programmes officiels, CP→3ème, 7 matières)
- Le schéma SQLite est dans backend/src/db/schema.sql

DESIGN SYSTEM (à respecter impérativement) :
- Fond : #FAF8F5 (warm beige)
- Texte : #3D3D3D
- Accent : #7C9082 (sage green)
- Warm : #C4A484
- Style : moderne, chaleureux, mobile-first, JAMAIS d'aspect "ERP" ou "dashboard corporate"
- Le chat doit ressembler à une app de messagerie (WhatsApp/iMessage), pas à un logiciel
- Foxie = tutrice virtuelle. Son avatar est dans frontend/public/assets/foxie-avatar.svg
- Animations douces : chatIn, foxieBounce, typingDot (définis dans tailwind.config.js)

RÈGLES DE DÉVELOPPEMENT :
1. Chaque modification doit être testable immédiatement (npm run build doit passer)
2. Ne supprime jamais de fonctionnalité existante sans confirmation explicite
3. Si tu modifies le schéma SQLite, crée une migration, ne modifie pas schema.sql directement
4. Tout le code face-utilisateur doit être en français
5. Pas de sur-ingénierie : code simple, lisible, bien commenté
6. Mobile-first : tout doit fonctionner sur un écran de téléphone
7. Si tu utilises BUILD_PATH, utilise /tmp/familyflow-build pour éviter les erreurs EPERM
```

---

## ITÉRATION 0 — Avatar Parlant HeyGen (PRIORITÉ ABSOLUE)

**Objectif :** Foxie parle vraiment. C'est le hook d'adoption. Les enfants doivent avoir envie de revenir — et un avatar animé qui parle avec des émotions, c'est ce qui fait la différence. Plus d'adoption = plus de données = meilleurs agents.

```
ITÉRATION 0 : Avatar Parlant HeyGen LiveAvatar

CONTEXTE STRATÉGIQUE :
L'avatar parlant n'est PAS une feature cosmétique. C'est le moteur d'adoption.
Sans adoption par les enfants, on ne collecte pas de données.
Sans données, les agents (collecteur, planifieur, causal) ne servent à rien.
L'avatar parlant est donc la PREMIÈRE chose à implémenter.

TÂCHE 1 — Installation du SDK HeyGen LiveAvatar
Installe le SDK dans le frontend :
  cd frontend && npm install @heygen/liveavatar-web-sdk

TÂCHE 2 — Route backend pour le token de session
Crée backend/src/routes/avatar.js :
- Route POST /api/avatar/session-token
- Appelle l'API HeyGen pour générer un session token
  (POST https://api.heygen.com/v1/streaming.create_token)
- Utilise la clé API depuis process.env.HEYGEN_API_KEY
- Retourne le token au frontend
- Ajoute cette route dans index.js

TÂCHE 3 — Composant FoxieLiveAvatar.jsx
Crée frontend/src/components/common/FoxieLiveAvatar.jsx :
- Import : import { LiveAvatarSession } from '@heygen/liveavatar-web-sdk'
- Au montage du composant :
  1. Appelle POST /api/avatar/session-token pour obtenir le token
  2. Crée une session LiveAvatar avec le token
  3. Affiche le flux vidéo de l'avatar dans un conteneur circulaire
     (même style que l'avatar SVG actuel : rond, ring-2 ring-white, shadow-md)
  4. Pastille verte "en ligne" quand la session est active
- Méthode exposée : speak(text) qui fait parler l'avatar
- Gestion du fallback : si HeyGen est indisponible ou si la clé n'est pas
  configurée, affiche l'avatar SVG statique existant (foxie-avatar.svg)
- Style : le conteneur vidéo fait 44px dans le header du chat,
  200px dans le mode plein écran

TÂCHE 4 — Intégration dans ChatWindow.jsx
Modifie frontend/src/components/homework/ChatWindow.jsx :
- Remplace le composant FoxieAvatar statique par FoxieLiveAvatar
- Quand Claude retourne une réponse :
  1. Affiche le texte dans la bulle de chat (comme aujourd'hui)
  2. EN PARALLÈLE, appelle foxieAvatar.speak(responseText) pour que
     l'avatar prononce la réponse avec lip-sync
- Ajoute un bouton toggle "🔊 / 🔇" pour couper/activer la voix de Foxie
- L'enfant peut choisir de lire OU d'écouter — les deux fonctionnent

TÂCHE 5 — Mode plein écran avatar
Ajoute un bouton dans le header du chat pour basculer en mode
"conversation face-à-face" :
- L'avatar prend toute la moitié supérieure de l'écran
- Les bulles de chat restent en bas
- Effet : l'enfant a l'impression de parler à une vraie personne
- Animation de transition douce entre les deux modes

TÂCHE 6 — Configuration .env
Ajoute dans backend/.env :
  HEYGEN_API_KEY=ton_api_key_ici

Ajoute dans backend/.env.example :
  HEYGEN_API_KEY=  # Clé API HeyGen pour l'avatar parlant Foxie

VÉRIFICATION :
1. npm run build (frontend) sans erreur
2. L'avatar se charge et s'affiche dans le chat
3. Quand on envoie un message, l'avatar parle la réponse avec lip-sync
4. Si HEYGEN_API_KEY est vide, l'avatar SVG statique s'affiche à la place
5. Le bouton mute/unmute fonctionne
6. Le mode plein écran fonctionne
```

---

## ITÉRATION 1 — Refonte de l'architecture backend (fondations)

**Objectif :** Restructurer le backend pour supporter les agents. Pas d'agent intelligent encore — juste les tuyaux.

```
ITÉRATION 1 : Refonte architecture backend

Lis d'abord SPECS_TECHNIQUES.md (sections 2 et 4).

Objectif : poser les fondations du système multi-agents sans casser l'existant.

TÂCHE 1 — Nouvelle table training_data (Agent 1 - Collecteur)
Crée une migration SQLite qui ajoute :

CREATE TABLE training_data (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      INTEGER REFERENCES homework_sessions(id),
  member_id       INTEGER NOT NULL REFERENCES members(id),
  turn_index      INTEGER NOT NULL,
  foxie_message   TEXT NOT NULL,
  child_message   TEXT,
  label           TEXT CHECK(label IN ('correct','partial','incorrect','hors_sujet','abandon')),
  error_type      TEXT,
  response_time_ms INTEGER,
  attempt_number  INTEGER DEFAULT 1,
  foxie_strategy  TEXT,
  strategy_effective INTEGER,
  concept_id      TEXT,
  subject         TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

TÂCHE 2 — Nouvelle table mastery_graph (Agent 2 - Planifieur)
Crée une migration qui ajoute :

CREATE TABLE mastery_graph (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id   INTEGER NOT NULL REFERENCES members(id),
  concept_id  TEXT NOT NULL,
  subject     TEXT NOT NULL,
  score       REAL DEFAULT 0 CHECK(score BETWEEN 0 AND 5),
  attempts    INTEGER DEFAULT 0,
  last_seen   TEXT,
  next_review TEXT,
  UNIQUE(member_id, concept_id)
);

CREATE TABLE engagement_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id   INTEGER NOT NULL REFERENCES members(id),
  session_id  INTEGER REFERENCES homework_sessions(id),
  score       REAL DEFAULT 100,
  signals     TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

TÂCHE 3 — Middleware de collecte
Crée backend/src/middleware/trainingCollector.js :
- Intercepte chaque réponse sur POST /api/homework/chat
- Mesure le temps entre la requête et la réponse
- Insère une ligne dans training_data avec les métadonnées disponibles
- Le champ "label" reste NULL pour l'instant (sera rempli par l'Agent 1 plus tard)
- Câble ce middleware dans index.js

TÂCHE 4 — Service de profil apprenant enrichi
Enrichis backend/src/services/learnerProfile.js :
- Ajoute une fonction updateMastery(memberId, conceptId, subject, wasCorrect)
  qui met à jour mastery_graph (incrémente score si correct, décrémente si incorrect,
  calcule next_review avec un algo SM-2 simplifié)
- Ajoute une fonction getMasteryProfile(memberId) qui retourne le graphe complet
- Ajoute une fonction getWeakConcepts(memberId, limit=5) qui retourne les concepts
  les plus faibles (score le plus bas) pour prioriser les révisions

VÉRIFICATION : npm run build (frontend) + démarrage backend sans erreur.
Montre-moi le résultat de chaque test.
```

---

## ITÉRATION 2 — Agent 1 (Collecteur) + Agent 5 (Engagement)

**Objectif :** Faire tourner les 2 agents les plus simples — celui qui observe et celui qui mesure l'engagement.

```
ITÉRATION 2 : Agent 1 (Collecteur) et Agent 5 (Engagement)

Lis d'abord SPECS_TECHNIQUES.md (sections Agent 1 et Agent 5).

TÂCHE 1 — Agent 1 : Annotation automatique des réponses
Crée backend/src/agents/dataCollector.js :
- Fonction annotateResponse(foxieMessage, childMessage, subject, concept) qui :
  - Appelle Claude Haiku (ou Sonnet si Haiku pas dispo) avec un prompt court
  - Le prompt demande à classifier : correct / partial / incorrect / hors_sujet
  - Et identifier le type d'erreur si incorrect :
    erreur_conceptuelle / erreur_calcul / erreur_lecture_enonce / inattention / vocabulaire
  - Retourne { label, error_type, confidence }
- Cette annotation est appelée de manière ASYNCHRONE (ne bloque pas le chat)
- Met à jour la ligne training_data correspondante avec le label et l'error_type
- Appelle aussi learnerProfile.updateMastery() avec le résultat

TÂCHE 2 — Agent 5 : Scoring d'engagement (rule-based)
Crée backend/src/agents/engagementScorer.js :
- Fonction scoreEngagement(memberId, sessionId, currentMessage, messageHistory) :
  - Pas de LLM. Calcul purement algorithmique :
  - Signal 1 : longueur de réponse (< 5 caractères = -20 points)
  - Signal 2 : temps de réponse (> 30 secondes = -10 points, > 60 secondes = -20)
  - Signal 3 : pattern "jsais pas" / "je sais pas" / "aucune idée" / "?" = -25 points
  - Signal 4 : tendance descendante (3 messages de suite de plus en plus courts = -15)
  - Score de base : 100, on soustrait les pénalités
  - Retourne { score, signals[] }
- Insère dans engagement_log
- Si score < 60, ajoute un flag dans la réponse pour que Foxie change d'approche
- Si score < 30, déclenche un log "alerte_desengagement"

TÂCHE 3 — Intégration dans le flux de chat
Modifie la route POST /api/homework/chat (backend/src/routes/homework.js) :
- AVANT d'appeler Claude, récupère le score d'engagement actuel
- Si score < 60, ajoute au prompt system : "L'enfant montre des signes de fatigue.
  Propose un mini-défi amusant ou change de sujet. Sois encourageant."
- APRÈS la réponse, lance en arrière-plan (sans bloquer) :
  1. dataCollector.annotateResponse(...)
  2. engagementScorer.scoreEngagement(...)

VÉRIFICATION :
1. Fais un test end-to-end : envoie un message via l'API, vérifie que training_data
   et engagement_log sont bien remplis.
2. Montre-moi les contenus des tables après 3 échanges simulés.
```

---

## ITÉRATION 3 — Agent 2 (Planifieur de révision)

**Objectif :** Les révisions deviennent intelligentes — elles s'adaptent aux forces/faiblesses de chaque enfant.

```
ITÉRATION 3 : Agent 2 (Planifieur Adaptatif)

Lis SPECS_TECHNIQUES.md (section Agent 2).

TÂCHE 1 — Service de planification
Crée backend/src/agents/revisionPlanner.js :
- Fonction generatePlan(memberId) :
  - Récupère le mastery_graph de l'enfant via learnerProfile.getMasteryProfile()
  - Récupère les contrôles à venir (kb_homework avec due_date dans les 7 prochains jours)
  - Priorise les concepts selon :
    1. Urgence contrôle (concept lié à un devoir/contrôle proche) → priorité haute
    2. Score faible (< 2/5) → priorité haute
    3. Régression détectée (score a baissé de >1 point récemment) → priorité moyenne
    4. Révision espacée (next_review dépassé) → priorité basse
  - Retourne un plan structuré : { date, priority_queue: [{ concept, urgency, reason }] }
- Fonction getNextConcept(memberId) : retourne le concept prioritaire à travailler

TÂCHE 2 — API révision
Crée ou mets à jour la route GET /api/revision/plan/:memberId :
- Appelle generatePlan() et retourne le JSON
- Stocke le plan dans revision_plans

TÂCHE 3 — Intégration dans RevisionPage.jsx
Modifie frontend/src/components/revision/RevisionPage.jsx :
- Au chargement, appelle GET /api/revision/plan/:memberId
- Affiche les concepts à réviser dans l'ordre de priorité
- Chaque concept montre : nom, matière, niveau d'urgence (badge coloré), raison
- Bouton "Réviser avec Foxie" qui ouvre le chat avec le concept pré-sélectionné

VÉRIFICATION :
1. Crée un enfant de test avec quelques scores dans mastery_graph
2. Vérifie que le plan de révision s'affiche correctement
3. npm run build passe
```

---

## ITÉRATION 4 — Refonte UI complète (frontend)

**Objectif :** Rendre toute l'app cohérente avec le nouveau design du chat.

```
ITÉRATION 4 : Refonte UI

IMPORTANT : Le ChatWindow.jsx a déjà été refait avec un design moderne (bulles,
avatar, typing indicator). Le reste de l'app doit suivre le même niveau de qualité.

TÂCHE 1 — Dashboard (DashboardPage.jsx)
Refais complètement. Ce n'est PAS un dashboard corporate. C'est l'écran d'accueil
de l'enfant. Il doit montrer :
- Un message d'accueil personnalisé de Foxie ("Salut Emma ! Prête pour aujourd'hui ?")
- Les 2-3 concepts prioritaires à réviser (depuis l'Agent 2) sous forme de cartes cliquables
- Le score d'engagement de la semaine (visualisation simple, pas un graphique complexe)
- Le streak de jours consécutifs d'utilisation
- Style : cards arrondies, ombres douces, couleurs du design system, icônes simples

TÂCHE 2 — Navigation (BottomNav.jsx)
Simplifie. 4 onglets maximum :
- Accueil (dashboard)
- Devoirs (chat Foxie)
- Révisions (plan de révision)
- Profil (stats + paramètres)
Supprime les onglets inutiles (newsboard, calendar, quiz séparés — ils peuvent
être accessibles depuis le dashboard si nécessaire).

TÂCHE 3 — Profil enfant (ProfilePage.jsx)
Refais avec :
- Avatar de l'enfant + nom + classe
- Graphe de maîtrise simplifié : par matière, barre de progression colorée
- Points forts (top 3 concepts) et points à travailler (bottom 3)
- Historique des sessions récentes

TÂCHE 4 — Écran parent (nouveau)
Crée frontend/src/components/parent/ParentDashboard.jsx :
- Vue résumée de chaque enfant (card par enfant)
- Score d'engagement de la semaine
- Concepts en difficulté
- Bouton "Voir le bilan complet" (pour l'Agent 7, à implémenter plus tard)
- Accessible via le profil quand le membre est de type "parent"

DESIGN : consulte ChatWindow.jsx pour le niveau de qualité attendu.
Utilise les mêmes animations (chatIn), les mêmes arrondis, les mêmes ombres.
Palette : #FAF8F5 fond, #7C9082 accent, #3D3D3D texte, #C4A484 warm.

VÉRIFICATION :
1. npm run build sans erreur
2. Chaque page s'affiche correctement
3. La navigation fonctionne entre toutes les pages
4. Le design est cohérent et mobile-friendly
```

---

## ITÉRATION 5 — Agent 6 (Style d'apprentissage) + enrichissement Foxie

**Objectif :** Foxie commence à adapter sa manière d'expliquer selon le profil de l'enfant.

```
ITÉRATION 5 : Agent 6 (Style d'apprentissage) + Foxie plus intelligent

TÂCHE 1 — Détection de style
Crée backend/src/agents/learningStyleDetector.js :
- Table SQLite learning_style_profile (member_id, subject, preferred_style,
  confidence, updated_at)
- Styles possibles : analogie_concrete, visuel_schema, textuel_structure,
  exploratoire_defi
- Fonction detectStyle(memberId, subject) : analyse les dernières 20 interactions
  de l'enfant sur cette matière, regarde quelles stratégies de Foxie ont été
  efficaces (via training_data.strategy_effective), retourne le style dominant
- Mise à jour après chaque session

TÂCHE 2 — Enrichissement du prompt Foxie
Modifie backend/src/services/prompts.js :
- Le prompt système de Foxie reçoit maintenant :
  1. Le profil de maîtrise (concepts forts/faibles) depuis mastery_graph
  2. Le score d'engagement actuel depuis engagement_log
  3. Le style d'apprentissage préféré depuis learning_style_profile
  4. L'historique des erreurs récentes depuis training_data
- Foxie adapte concrètement sa réponse :
  - Style analogie_concrete → "Imagine que tu as 3 gâteaux..."
  - Style visuel_schema → Foxie décrit ou suggère un schéma
  - Style textuel_structure → Foxie structure en étapes numérotées
  - Style exploratoire_defi → "Et si je te posais le problème autrement..."

VÉRIFICATION :
1. Simule 20 échanges avec des stratégies variées
2. Vérifie que le style est bien détecté
3. Vérifie que le prompt de Foxie change en fonction du style
```

---

## ITÉRATION 6 — Agent 7 (Coach Parent) + bilans

**Objectif :** Les parents reçoivent des bilans utiles et actionnables.

```
ITÉRATION 6 : Agent 7 (Coach Parent)

TÂCHE 1 — Générateur de bilans
Crée backend/src/agents/parentCoach.js :
- Fonction generateWeeklyReport(memberId) :
  - Collecte les données de la semaine : sessions, mastery_graph, engagement_log,
    training_data, learning_style_profile
  - Appelle Claude Sonnet avec un prompt structuré qui demande :
    1. Résumé de la semaine (2-3 phrases)
    2. Progrès notables (concepts qui ont monté)
    3. Points d'attention (concepts en difficulté + cause probable)
    4. Conseil concret pour le parent (1 action spécifique)
    5. Prévisions pour la semaine prochaine
  - Retourne le bilan en JSON structuré

TÂCHE 2 — API et affichage
- Route GET /api/parent/report/:memberId
- Intégrer dans ParentDashboard.jsx :
  - Card "Bilan de la semaine" par enfant
  - Affichage du bilan avec les sections ci-dessus
  - Bouton "Générer un nouveau bilan" (appel à l'API)

VÉRIFICATION :
1. Génère un bilan pour un enfant de test avec des données simulées
2. Vérifie que le bilan est pertinent et actionnable
3. Vérifie l'affichage dans le dashboard parent
```

---

## ITÉRATION 7 — Tests end-to-end + polish pour les 3 enfants

**Objectif :** Tout doit fonctionner parfaitement pour un vrai test avec tes 3 enfants.

```
ITÉRATION 7 : Stabilisation et préparation au test réel

TÂCHE 1 — Seed data pour les 3 enfants
Mets à jour backend/src/db/seed.js :
- Crée 3 profils enfants avec vrais prénoms et vrais niveaux
  (demande-moi les prénoms et classes si tu ne les connais pas)
- Crée 1 profil parent (Manika)
- Pré-remplis quelques concepts dans mastery_graph pour que le dashboard
  ne soit pas vide au premier lancement

TÂCHE 2 — Tests automatisés
Crée backend/tests/ avec :
- test-agents.js : vérifie que chaque agent fonctionne individuellement
  (dataCollector, engagementScorer, revisionPlanner, learningStyleDetector, parentCoach)
- test-chat-flow.js : simule un échange complet enfant → Foxie → annotation → mastery update
- test-engagement.js : simule un enfant qui se désengage progressivement,
  vérifie que le score baisse et que Foxie adapte son comportement

TÂCHE 3 — Polish UI
- Vérifie tous les écrans sur mobile (375px de large)
- Vérifie que les transitions entre pages sont fluides
- Vérifie que le loading state est joli partout (utilise l'animation Foxie bounce)
- Corrige tous les textes en français (pas de placeholder anglais)

TÂCHE 4 — Script de lancement
Crée un script start.sh à la racine :
  #!/bin/bash
  echo "Démarrage de Family Flow..."
  cd backend && npm start &
  cd frontend && npm start &
  echo "Family Flow est prêt ! Ouvre http://localhost:3000"

VÉRIFICATION FINALE :
1. Tous les tests passent
2. npm run build (frontend) sans erreur ni warning
3. L'app se lance avec start.sh
4. Parcours complet : connexion parent → sélection enfant → chat Foxie →
   retour dashboard → vue profil → vue parent avec bilan
```

---

## RÉSUMÉ DES ITÉRATIONS

| # | Nom | Durée estimée | Dépendances | Pourquoi |
|---|-----|---------------|-------------|----------|
| **0** | **Avatar Parlant HeyGen** | **45-60 min** | **Clé API HeyGen** | **Hook d'adoption — sans ça, pas de données** |
| 1 | Architecture backend (tables + middleware) | 30-45 min | Aucune | Fondations pour les agents |
| 2 | Agent 1 (Collecteur) + Agent 5 (Engagement) | 45-60 min | Itération 1 | Commence à collecter les données |
| 3 | Agent 2 (Planifieur de révision) | 30-45 min | Itérations 1-2 | Révisions intelligentes |
| 4 | Refonte UI complète | 60-90 min | Itérations 0-3 | Expérience cohérente |
| 5 | Agent 6 (Style) + enrichissement Foxie | 45-60 min | Itérations 1-4 | Pédagogie adaptative |
| 6 | Agent 7 (Coach Parent) + bilans | 30-45 min | Itérations 1-5 | Feedback parents |
| 7 | Tests + polish + seed data | 45-60 min | Toutes | Prêt pour les 3 enfants |

**Total estimé : 6-8 heures de sessions Claude Code, réparties sur plusieurs jours.**

**ORDRE DE PRIORITÉ :**
1. Itération 0 (avatar parlant) → les enfants testent et s'accrochent
2. Itérations 1-2 (collecte de données) → chaque session produit des données
3. Le reste suit naturellement

---

## CONSEILS POUR LES SESSIONS CLAUDE CODE

1. **Une itération par session.** Ne mélange pas. Si une itération n'est pas finie, termine-la avant de passer à la suivante.

2. **Teste à chaque étape.** Après chaque tâche, demande à Claude Code : "Lance le build et montre-moi le résultat."

3. **Si ça casse, dis-le.** "L'itération 2 a cassé le chat existant. Répare avant de continuer."

4. **Garde le cap.** Claude Code peut proposer des améliorations. C'est bien, mais ne le laisse pas partir dans une direction non prévue. Dis : "Bonne idée, note-la pour plus tard, mais restons sur l'itération en cours."

5. **Sauvegarde entre les itérations.** Après chaque itération réussie, fais un git commit.
