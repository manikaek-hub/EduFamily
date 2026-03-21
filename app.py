"""
EduFamily Backend API
=====================
API Flask pour le tuteur IA familial.

Fonctionnalités:
- Tutorat socratique via Claude API
- OCR pour lire les photos de leçons
- Génération de cartes mentales
- Gestion des profils enfants
- Historique des sessions

Auteur: Manika (avec Claude)
Prix cible: 4,99€/mois/famille
"""

import os
import json
import base64
import sqlite3
from datetime import datetime
from functools import wraps
from flask import Flask, request, jsonify, g
from flask_cors import CORS
import anthropic
from PIL import Image
import io
import re

# Charger les variables d'environnement depuis .env
try:
    from dotenv import load_dotenv
    load_dotenv()
    print("✅ Fichier .env chargé")
except ImportError:
    print("ℹ️  python-dotenv non installé, utilisation des variables d'environnement système")

# ============================================
# Configuration
# ============================================

app = Flask(__name__)
CORS(app)  # Permettre les requêtes cross-origin

# Configuration
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'edufamily-dev-key-change-in-prod')
app.config['DATABASE'] = 'edufamily.db'
app.config['MAX_TOKENS_PER_RESPONSE'] = 500  # Limiter les coûts
app.config['MONTHLY_INTERACTION_LIMIT'] = 500  # Par famille

# Client Anthropic
anthropic_client = None
def get_anthropic_client():
    global anthropic_client
    if anthropic_client is None:
        api_key = os.environ.get('ANTHROPIC_API_KEY')
        if api_key:
            anthropic_client = anthropic.Anthropic(api_key=api_key)
    return anthropic_client


# ============================================
# Base de données SQLite
# ============================================

def get_db():
    """Obtenir la connexion à la base de données."""
    if 'db' not in g:
        g.db = sqlite3.connect(app.config['DATABASE'])
        g.db.row_factory = sqlite3.Row
    return g.db

@app.teardown_appcontext
def close_db(exception):
    """Fermer la connexion à la base de données."""
    db = g.pop('db', None)
    if db is not None:
        db.close()

def init_db():
    """Initialiser la base de données."""
    db = get_db()
    db.executescript('''
        -- Familles (comptes payants)
        CREATE TABLE IF NOT EXISTS families (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            plan TEXT DEFAULT 'free',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            monthly_interactions INTEGER DEFAULT 0,
            last_reset_date TEXT
        );
        
        -- Enfants (profils)
        CREATE TABLE IF NOT EXISTS children (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            family_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            grade TEXT,
            learning_style TEXT,
            strengths TEXT,
            weaknesses TEXT,
            preferred_language TEXT DEFAULT 'fr',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (family_id) REFERENCES families(id)
        );
        
        -- Sessions de tutorat
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            child_id INTEGER NOT NULL,
            subject TEXT,
            topic TEXT,
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            ended_at TIMESTAMP,
            summary TEXT,
            FOREIGN KEY (child_id) REFERENCES children(id)
        );
        
        -- Messages (historique des conversations)
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            tokens_used INTEGER DEFAULT 0,
            FOREIGN KEY (session_id) REFERENCES sessions(id)
        );
        
        -- Leçons uploadées
        CREATE TABLE IF NOT EXISTS lessons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            family_id INTEGER NOT NULL,
            subject TEXT,
            topic TEXT,
            extracted_text TEXT,
            key_points TEXT,
            mind_map_data TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (family_id) REFERENCES families(id)
        );
        
        -- Progression
        CREATE TABLE IF NOT EXISTS progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            child_id INTEGER NOT NULL,
            subject TEXT NOT NULL,
            topic TEXT NOT NULL,
            understanding_level INTEGER DEFAULT 0,
            last_practiced TIMESTAMP,
            notes TEXT,
            FOREIGN KEY (child_id) REFERENCES children(id)
        );
    ''')
    db.commit()


# ============================================
# Prompts système pour Claude
# ============================================

SYSTEM_PROMPT_CHILD = """Tu es Foxie 🦊, un tuteur bienveillant et patient pour les enfants.

RÈGLES ABSOLUES:
1. Tu ne donnes JAMAIS la réponse directement
2. Tu poses des questions pour guider la réflexion
3. Tu utilises des exemples concrets et familiers (pizza, bonbons, jouets)
4. Tu encourages TOUJOURS, même quand l'enfant se trompe
5. Tu adaptes ton langage à l'âge de l'enfant
6. Tu utilises des emojis pour rendre la conversation fun

MÉTHODE SOCRATIQUE:
- Commence par demander ce que l'enfant comprend déjà
- Pose une question simple liée au concept
- Guide vers la découverte pas à pas
- Félicite chaque progrès, même petit
- Si l'enfant est bloqué, donne un indice, pas la réponse

STYLE:
- Phrases courtes et claires
- Vocabulaire adapté aux enfants
- Ton chaleureux et encourageant
- Maximum 3-4 phrases par réponse

Si l'enfant demande directement la réponse, dis quelque chose comme:
"Je sais que tu peux trouver ! 💪 Essayons ensemble..."
"""

SYSTEM_PROMPT_PARENT = """Tu es un assistant pédagogique pour les parents.

TON RÔLE:
1. Expliquer les concepts de manière simple et claire
2. Donner des conseils pratiques pour aider l'enfant
3. Identifier les points clés à retenir
4. Suggérer des exemples du quotidien

FORMAT DE RÉPONSE:
- Résumé en 2-3 phrases maximum
- Liste de 3-5 points clés
- Un conseil pratique pour aider l'enfant

STYLE:
- Direct et efficace (les parents sont pressés)
- Pas de jargon pédagogique
- Concret et actionnable
"""

SYSTEM_PROMPT_OCR_ANALYSIS = """Analyse cette image d'une leçon scolaire.

EXTRAIS:
1. La matière (maths, français, histoire, etc.)
2. Le sujet/chapitre
3. Les concepts clés
4. Les définitions importantes
5. Les exemples donnés

FORMATE ta réponse en JSON:
{
    "subject": "...",
    "topic": "...",
    "key_concepts": ["...", "..."],
    "definitions": {"terme": "définition", ...},
    "examples": ["...", "..."],
    "summary": "..."
}
"""


# ============================================
# Fonctions utilitaires
# ============================================

def count_tokens_approx(text):
    """Estimation approximative du nombre de tokens (1 token ≈ 4 caractères en français)."""
    return len(text) // 4

def check_rate_limit(family_id):
    """Vérifier si la famille a atteint sa limite mensuelle."""
    db = get_db()
    family = db.execute('SELECT * FROM families WHERE id = ?', (family_id,)).fetchone()
    
    if not family:
        return False, "Famille non trouvée"
    
    # Réinitialiser le compteur si nouveau mois
    current_month = datetime.now().strftime('%Y-%m')
    if family['last_reset_date'] != current_month:
        db.execute('''
            UPDATE families 
            SET monthly_interactions = 0, last_reset_date = ? 
            WHERE id = ?
        ''', (current_month, family_id))
        db.commit()
        return True, None
    
    # Vérifier la limite selon le plan
    limit = app.config['MONTHLY_INTERACTION_LIMIT']
    if family['plan'] == 'premium':
        limit = limit * 2  # Double pour premium
    
    if family['monthly_interactions'] >= limit:
        return False, f"Limite mensuelle atteinte ({limit} interactions)"
    
    return True, None

def increment_interaction(family_id):
    """Incrémenter le compteur d'interactions."""
    db = get_db()
    db.execute('''
        UPDATE families 
        SET monthly_interactions = monthly_interactions + 1 
        WHERE id = ?
    ''', (family_id,))
    db.commit()


# ============================================
# Routes API - Authentification
# ============================================

@app.route('/api/health', methods=['GET'])
def health_check():
    """Vérification de l'état de l'API."""
    return jsonify({
        'status': 'ok',
        'version': '1.0.0',
        'name': 'EduFamily API'
    })

@app.route('/api/register', methods=['POST'])
def register():
    """Inscription d'une nouvelle famille."""
    data = request.json
    email = data.get('email')
    password = data.get('password')  # En prod: hasher avec bcrypt
    
    if not email or not password:
        return jsonify({'error': 'Email et mot de passe requis'}), 400
    
    db = get_db()
    try:
        db.execute('''
            INSERT INTO families (email, password_hash, last_reset_date) 
            VALUES (?, ?, ?)
        ''', (email, password, datetime.now().strftime('%Y-%m')))
        db.commit()
        
        family_id = db.execute('SELECT last_insert_rowid()').fetchone()[0]
        return jsonify({
            'success': True,
            'family_id': family_id,
            'message': 'Famille créée avec succès'
        })
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Cet email existe déjà'}), 400


# ============================================
# Routes API - Gestion des enfants
# ============================================

@app.route('/api/children', methods=['POST'])
def create_child():
    """Créer un profil enfant."""
    data = request.json
    family_id = data.get('family_id')
    name = data.get('name')
    grade = data.get('grade')
    
    if not family_id or not name:
        return jsonify({'error': 'family_id et name requis'}), 400
    
    db = get_db()
    db.execute('''
        INSERT INTO children (family_id, name, grade) 
        VALUES (?, ?, ?)
    ''', (family_id, name, grade))
    db.commit()
    
    child_id = db.execute('SELECT last_insert_rowid()').fetchone()[0]
    return jsonify({
        'success': True,
        'child_id': child_id
    })

@app.route('/api/families/<int:family_id>/children', methods=['GET'])
def get_children(family_id):
    """Récupérer tous les enfants d'une famille."""
    db = get_db()
    children = db.execute('''
        SELECT * FROM children WHERE family_id = ?
    ''', (family_id,)).fetchall()
    
    return jsonify({
        'children': [dict(child) for child in children]
    })


# ============================================
# Routes API - Tutorat (Chat avec Claude)
# ============================================

@app.route('/api/chat', methods=['POST'])
def chat():
    """
    Endpoint principal pour le chat avec le tuteur.
    
    Modes:
    - 'child': Mode socratique (ne donne jamais la réponse)
    - 'parent': Mode explicatif (résumés clairs)
    """
    data = request.json
    message = data.get('message')
    mode = data.get('mode', 'child')
    session_id = data.get('session_id')
    child_id = data.get('child_id')
    family_id = data.get('family_id')
    
    if not message:
        return jsonify({'error': 'Message requis'}), 400
    
    # Vérifier la limite de requêtes
    if family_id:
        allowed, error = check_rate_limit(family_id)
        if not allowed:
            return jsonify({'error': error}), 429
    
    # Récupérer l'historique de la session
    conversation_history = []
    db = get_db()
    
    if session_id:
        messages = db.execute('''
            SELECT role, content FROM messages 
            WHERE session_id = ? 
            ORDER BY created_at ASC
            LIMIT 10
        ''', (session_id,)).fetchall()
        
        conversation_history = [
            {'role': msg['role'], 'content': msg['content']} 
            for msg in messages
        ]
    
    # Récupérer le profil de l'enfant pour personnaliser
    child_context = ""
    if child_id:
        child = db.execute('SELECT * FROM children WHERE id = ?', (child_id,)).fetchone()
        if child:
            child_context = f"\n\nContexte: L'enfant s'appelle {child['name']}"
            if child['grade']:
                child_context += f", il/elle est en {child['grade']}"
            if child['learning_style']:
                child_context += f". Style d'apprentissage: {child['learning_style']}"
    
    # Choisir le prompt système selon le mode
    system_prompt = SYSTEM_PROMPT_CHILD if mode == 'child' else SYSTEM_PROMPT_PARENT
    system_prompt += child_context
    
    # Ajouter le nouveau message
    conversation_history.append({
        'role': 'user',
        'content': message
    })
    
    # Appeler Claude API
    client = get_anthropic_client()
    
    if client:
        try:
            response = client.messages.create(
                model="claude-3-haiku-20240307",  # Modèle économique
                max_tokens=app.config['MAX_TOKENS_PER_RESPONSE'],
                system=system_prompt,
                messages=conversation_history
            )
            
            assistant_message = response.content[0].text
            tokens_used = response.usage.input_tokens + response.usage.output_tokens
            
        except Exception as e:
            return jsonify({'error': f'Erreur API Claude: {str(e)}'}), 500
    else:
        # Mode démo sans API key
        assistant_message = simulate_response(message, mode)
        tokens_used = count_tokens_approx(assistant_message)
    
    # Sauvegarder les messages
    if session_id:
        db.execute('''
            INSERT INTO messages (session_id, role, content, tokens_used) 
            VALUES (?, 'user', ?, 0)
        ''', (session_id, message))
        
        db.execute('''
            INSERT INTO messages (session_id, role, content, tokens_used) 
            VALUES (?, 'assistant', ?, ?)
        ''', (session_id, assistant_message, tokens_used))
        db.commit()
    
    # Incrémenter le compteur
    if family_id:
        increment_interaction(family_id)
    
    return jsonify({
        'response': assistant_message,
        'tokens_used': tokens_used,
        'session_id': session_id
    })


def simulate_response(message, mode):
    """Réponses simulées pour le mode démo (sans API key)."""
    message_lower = message.lower()
    
    if mode == 'parent':
        return """📚 **Résumé de la leçon**

Cette leçon porte sur les concepts fondamentaux. Voici les points clés:

✓ Point 1: Définition de base
✓ Point 2: Applications pratiques  
✓ Point 3: Exemples concrets

💡 **Conseil**: Utilisez des objets du quotidien pour illustrer ces concepts avec votre enfant."""

    # Mode enfant - réponses socratiques
    if 'réponse' in message_lower or 'solution' in message_lower:
        return "Je sais que tu peux trouver ! 💪 Dis-moi d'abord ce que tu as déjà essayé. Qu'est-ce qui te bloque exactement ?"
    
    if 'comprends pas' in message_lower or 'difficile' in message_lower:
        return "C'est normal de trouver ça difficile au début ! 🤗 Dis-moi: qu'est-ce que tu comprends déjà sur ce sujet ? On va partir de là."
    
    if 'fraction' in message_lower:
        return "Les fractions, c'est comme couper un gâteau ! 🎂 Si tu coupes un gâteau en 4 parts égales et que tu en prends 1, quelle fraction du gâteau as-tu pris ? Essaie de me répondre !"
    
    if '1/4' in message_lower or 'quart' in message_lower:
        return "Excellent ! 🌟 Tu as bien compris ! Maintenant, si tu prends 2 parts sur 4, quelle fraction ça fait ? Et devine quoi: c'est la même chose qu'une autre fraction très connue..."
    
    return "Intéressant ! 🧠 Peux-tu m'en dire plus sur ce que tu penses ? Il n'y a pas de mauvaise réponse - je veux juste comprendre comment tu réfléchis."


# ============================================
# Routes API - Analyse de leçons (OCR)
# ============================================

@app.route('/api/analyze-lesson', methods=['POST'])
def analyze_lesson():
    """
    Analyser une photo de leçon.
    
    Accepte:
    - image en base64
    - ou fichier uploadé
    """
    family_id = request.form.get('family_id') or request.json.get('family_id')
    
    # Récupérer l'image
    image_data = None
    
    if 'image' in request.files:
        file = request.files['image']
        image_data = base64.b64encode(file.read()).decode('utf-8')
    elif request.json and 'image_base64' in request.json:
        image_data = request.json['image_base64']
        # Nettoyer le préfixe data:image si présent
        if ',' in image_data:
            image_data = image_data.split(',')[1]
    
    if not image_data:
        return jsonify({'error': 'Image requise'}), 400
    
    # Analyser avec Claude Vision
    client = get_anthropic_client()
    
    if client:
        try:
            response = client.messages.create(
                model="claude-3-haiku-20240307",
                max_tokens=1000,
                messages=[{
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": image_data
                            }
                        },
                        {
                            "type": "text",
                            "text": SYSTEM_PROMPT_OCR_ANALYSIS
                        }
                    ]
                }]
            )
            
            result_text = response.content[0].text
            
            # Parser le JSON de la réponse
            try:
                # Extraire le JSON de la réponse
                json_match = re.search(r'\{[\s\S]*\}', result_text)
                if json_match:
                    analysis = json.loads(json_match.group())
                else:
                    analysis = {'raw_text': result_text}
            except json.JSONDecodeError:
                analysis = {'raw_text': result_text}
                
        except Exception as e:
            return jsonify({'error': f'Erreur analyse: {str(e)}'}), 500
    else:
        # Mode démo
        analysis = {
            "subject": "Mathématiques",
            "topic": "Les Fractions",
            "key_concepts": [
                "Numérateur",
                "Dénominateur", 
                "Fraction équivalente",
                "Simplification"
            ],
            "definitions": {
                "Numérateur": "Le nombre au-dessus de la barre de fraction",
                "Dénominateur": "Le nombre en-dessous de la barre de fraction"
            },
            "examples": [
                "1/2 = la moitié",
                "1/4 = un quart",
                "2/4 = 1/2 (fractions équivalentes)"
            ],
            "summary": "Cette leçon introduit les fractions comme représentation d'une partie d'un tout."
        }
    
    # Générer la carte mentale
    mind_map = generate_mind_map(analysis)
    
    # Générer le résumé pour les parents
    parent_summary = generate_parent_summary(analysis)
    
    # Sauvegarder en base
    if family_id:
        db = get_db()
        db.execute('''
            INSERT INTO lessons (family_id, subject, topic, extracted_text, key_points, mind_map_data)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            family_id,
            analysis.get('subject', ''),
            analysis.get('topic', ''),
            json.dumps(analysis),
            json.dumps(analysis.get('key_concepts', [])),
            json.dumps(mind_map)
        ))
        db.commit()
    
    return jsonify({
        'analysis': analysis,
        'mind_map': mind_map,
        'parent_summary': parent_summary
    })


def generate_mind_map(analysis):
    """Générer les données pour une carte mentale."""
    topic = analysis.get('topic', 'Leçon')
    concepts = analysis.get('key_concepts', [])[:6]  # Max 6 branches
    
    # Structure pour le frontend
    mind_map = {
        'center': {
            'label': topic,
            'color': '#6C5CE7'
        },
        'branches': []
    }
    
    colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD']
    
    for i, concept in enumerate(concepts):
        mind_map['branches'].append({
            'label': concept,
            'color': colors[i % len(colors)],
            'children': []  # Peut être étendu avec des sous-concepts
        })
    
    return mind_map


def generate_parent_summary(analysis):
    """Générer un résumé pour les parents."""
    return {
        'title': f"{analysis.get('subject', 'Matière')} - {analysis.get('topic', 'Sujet')}",
        'summary': analysis.get('summary', 'Résumé non disponible'),
        'key_points': analysis.get('key_concepts', []),
        'help_tip': "Pour aider votre enfant, utilisez des exemples concrets du quotidien et posez-lui des questions plutôt que de donner les réponses."
    }


# ============================================
# Routes API - Sessions et Historique
# ============================================

@app.route('/api/sessions', methods=['POST'])
def create_session():
    """Créer une nouvelle session de tutorat."""
    data = request.json
    child_id = data.get('child_id')
    subject = data.get('subject')
    topic = data.get('topic')
    
    if not child_id:
        return jsonify({'error': 'child_id requis'}), 400
    
    db = get_db()
    db.execute('''
        INSERT INTO sessions (child_id, subject, topic) 
        VALUES (?, ?, ?)
    ''', (child_id, subject, topic))
    db.commit()
    
    session_id = db.execute('SELECT last_insert_rowid()').fetchone()[0]
    return jsonify({
        'success': True,
        'session_id': session_id
    })

@app.route('/api/sessions/<int:session_id>/messages', methods=['GET'])
def get_session_messages(session_id):
    """Récupérer l'historique d'une session."""
    db = get_db()
    messages = db.execute('''
        SELECT * FROM messages 
        WHERE session_id = ? 
        ORDER BY created_at ASC
    ''', (session_id,)).fetchall()
    
    return jsonify({
        'messages': [dict(msg) for msg in messages]
    })

@app.route('/api/children/<int:child_id>/progress', methods=['GET'])
def get_child_progress(child_id):
    """Récupérer la progression d'un enfant."""
    db = get_db()
    progress = db.execute('''
        SELECT * FROM progress 
        WHERE child_id = ? 
        ORDER BY last_practiced DESC
    ''', (child_id,)).fetchall()
    
    sessions = db.execute('''
        SELECT COUNT(*) as count, subject 
        FROM sessions 
        WHERE child_id = ? 
        GROUP BY subject
    ''', (child_id,)).fetchall()
    
    return jsonify({
        'progress': [dict(p) for p in progress],
        'sessions_by_subject': [dict(s) for s in sessions]
    })


# ============================================
# Routes API - Statistiques (pour les parents)
# ============================================

@app.route('/api/families/<int:family_id>/stats', methods=['GET'])
def get_family_stats(family_id):
    """Statistiques d'utilisation pour une famille."""
    db = get_db()
    
    family = db.execute('SELECT * FROM families WHERE id = ?', (family_id,)).fetchone()
    
    children = db.execute('''
        SELECT c.*, 
               COUNT(DISTINCT s.id) as session_count,
               COUNT(m.id) as message_count
        FROM children c
        LEFT JOIN sessions s ON c.id = s.child_id
        LEFT JOIN messages m ON s.id = m.session_id
        WHERE c.family_id = ?
        GROUP BY c.id
    ''', (family_id,)).fetchall()
    
    return jsonify({
        'family': {
            'plan': family['plan'],
            'monthly_interactions': family['monthly_interactions'],
            'limit': app.config['MONTHLY_INTERACTION_LIMIT']
        },
        'children': [dict(child) for child in children]
    })


# ============================================
# Initialisation
# ============================================

@app.before_request
def before_request():
    """Initialiser la base de données si nécessaire."""
    init_db()


# ============================================
# Point d'entrée
# ============================================

if __name__ == '__main__':
    # Créer la base de données
    with app.app_context():
        init_db()
        print("✅ Base de données initialisée")
    
    # Vérifier la clé API
    if os.environ.get('ANTHROPIC_API_KEY'):
        print("✅ Clé API Anthropic configurée")
    else:
        print("⚠️  Mode démo (pas de clé API Anthropic)")
        print("   Pour activer Claude, définissez ANTHROPIC_API_KEY")
    
    print("\n🦊 EduFamily API démarrée!")
    print("   http://localhost:5000")
    print("\nEndpoints disponibles:")
    print("   POST /api/register - Créer une famille")
    print("   POST /api/children - Créer un profil enfant")
    print("   POST /api/chat - Chat avec le tuteur")
    print("   POST /api/analyze-lesson - Analyser une photo de leçon")
    print("   POST /api/sessions - Créer une session")
    print("   GET  /api/families/<id>/stats - Statistiques famille")
    
    app.run(debug=True, host='0.0.0.0', port=5000)
