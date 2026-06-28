# Déployer Family Flow en ligne (pour que les enfants y accèdent sans ton Mac)

Ce guide utilise **Railway** (simple, ~5 €/mois, données conservées). L'app est
prête : le backend sert le frontend embarqué (`backend/public`) et la base SQLite
peut vivre sur un disque persistant.

## Ce que l'app fait déjà pour faciliter le déploiement
- Le backend sert le site web (pas besoin de déployer le frontend séparément).
- Au 1er démarrage sur une base vide, la famille est créée automatiquement.
- L'emplacement des données est configurable via `DATA_DIR` (→ disque persistant).
- Tout `/api` est protégé par le **code d'accès familial** (`FAMILY_ACCESS_CODE`).

---

## Étapes (≈ 15 min)

### 1. Créer le compte
- Va sur **https://railway.app** → *Login with GitHub* (compte `manikaek-hub`).
- Ajoute un moyen de paiement (plan *Hobby*, ~5 €/mois).

### 2. Nouveau projet depuis GitHub
- *New Project* → *Deploy from GitHub repo* → choisis **EduFamily**.
- Une fois créé, ouvre le service → **Settings** :
  - **Root Directory** : `family-flow/backend`
  - **Start Command** : `npm start` (normalement auto-détecté)

### 3. Disque persistant (pour conserver les données)
- Dans le service → **Variables** → **+ New Volume** (ou onglet *Volumes*).
- **Mount path** : `/data`

### 4. Variables d'environnement
Service → **Variables** → ajoute (Raw Editor pratique) :

```
DATA_DIR=/data
LLM_DEFAULT_PROVIDER=openai
OPENAI_API_KEY=<ta clé OpenAI>
OPENAI_MODEL=gpt-5.5
OPENAI_FAST_MODEL=gpt-4o-mini
OPENAI_REASONING_MODEL=gpt-5.5
OPENAI_VISION_MODEL=gpt-4o
ANTHROPIC_API_KEY=<ta clé Anthropic (optionnel, fallback vision)>
FAMILY_ACCESS_CODE=<le code que la famille tapera>
AUTH_SECRET=<une longue chaîne aléatoire>
ED_USERNAME=<identifiant EcoleDirecte>
ED_PASSWORD=<mot de passe EcoleDirecte>
ELEVENLABS_API_KEY=<optionnel>
HEYGEN_API_KEY=<optionnel>
```

> Générer un `AUTH_SECRET` aléatoire (dans ton Terminal) :
> ```
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```
> Ne PAS définir `PORT` : Railway le fournit automatiquement.

### 5. Rendre l'app accessible
- Service → **Settings** → **Networking** → **Generate Domain**.
- Tu obtiens une adresse type `https://edufamily-production.up.railway.app`.

### 6. Tester
- Ouvre l'adresse → l'écran de connexion 🦊 doit apparaître.
- Entre le `FAMILY_ACCESS_CODE` → l'app s'ouvre.
- Partage l'adresse + le code à tes enfants. ✅

---

## Mettre à jour l'app plus tard

**Changement backend** : `git push` → Railway redéploie tout seul.

**Changement frontend** (le site) : il faut régénérer le build embarqué :
```bash
cd family-flow/frontend && CI=false npm run build
cd ../backend && rm -rf public && cp -R ../frontend/build ./public
git add public && git commit -m "build frontend" && git push
```

---

## Bon à savoir
- **Coût GPT** : chaque usage par les enfants consomme ton crédit OpenAI.
  Pour réduire : active DeepSeek sur le tier « fast » (voir `.env.example`).
- **Données** : base + photos sont sur le disque `/data` de Railway. Pense à une
  sauvegarde de temps en temps (Railway permet de télécharger le volume).
- **EcoleDirecte** : la synchro tourne toute seule (toutes les 6h) et repeuple
  les notes/devoirs.
