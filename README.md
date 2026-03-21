# 🦊 EduFamily Backend

API Flask pour le tuteur IA familial EduFamily.

## 🎯 Fonctionnalités

- **Tutorat socratique** : Chat avec Claude qui guide sans donner les réponses
- **Mode Parent** : Résumés clairs et conseils pratiques
- **Analyse de leçons** : OCR + extraction des concepts clés
- **Cartes mentales** : Génération automatique
- **Gestion des profils** : Plusieurs enfants par famille
- **Historique** : Suivi de la progression

## 🚀 Installation rapide

### 1. Cloner et installer

```bash
cd edufamily-backend
python -m venv venv
source venv/bin/activate  # Sur Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configurer

```bash
cp .env.example .env
# Éditez .env avec votre clé API Anthropic
```

### 3. Lancer

```bash
python app.py
```

L'API sera disponible sur `http://localhost:5000`

## 📡 Endpoints API

### Authentification

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/register` | Créer un compte famille |

### Gestion des enfants

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/children` | Créer un profil enfant |
| GET | `/api/families/<id>/children` | Liste des enfants |

### Tutorat

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/chat` | Envoyer un message au tuteur |
| POST | `/api/sessions` | Créer une session |
| GET | `/api/sessions/<id>/messages` | Historique de session |

### Analyse de leçons

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/analyze-lesson` | Analyser une photo de leçon |

### Statistiques

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/families/<id>/stats` | Stats d'utilisation |
| GET | `/api/children/<id>/progress` | Progression d'un enfant |

## 💬 Exemple d'utilisation

### Chat avec le tuteur (mode enfant)

```bash
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "C'\''est quoi une fraction ?",
    "mode": "child",
    "family_id": 1
  }'
```

Réponse :
```json
{
  "response": "Les fractions, c'est comme couper un gâteau ! 🎂 Si tu coupes un gâteau en 4 parts égales et que tu en prends 1, quelle fraction du gâteau as-tu pris ?",
  "tokens_used": 45
}
```

### Analyser une leçon

```bash
curl -X POST http://localhost:5000/api/analyze-lesson \
  -F "family_id=1" \
  -F "image=@photo_lecon.jpg"
```

## 💰 Modèle économique

### Coûts API Claude (estimés)

| Usage | Tokens/mois | Coût API |
|-------|-------------|----------|
| Famille légère (100 interactions) | ~80K | ~0.40€ |
| Famille moyenne (300 interactions) | ~240K | ~1.20€ |
| Famille active (500 interactions) | ~400K | ~2.00€ |

Avec un prix de **4.99€/mois**, la marge brute est de **~60%**.

### Limites par défaut

- 500 interactions/mois (plan standard)
- 1000 interactions/mois (plan premium)
- 500 tokens max par réponse

## 🔧 Configuration avancée

### Variables d'environnement

| Variable | Description | Défaut |
|----------|-------------|--------|
| `ANTHROPIC_API_KEY` | Clé API Claude | (requis) |
| `SECRET_KEY` | Clé secrète Flask | (requis en prod) |
| `MAX_TOKENS_PER_RESPONSE` | Limite tokens/réponse | 500 |
| `MONTHLY_INTERACTION_LIMIT` | Limite mensuelle | 500 |

### Production

Pour la production, utilisez Gunicorn :

```bash
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

## 🧪 Tests

```bash
pytest tests/
```

## 📁 Structure du projet

```
edufamily-backend/
├── app.py              # Application Flask principale
├── requirements.txt    # Dépendances Python
├── .env.example        # Template de configuration
├── edufamily.db        # Base de données SQLite (créée auto)
└── tests/              # Tests unitaires
```

## 🔒 Sécurité

- [ ] Hasher les mots de passe avec bcrypt (en prod)
- [ ] Ajouter l'authentification JWT
- [ ] Rate limiting par IP
- [ ] HTTPS obligatoire
- [ ] Validation des entrées

## 📝 Roadmap

- [x] API de base avec Flask
- [x] Intégration Claude API
- [x] Mode socratique (enfant)
- [x] Mode explicatif (parent)
- [x] Analyse de photos (OCR)
- [x] Génération de cartes mentales
- [ ] Authentification JWT
- [ ] Interface admin
- [ ] Intégration Stripe (paiements)
- [ ] Application mobile (React Native)

## 👩‍💻 Développé par

Manika - Maman de 3 enfants, avec l'aide de Claude

---

**EduFamily** - Le tuteur IA qui apprend à apprendre 🦊
