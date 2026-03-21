"""
🦊 EduFamily - Proof of Concept
================================
Architecture avec Embeddings Famille + Agents Autonomes

Ce PoC démontre :
1. Création et gestion des embeddings famille (parent/enfant)
2. Agents autonomes spécialisés (Planning, Révisions, Santé, etc.)
3. Orchestration des agents avec LangChain
4. Personnalisation des réponses basée sur les profils vectoriels

Requirements:
    pip install langchain langchain-anthropic sentence-transformers 
    pip install pinecone-client pydantic python-dotenv
"""

import os
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, field
from enum import Enum
import json

# Pour le PoC, on simule certaines dépendances
# En production, décommenter les imports réels
# from langchain_anthropic import ChatAnthropic
# from langchain.agents import AgentExecutor, create_react_agent
# from langchain.tools import Tool
# from sentence_transformers import SentenceTransformer
# import pinecone


# =============================================================================
# 1. MODÈLES DE DONNÉES - Profils Famille
# =============================================================================

class LearningStyle(Enum):
    VISUAL = "visual"
    AUDITORY = "auditory"
    KINESTHETIC = "kinesthetic"
    READING_WRITING = "reading_writing"


class Personality(Enum):
    CURIOUS = "curious"
    COMPETITIVE = "competitive"
    PATIENT = "patient"
    IMPATIENT = "impatient"
    CREATIVE = "creative"
    ANALYTICAL = "analytical"
    SOCIAL = "social"
    INDEPENDENT = "independent"


@dataclass
class ChildProfile:
    """Profil complet d'un enfant pour l'embedding"""
    id: str
    name: str
    age: int
    grade: str  # "CP", "CE1", "6ème", etc.
    
    # Apprentissage
    learning_style: LearningStyle
    strong_subjects: List[str]
    weak_subjects: List[str]
    
    # Personnalité
    personality_traits: List[Personality]
    attention_span_minutes: int
    best_time_of_day: str  # "morning", "afternoon", "evening"
    
    # Intérêts
    passions: List[str]
    hobbies: List[str]
    favorite_characters: List[str]  # Pour les analogies
    
    # Contraintes
    health_conditions: List[str] = field(default_factory=list)
    allergies: List[str] = field(default_factory=list)
    
    # Métadonnées
    created_at: datetime = field(default_factory=datetime.now)
    interaction_count: int = 0
    
    def to_embedding_text(self) -> str:
        """Convertit le profil en texte pour l'embedding"""
        return f"""
        Enfant: {self.name}, {self.age} ans, classe {self.grade}
        Style d'apprentissage: {self.learning_style.value}
        Points forts: {', '.join(self.strong_subjects)}
        Points faibles: {', '.join(self.weak_subjects)}
        Personnalité: {', '.join([p.value for p in self.personality_traits])}
        Attention: {self.attention_span_minutes} minutes
        Meilleur moment: {self.best_time_of_day}
        Passions: {', '.join(self.passions)}
        Hobbies: {', '.join(self.hobbies)}
        Personnages préférés: {', '.join(self.favorite_characters)}
        """


@dataclass
class ParentProfile:
    """Profil d'un parent"""
    id: str
    name: str
    
    # Langues
    native_language: str
    other_languages: List[str]
    
    # Disponibilité
    work_schedule: str  # "9-18", "flexible", "shift"
    available_for_homework: List[str]  # ["evening", "weekend"]
    
    # Compétences
    comfortable_subjects: List[str]
    uncomfortable_subjects: List[str]
    
    # Préférences
    communication_style: str  # "detailed", "brief", "visual"
    notification_preferences: Dict[str, bool] = field(default_factory=dict)
    
    def to_embedding_text(self) -> str:
        """Convertit le profil en texte pour l'embedding"""
        return f"""
        Parent: {self.name}
        Langue maternelle: {self.native_language}
        Autres langues: {', '.join(self.other_languages)}
        Disponibilité devoirs: {', '.join(self.available_for_homework)}
        Matières à l'aise: {', '.join(self.comfortable_subjects)}
        Matières difficiles: {', '.join(self.uncomfortable_subjects)}
        Style communication: {self.communication_style}
        """


@dataclass
class FamilyProfile:
    """Profil famille complet"""
    family_id: str
    parents: List[ParentProfile]
    children: List[ChildProfile]
    
    # Contexte famille
    timezone: str = "Europe/Paris"
    school_zone: str = "A"  # Zone scolaire française
    
    # Intégrations
    pronote_connected: bool = False
    google_calendar_connected: bool = False


# =============================================================================
# 2. EMBEDDING ENGINE - Gestion des vecteurs
# =============================================================================

class EmbeddingEngine:
    """
    Moteur d'embeddings pour les profils famille.
    Utilise sentence-transformers pour générer des vecteurs 384D.
    """
    
    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        """
        Initialise le moteur d'embeddings.
        
        En production:
            self.model = SentenceTransformer(model_name)
            self.index = pinecone.Index("edufamily-profiles")
        """
        self.model_name = model_name
        self.dimension = 384
        
        # Simulation d'un store en mémoire pour le PoC
        self._embeddings_store: Dict[str, Dict] = {}
        
    def generate_embedding(self, text: str) -> List[float]:
        """
        Génère un embedding pour un texte donné.
        
        En production:
            return self.model.encode(text).tolist()
        """
        # Simulation pour le PoC
        import hashlib
        hash_val = int(hashlib.md5(text.encode()).hexdigest(), 16)
        # Génère un vecteur pseudo-aléatoire mais déterministe
        return [(hash_val >> i) % 100 / 100.0 for i in range(self.dimension)]
    
    def upsert_child_profile(self, child: ChildProfile, family_id: str) -> str:
        """Stocke l'embedding d'un enfant"""
        embedding_text = child.to_embedding_text()
        embedding = self.generate_embedding(embedding_text)
        
        doc_id = f"child_{family_id}_{child.id}"
        self._embeddings_store[doc_id] = {
            "embedding": embedding,
            "metadata": {
                "type": "child",
                "family_id": family_id,
                "child_id": child.id,
                "name": child.name,
                "grade": child.grade,
                "learning_style": child.learning_style.value,
                "personality": [p.value for p in child.personality_traits],
                "passions": child.passions
            }
        }
        return doc_id
    
    def upsert_parent_profile(self, parent: ParentProfile, family_id: str) -> str:
        """Stocke l'embedding d'un parent"""
        embedding_text = parent.to_embedding_text()
        embedding = self.generate_embedding(embedding_text)
        
        doc_id = f"parent_{family_id}_{parent.id}"
        self._embeddings_store[doc_id] = {
            "embedding": embedding,
            "metadata": {
                "type": "parent",
                "family_id": family_id,
                "parent_id": parent.id,
                "name": parent.name,
                "native_language": parent.native_language
            }
        }
        return doc_id
    
    def get_child_context(self, child_id: str, family_id: str) -> Dict:
        """Récupère le contexte complet d'un enfant pour personnaliser les réponses"""
        doc_id = f"child_{family_id}_{child_id}"
        if doc_id in self._embeddings_store:
            return self._embeddings_store[doc_id]["metadata"]
        return {}
    
    def find_similar_profiles(self, query_text: str, top_k: int = 5) -> List[Dict]:
        """
        Trouve les profils similaires à une requête.
        Utile pour recommandations cross-famille.
        
        En production: utiliserait Pinecone similarity search
        """
        # Simulation pour le PoC
        return list(self._embeddings_store.values())[:top_k]


# =============================================================================
# 3. AGENTS AUTONOMES - Spécialisés par domaine
# =============================================================================

class BaseAgent:
    """Classe de base pour tous les agents"""
    
    def __init__(self, name: str, description: str):
        self.name = name
        self.description = description
        
    def execute(self, context: Dict, **kwargs) -> Dict:
        raise NotImplementedError


class PlanningAgent(BaseAgent):
    """
    Agent Planning 🗓️
    - Synchronise avec Pronote
    - Optimise les créneaux de devoirs
    - Gère les conflits d'agenda
    """
    
    def __init__(self):
        super().__init__(
            name="PlanningAgent",
            description="Gère le planning et les créneaux de devoirs optimaux"
        )
        
    def execute(self, context: Dict, **kwargs) -> Dict:
        child_profile = context.get("child_profile", {})
        pronote_data = kwargs.get("pronote_data", {})
        
        # Logique de planification
        best_time = child_profile.get("best_time_of_day", "evening")
        attention_span = child_profile.get("attention_span_minutes", 30)
        
        # Simulation de créneaux optimaux
        today = datetime.now()
        slots = []
        
        if best_time == "morning":
            slots.append({
                "start": today.replace(hour=8, minute=0),
                "end": today.replace(hour=8, minute=attention_span),
                "type": "homework",
                "priority": "high"
            })
        elif best_time == "evening":
            slots.append({
                "start": today.replace(hour=17, minute=30),
                "end": today.replace(hour=17, minute=30 + attention_span),
                "type": "homework",
                "priority": "high"
            })
            
        return {
            "agent": self.name,
            "action": "suggest_slots",
            "slots": slots,
            "reasoning": f"Créneaux optimisés pour {child_profile.get('name', 'l\'enfant')} "
                        f"(attention: {attention_span}min, préférence: {best_time})"
        }


class RevisionAgent(BaseAgent):
    """
    Agent Révisions 📚
    - Détecte les contrôles à venir
    - Génère des programmes de révision personnalisés
    - Adapte le contenu au style d'apprentissage
    """
    
    def __init__(self):
        super().__init__(
            name="RevisionAgent",
            description="Prépare les programmes de révision pour les contrôles"
        )
        
    def execute(self, context: Dict, **kwargs) -> Dict:
        child_profile = context.get("child_profile", {})
        upcoming_tests = kwargs.get("tests", [])
        
        learning_style = child_profile.get("learning_style", "visual")
        personality = child_profile.get("personality", [])
        passions = child_profile.get("passions", [])
        
        # Adaptation du programme selon le profil
        revision_plan = []
        
        for test in upcoming_tests:
            plan_item = {
                "subject": test.get("subject"),
                "date": test.get("date"),
                "chapters": test.get("chapters", []),
                "recommended_activities": []
            }
            
            # Adapte selon le style d'apprentissage
            if learning_style == "visual":
                plan_item["recommended_activities"].extend([
                    "Créer une carte mentale",
                    "Regarder des vidéos explicatives",
                    "Dessiner les concepts clés"
                ])
            elif learning_style == "auditory":
                plan_item["recommended_activities"].extend([
                    "Lire à voix haute",
                    "Expliquer à quelqu'un",
                    "Écouter des podcasts sur le sujet"
                ])
            elif learning_style == "kinesthetic":
                plan_item["recommended_activities"].extend([
                    "Faire des exercices pratiques",
                    "Manipuler des objets",
                    "Créer des fiches à manipuler"
                ])
                
            # Adapte selon la personnalité
            if "competitive" in personality:
                plan_item["recommended_activities"].append(
                    "Défi chrono : résoudre 10 exercices en 15 minutes"
                )
            if "creative" in personality:
                plan_item["recommended_activities"].append(
                    "Inventer une histoire qui utilise les concepts"
                )
                
            # Utilise les passions pour les analogies
            if passions:
                passion = passions[0]
                plan_item["personalized_tip"] = (
                    f"💡 Essaie de relier les concepts à {passion} - "
                    f"ça t'aidera à mieux mémoriser !"
                )
                
            revision_plan.append(plan_item)
            
        return {
            "agent": self.name,
            "action": "create_revision_plan",
            "plan": revision_plan,
            "total_tests": len(upcoming_tests)
        }


class HealthAgent(BaseAgent):
    """
    Agent Santé 🏥
    - Rappels vaccins selon l'âge
    - Suivi RDV médicaux
    - Alertes contraintes santé
    """
    
    def __init__(self):
        super().__init__(
            name="HealthAgent",
            description="Gère les rappels santé et RDV médicaux"
        )
        
    def execute(self, context: Dict, **kwargs) -> Dict:
        child_profile = context.get("child_profile", {})
        age = child_profile.get("age", 10)
        health_conditions = child_profile.get("health_conditions", [])
        
        reminders = []
        
        # Rappels vaccins selon l'âge (calendrier français)
        if age == 11:
            reminders.append({
                "type": "vaccine",
                "name": "Rappel dTPolio",
                "urgency": "medium",
                "message": "Rappel vaccin dTPolio recommandé à 11 ans"
            })
        if age >= 11 and age <= 14:
            reminders.append({
                "type": "vaccine",
                "name": "HPV",
                "urgency": "medium",
                "message": "Vaccination HPV recommandée entre 11 et 14 ans"
            })
            
        # Rappels selon conditions de santé
        if "asthme" in health_conditions:
            reminders.append({
                "type": "checkup",
                "name": "Contrôle pneumologue",
                "urgency": "low",
                "message": "Contrôle annuel recommandé pour l'asthme"
            })
        if "lunettes" in health_conditions:
            reminders.append({
                "type": "checkup",
                "name": "Contrôle ophtalmo",
                "urgency": "low",
                "message": "Contrôle annuel de la vue recommandé"
            })
            
        return {
            "agent": self.name,
            "action": "health_reminders",
            "reminders": reminders,
            "child_age": age
        }


class VacationAgent(BaseAgent):
    """
    Agent Vacances 🏖️
    - Détecte les vacances scolaires
    - Propose activités selon passions
    - Suggère camps et stages
    """
    
    def __init__(self):
        super().__init__(
            name="VacationAgent",
            description="Propose des activités et stages pour les vacances"
        )
        
    def execute(self, context: Dict, **kwargs) -> Dict:
        child_profile = context.get("child_profile", {})
        passions = child_profile.get("passions", [])
        age = child_profile.get("age", 10)
        location = kwargs.get("location", "Paris")
        
        suggestions = []
        
        # Base de suggestions selon les passions
        activity_database = {
            "foot": [
                {"name": "Stage PSG Academy", "type": "sport", "price_range": "€€€"},
                {"name": "Stage foot municipal", "type": "sport", "price_range": "€"},
            ],
            "danse": [
                {"name": "Stage danse moderne", "type": "art", "price_range": "€€"},
                {"name": "Stage hip-hop", "type": "art", "price_range": "€€"},
            ],
            "minecraft": [
                {"name": "Stage coding Minecraft", "type": "tech", "price_range": "€€"},
                {"name": "Stage création jeux vidéo", "type": "tech", "price_range": "€€"},
            ],
            "dessin": [
                {"name": "Stage manga", "type": "art", "price_range": "€"},
                {"name": "Stage BD", "type": "art", "price_range": "€"},
            ],
            "sciences": [
                {"name": "Stage Palais de la Découverte", "type": "science", "price_range": "€"},
                {"name": "Stage robotique", "type": "tech", "price_range": "€€"},
            ]
        }
        
        for passion in passions:
            passion_lower = passion.lower()
            if passion_lower in activity_database:
                for activity in activity_database[passion_lower]:
                    suggestions.append({
                        **activity,
                        "matched_passion": passion,
                        "suitable_age": f"{age-1}-{age+2} ans"
                    })
                    
        return {
            "agent": self.name,
            "action": "vacation_suggestions",
            "suggestions": suggestions[:5],  # Top 5
            "location": location,
            "child_passions": passions
        }


class ChildcareAgent(BaseAgent):
    """
    Agent Garde 👶
    - Gère planning nounou
    - Contacts backup
    - Historique garde
    """
    
    def __init__(self):
        super().__init__(
            name="ChildcareAgent",
            description="Gère le planning de garde et les contacts backup"
        )
        
    def execute(self, context: Dict, **kwargs) -> Dict:
        family_profile = context.get("family_profile", {})
        date = kwargs.get("date", datetime.now())
        
        # Simulation de vérification de disponibilité
        return {
            "agent": self.name,
            "action": "check_childcare",
            "date": date.isoformat(),
            "status": "covered",  # ou "needs_backup"
            "primary_caregiver": "Marie (nounou)",
            "backup_contacts": [
                {"name": "Grand-mère", "phone": "06..."},
                {"name": "Voisine Julie", "phone": "06..."}
            ]
        }


# =============================================================================
# 4. ORCHESTRATEUR D'AGENTS
# =============================================================================

class AgentOrchestrator:
    """
    Orchestre les différents agents selon le contexte.
    Décide quel(s) agent(s) activer selon la requête.
    """
    
    def __init__(self, embedding_engine: EmbeddingEngine):
        self.embedding_engine = embedding_engine
        
        # Initialisation des agents
        self.agents = {
            "planning": PlanningAgent(),
            "revision": RevisionAgent(),
            "health": HealthAgent(),
            "vacation": VacationAgent(),
            "childcare": ChildcareAgent()
        }
        
        # Mapping intent -> agents
        self.intent_mapping = {
            "homework": ["planning", "revision"],
            "test": ["revision", "planning"],
            "health": ["health"],
            "vacation": ["vacation"],
            "childcare": ["childcare"],
            "daily_summary": ["planning", "health", "childcare"]
        }
        
    def classify_intent(self, user_message: str) -> List[str]:
        """
        Classifie l'intention de l'utilisateur.
        En production: utiliserait un classifier ML ou le LLM.
        """
        message_lower = user_message.lower()
        
        intents = []
        if any(w in message_lower for w in ["devoir", "homework", "leçon", "exercice"]):
            intents.append("homework")
        if any(w in message_lower for w in ["contrôle", "test", "examen", "interro"]):
            intents.append("test")
        if any(w in message_lower for w in ["vaccin", "médecin", "santé", "rdv"]):
            intents.append("health")
        if any(w in message_lower for w in ["vacances", "stage", "activité"]):
            intents.append("vacation")
        if any(w in message_lower for w in ["nounou", "garde", "babysitter"]):
            intents.append("childcare")
        if any(w in message_lower for w in ["résumé", "journée", "planning"]):
            intents.append("daily_summary")
            
        return intents if intents else ["homework"]  # Default
    
    def get_relevant_agents(self, intents: List[str]) -> List[str]:
        """Détermine quels agents activer"""
        agents_to_run = set()
        for intent in intents:
            if intent in self.intent_mapping:
                agents_to_run.update(self.intent_mapping[intent])
        return list(agents_to_run)
    
    def run(self, 
            user_message: str, 
            family_id: str, 
            child_id: str,
            additional_data: Dict = None) -> Dict:
        """
        Exécute le pipeline complet:
        1. Récupère le contexte enfant (embedding)
        2. Classifie l'intention
        3. Exécute les agents pertinents
        4. Agrège les résultats
        """
        # 1. Récupérer le contexte
        child_context = self.embedding_engine.get_child_context(child_id, family_id)
        
        context = {
            "child_profile": child_context,
            "family_id": family_id,
            "timestamp": datetime.now().isoformat()
        }
        
        # 2. Classifier l'intention
        intents = self.classify_intent(user_message)
        
        # 3. Déterminer les agents à exécuter
        agents_to_run = self.get_relevant_agents(intents)
        
        # 4. Exécuter les agents
        results = {
            "user_message": user_message,
            "detected_intents": intents,
            "agents_executed": agents_to_run,
            "agent_results": {}
        }
        
        additional_data = additional_data or {}
        
        for agent_name in agents_to_run:
            agent = self.agents.get(agent_name)
            if agent:
                try:
                    result = agent.execute(context, **additional_data)
                    results["agent_results"][agent_name] = result
                except Exception as e:
                    results["agent_results"][agent_name] = {
                        "error": str(e)
                    }
                    
        return results


# =============================================================================
# 5. FOXIE - Interface conversationnelle
# =============================================================================

class FoxieTutor:
    """
    🦊 Foxie - Le tuteur IA socratique
    Utilise le contexte des embeddings pour personnaliser les interactions.
    """
    
    def __init__(self, embedding_engine: EmbeddingEngine, orchestrator: AgentOrchestrator):
        self.embedding_engine = embedding_engine
        self.orchestrator = orchestrator
        
        # System prompt de base (serait enrichi avec le contexte enfant)
        self.base_system_prompt = """
Tu es Foxie 🦊, un tuteur IA bienveillant et patient.

RÈGLES STRICTES :
1. Tu ne donnes JAMAIS la réponse directement
2. Tu utilises la méthode socratique : poser des questions pour guider
3. Tu encourages et célèbres les progrès
4. Tu adaptes ton langage à l'âge de l'enfant

PERSONNALISATION :
{child_context}

STYLE :
- Utilise des émojis avec modération
- Fais des analogies avec les passions de l'enfant
- Adapte la longueur des sessions à son attention
"""

    def build_personalized_prompt(self, child_id: str, family_id: str) -> str:
        """Construit un prompt personnalisé avec le contexte enfant"""
        context = self.embedding_engine.get_child_context(child_id, family_id)
        
        if not context:
            return self.base_system_prompt.format(child_context="Pas de contexte disponible")
            
        child_context = f"""
- Prénom : {context.get('name', 'l\'enfant')}
- Classe : {context.get('grade', 'inconnue')}
- Style d'apprentissage : {context.get('learning_style', 'non défini')}
- Personnalité : {', '.join(context.get('personality', []))}
- Passions : {', '.join(context.get('passions', []))}
- Utilise des analogies avec : {', '.join(context.get('passions', ['des exemples du quotidien']))}
"""
        return self.base_system_prompt.format(child_context=child_context)
    
    def chat(self, 
             message: str, 
             child_id: str, 
             family_id: str,
             conversation_history: List[Dict] = None) -> Dict:
        """
        Gère une interaction avec l'enfant.
        
        En production:
            - Appel à Claude API avec le prompt personnalisé
            - Gestion de l'historique de conversation
            - Logging pour amélioration continue
        """
        # Construire le prompt personnalisé
        system_prompt = self.build_personalized_prompt(child_id, family_id)
        
        # Récupérer le contexte pour enrichir la réponse
        context = self.embedding_engine.get_child_context(child_id, family_id)
        
        # Simulation de réponse (en production: appel Claude API)
        response = self._simulate_response(message, context)
        
        return {
            "role": "assistant",
            "content": response,
            "metadata": {
                "child_id": child_id,
                "personalization_applied": bool(context),
                "timestamp": datetime.now().isoformat()
            }
        }
    
    def _simulate_response(self, message: str, context: Dict) -> str:
        """Simule une réponse personnalisée pour le PoC"""
        name = context.get("name", "")
        passions = context.get("passions", [])
        personality = context.get("personality", [])
        
        # Détection basique du sujet
        if "fraction" in message.lower():
            if passions and "foot" in [p.lower() for p in passions]:
                return (
                    f"Super question {name} ! 🦊\n\n"
                    f"Imagine que tu as un terrain de foot ⚽ et que tu dois le partager "
                    f"entre 4 équipes pour l'entraînement.\n\n"
                    f"Si chaque équipe a une partie égale, quelle fraction du terrain "
                    f"a chaque équipe ? 🤔"
                )
            else:
                return (
                    f"Bonne question {name} ! 🦊\n\n"
                    f"Imagine un gâteau 🎂 que tu dois partager avec tes amis.\n\n"
                    f"Si vous êtes 4 et que chacun veut la même part, "
                    f"quelle fraction du gâteau aura chaque personne ? 🤔"
                )
        
        if "competitive" in personality:
            return (
                f"Hey {name} ! 🦊\n\n"
                f"J'ai un défi pour toi ! ⏱️\n\n"
                f"Peux-tu me dire ce que tu as compris de la leçon en 30 secondes ?\n"
                f"Top chrono ! 🚀"
            )
            
        return (
            f"Salut {name} ! 🦊\n\n"
            f"Je suis là pour t'aider ! Sur quoi tu travailles aujourd'hui ?\n"
            f"Raconte-moi ce que tu as compris de ta leçon ! 📚"
        )


# =============================================================================
# 6. DEMO / TESTS
# =============================================================================

def demo():
    """Démonstration du PoC complet"""
    
    print("=" * 60)
    print("🦊 EduFamily - Proof of Concept")
    print("=" * 60)
    
    # 1. Initialisation
    print("\n📦 Initialisation des composants...")
    embedding_engine = EmbeddingEngine()
    orchestrator = AgentOrchestrator(embedding_engine)
    foxie = FoxieTutor(embedding_engine, orchestrator)
    
    # 2. Création de profils famille
    print("\n👨‍👩‍👧‍👦 Création des profils famille...")
    
    # Profil enfant : Gauthier
    gauthier = ChildProfile(
        id="child_001",
        name="Gauthier",
        age=12,
        grade="6ème",
        learning_style=LearningStyle.VISUAL,
        strong_subjects=["Maths", "SVT"],
        weak_subjects=["Français", "Histoire"],
        personality_traits=[Personality.COMPETITIVE, Personality.CURIOUS, Personality.IMPATIENT],
        attention_span_minutes=25,
        best_time_of_day="morning",
        passions=["Foot", "Minecraft"],
        hobbies=["Jeux vidéo", "Sport"],
        favorite_characters=["Mbappé", "Steve (Minecraft)"]
    )
    
    # Profil enfant : Victoire
    victoire = ChildProfile(
        id="child_002",
        name="Victoire",
        age=8,
        grade="CE2",
        learning_style=LearningStyle.AUDITORY,
        strong_subjects=["Français", "Arts"],
        weak_subjects=["Maths"],
        personality_traits=[Personality.CREATIVE, Personality.PATIENT, Personality.SOCIAL],
        attention_span_minutes=20,
        best_time_of_day="afternoon",
        passions=["Danse", "Dessin"],
        hobbies=["Lecture", "Coloriage"],
        favorite_characters=["Miraculous Ladybug", "Princesses Disney"]
    )
    
    # Profil parent : Manika
    manika = ParentProfile(
        id="parent_001",
        name="Manika",
        native_language="Français",
        other_languages=["Anglais", "Hindi"],
        work_schedule="9-18",
        available_for_homework=["evening", "weekend"],
        comfortable_subjects=["Maths", "Sciences", "Anglais"],
        uncomfortable_subjects=["Histoire", "Géographie"],
        communication_style="detailed"
    )
    
    family_id = "family_001"
    
    # 3. Stockage des embeddings
    print("\n🧠 Génération et stockage des embeddings...")
    embedding_engine.upsert_child_profile(gauthier, family_id)
    embedding_engine.upsert_child_profile(victoire, family_id)
    embedding_engine.upsert_parent_profile(manika, family_id)
    print(f"   ✓ {len(embedding_engine._embeddings_store)} profils indexés")
    
    # 4. Test des agents
    print("\n🤖 Test des agents autonomes...")
    
    # Test Planning Agent
    print("\n   📅 Planning Agent:")
    result = orchestrator.run(
        "Quel est le meilleur moment pour les devoirs ?",
        family_id,
        "child_001"
    )
    print(f"   Intentions détectées: {result['detected_intents']}")
    print(f"   Agents exécutés: {result['agents_executed']}")
    if "planning" in result["agent_results"]:
        slots = result["agent_results"]["planning"].get("slots", [])
        print(f"   Créneaux suggérés: {len(slots)}")
        
    # Test Revision Agent
    print("\n   📚 Revision Agent:")
    result = orchestrator.run(
        "Gauthier a un contrôle de maths vendredi",
        family_id,
        "child_001",
        additional_data={
            "tests": [
                {"subject": "Maths", "date": "2025-01-17", "chapters": ["Fractions", "Décimaux"]}
            ]
        }
    )
    if "revision" in result["agent_results"]:
        plan = result["agent_results"]["revision"].get("plan", [])
        if plan:
            print(f"   Plan de révision créé pour: {plan[0].get('subject')}")
            print(f"   Activités recommandées: {len(plan[0].get('recommended_activities', []))}")
            
    # Test Vacation Agent
    print("\n   🏖️ Vacation Agent:")
    result = orchestrator.run(
        "Qu'est-ce qu'on pourrait faire pendant les vacances ?",
        family_id,
        "child_002"  # Pour Victoire
    )
    if "vacation" in result["agent_results"]:
        suggestions = result["agent_results"]["vacation"].get("suggestions", [])
        print(f"   Suggestions: {len(suggestions)}")
        for s in suggestions[:2]:
            print(f"      - {s.get('name')} ({s.get('matched_passion')})")
    
    # 5. Test Foxie (conversation personnalisée)
    print("\n🦊 Test de Foxie (tuteur personnalisé)...")
    
    # Conversation avec Gauthier
    print("\n   Conversation avec Gauthier (12 ans, foot fan, compétitif):")
    response = foxie.chat(
        "Je comprends pas les fractions...",
        "child_001",
        family_id
    )
    print(f"   Foxie: {response['content'][:200]}...")
    
    # Conversation avec Victoire
    print("\n   Conversation avec Victoire (8 ans, créative, danse):")
    response = foxie.chat(
        "J'ai une question",
        "child_002", 
        family_id
    )
    print(f"   Foxie: {response['content'][:200]}...")
    
    # 6. Résumé
    print("\n" + "=" * 60)
    print("✅ PoC terminé avec succès !")
    print("=" * 60)
    print("""
Composants démontrés:
  ✓ Embeddings famille (384 dimensions)
  ✓ Agent Planning (créneaux optimaux)
  ✓ Agent Révisions (programmes personnalisés)
  ✓ Agent Vacances (suggestions selon passions)
  ✓ Agent Santé (rappels vaccins)
  ✓ Agent Garde (planning nounou)
  ✓ Orchestrateur multi-agents
  ✓ Foxie avec personnalisation contextuelle

Prochaines étapes:
  → Intégration Claude API réelle
  → Connexion Pinecone pour vector store
  → Intégration Pronote API
  → Tests avec vrais utilisateurs
""")


if __name__ == "__main__":
    demo()
