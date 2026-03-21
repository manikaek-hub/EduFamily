"""
EduFamily - Script de Vectorisation du Curriculum
==================================================
Ce script charge le curriculum JSON et le vectorise dans Pinecone
pour permettre à Foxie de retrouver les bonnes fiches pédagogiques.

Prérequis:
    pip install pinecone-client openai python-dotenv

Configuration:
    Créer un fichier .env avec:
    PINECONE_API_KEY=your_pinecone_api_key
    OPENAI_API_KEY=your_openai_api_key  # Pour les embeddings
    # OU
    VOYAGE_API_KEY=your_voyage_api_key  # Alternative moins chère
"""

import json
import os
import hashlib
from typing import List, Dict, Any
from dataclasses import dataclass
from dotenv import load_dotenv

# Charger les variables d'environnement
load_dotenv()

# =============================================================================
# CONFIGURATION
# =============================================================================

@dataclass
class Config:
    # Pinecone
    PINECONE_API_KEY: str = os.getenv("PINECONE_API_KEY", "")
    PINECONE_INDEX_NAME: str = "edufamily-curriculum"
    PINECONE_ENVIRONMENT: str = "gcp-starter"  # ou "us-east-1-aws" selon ton plan
    
    # Embeddings (choisir UN des deux)
    EMBEDDING_PROVIDER: str = "openai"  # "openai" ou "voyage"
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    VOYAGE_API_KEY: str = os.getenv("VOYAGE_API_KEY", "")
    
    # Modèles d'embeddings
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-small"  # 1536 dims, moins cher
    VOYAGE_EMBEDDING_MODEL: str = "voyage-2"  # 1024 dims
    
    # Dimensions selon le modèle
    EMBEDDING_DIMENSIONS: int = 1536  # OpenAI small=1536, Voyage-2=1024


config = Config()


# =============================================================================
# CLASSE PRINCIPALE DE VECTORISATION
# =============================================================================

class CurriculumVectorizer:
    """
    Gère la vectorisation du curriculum EduFamily dans Pinecone.
    """
    
    def __init__(self, config: Config):
        self.config = config
        self.pinecone_index = None
        self.embedding_client = None
        
    def initialize(self):
        """Initialise les clients Pinecone et Embeddings."""
        print("🔧 Initialisation des clients...")
        
        # Initialiser Pinecone
        self._init_pinecone()
        
        # Initialiser le client d'embeddings
        self._init_embeddings()
        
        print("✅ Clients initialisés avec succès!")
        
    def _init_pinecone(self):
        """Initialise Pinecone et crée l'index si nécessaire."""
        try:
            from pinecone import Pinecone, ServerlessSpec
            
            pc = Pinecone(api_key=self.config.PINECONE_API_KEY)
            
            # Vérifier si l'index existe
            existing_indexes = [idx.name for idx in pc.list_indexes()]
            
            if self.config.PINECONE_INDEX_NAME not in existing_indexes:
                print(f"📦 Création de l'index '{self.config.PINECONE_INDEX_NAME}'...")
                pc.create_index(
                    name=self.config.PINECONE_INDEX_NAME,
                    dimension=self.config.EMBEDDING_DIMENSIONS,
                    metric="cosine",
                    spec=ServerlessSpec(
                        cloud="aws",
                        region="us-east-1"
                    )
                )
                print("✅ Index créé!")
            else:
                print(f"✅ Index '{self.config.PINECONE_INDEX_NAME}' existe déjà")
            
            self.pinecone_index = pc.Index(self.config.PINECONE_INDEX_NAME)
            
            # Stats de l'index
            stats = self.pinecone_index.describe_index_stats()
            print(f"📊 Vecteurs actuels dans l'index: {stats.total_vector_count}")
            
        except ImportError:
            print("❌ Pinecone non installé. Run: pip install pinecone-client")
            raise
            
    def _init_embeddings(self):
        """Initialise le client d'embeddings (OpenAI ou Voyage)."""
        if self.config.EMBEDDING_PROVIDER == "openai":
            try:
                from openai import OpenAI
                self.embedding_client = OpenAI(api_key=self.config.OPENAI_API_KEY)
                print("✅ Client OpenAI initialisé")
            except ImportError:
                print("❌ OpenAI non installé. Run: pip install openai")
                raise
        elif self.config.EMBEDDING_PROVIDER == "voyage":
            try:
                import voyageai
                self.embedding_client = voyageai.Client(api_key=self.config.VOYAGE_API_KEY)
                print("✅ Client Voyage initialisé")
            except ImportError:
                print("❌ VoyageAI non installé. Run: pip install voyageai")
                raise
    
    def get_embedding(self, text: str) -> List[float]:
        """Génère l'embedding pour un texte."""
        if self.config.EMBEDDING_PROVIDER == "openai":
            response = self.embedding_client.embeddings.create(
                model=self.config.OPENAI_EMBEDDING_MODEL,
                input=text
            )
            return response.data[0].embedding
        elif self.config.EMBEDDING_PROVIDER == "voyage":
            result = self.embedding_client.embed(
                [text],
                model=self.config.VOYAGE_EMBEDDING_MODEL
            )
            return result.embeddings[0]
    
    def get_embeddings_batch(self, texts: List[str], batch_size: int = 100) -> List[List[float]]:
        """Génère les embeddings pour plusieurs textes (plus efficace)."""
        all_embeddings = []
        
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            print(f"  📤 Embedding batch {i//batch_size + 1}/{(len(texts)-1)//batch_size + 1}...")
            
            if self.config.EMBEDDING_PROVIDER == "openai":
                response = self.embedding_client.embeddings.create(
                    model=self.config.OPENAI_EMBEDDING_MODEL,
                    input=batch
                )
                batch_embeddings = [item.embedding for item in response.data]
            elif self.config.EMBEDDING_PROVIDER == "voyage":
                result = self.embedding_client.embed(
                    batch,
                    model=self.config.VOYAGE_EMBEDDING_MODEL
                )
                batch_embeddings = result.embeddings
            
            all_embeddings.extend(batch_embeddings)
        
        return all_embeddings
    
    def fiche_to_text(self, fiche: Dict[str, Any]) -> str:
        """
        Convertit une fiche en texte optimisé pour l'embedding.
        On inclut les éléments les plus importants pour le matching sémantique.
        """
        parts = []
        
        # Concept principal (très important)
        parts.append(f"Concept: {fiche.get('concept', '')}")
        
        # Niveau et matière (pour le contexte)
        parts.append(f"Niveau: {fiche.get('niveau', '')} - Matière: {fiche.get('matiere', '')}")
        
        # Chapitre
        if fiche.get('chapitre'):
            parts.append(f"Chapitre: {fiche['chapitre']}")
        
        # Définition (très important pour la compréhension)
        if fiche.get('definition'):
            parts.append(f"Définition: {fiche['definition']}")
        
        # Mots-clés (importants pour le matching)
        if fiche.get('mots_cles'):
            parts.append(f"Mots-clés: {', '.join(fiche['mots_cles'])}")
        
        # Méthode résumée (premiers éléments)
        if fiche.get('methode'):
            methode_text = ' '.join(fiche['methode'][:5])  # 5 premières étapes
            parts.append(f"Méthode: {methode_text}")
        
        # Erreurs fréquentes (utile pour anticiper)
        if fiche.get('erreurs_frequentes'):
            erreurs_text = ' '.join(fiche['erreurs_frequentes'][:3])
            parts.append(f"Erreurs courantes: {erreurs_text}")
        
        return '\n'.join(parts)
    
    def fiche_to_metadata(self, fiche: Dict[str, Any]) -> Dict[str, Any]:
        """
        Extrait les metadata pour le filtrage dans Pinecone.
        Ces champs permettent de filtrer AVANT la recherche vectorielle.
        """
        return {
            "id": fiche.get("id", ""),
            "niveau": fiche.get("niveau", ""),
            "matiere": fiche.get("matiere", ""),
            "chapitre": fiche.get("chapitre", ""),
            "concept": fiche.get("concept", ""),
            # Stocker le contenu complet en JSON pour récupération
            "full_content": json.dumps(fiche, ensure_ascii=False)
        }
    
    def load_curriculum(self, filepath: str) -> List[Dict[str, Any]]:
        """Charge le curriculum JSON et extrait toutes les fiches."""
        print(f"📂 Chargement du curriculum depuis {filepath}...")
        
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        fiches = []
        curriculum = data.get("curriculum", {})
        
        for niveau, niveau_data in curriculum.items():
            # Récupérer les fiches maths
            for fiche in niveau_data.get("maths", []):
                fiches.append(fiche)
            
            # Récupérer les fiches français
            for fiche in niveau_data.get("francais", []):
                fiches.append(fiche)
        
        print(f"✅ {len(fiches)} fiches chargées")
        return fiches
    
    def vectorize_and_upsert(self, fiches: List[Dict[str, Any]]):
        """Vectorise les fiches et les insère dans Pinecone."""
        print(f"\n🚀 Vectorisation de {len(fiches)} fiches...")
        
        # Préparer les textes pour l'embedding
        texts = [self.fiche_to_text(fiche) for fiche in fiches]
        
        # Générer les embeddings en batch
        print("🧮 Génération des embeddings...")
        embeddings = self.get_embeddings_batch(texts)
        
        # Préparer les vecteurs pour Pinecone
        vectors = []
        for i, (fiche, embedding) in enumerate(zip(fiches, embeddings)):
            vector_id = fiche.get("id", f"fiche_{i}")
            metadata = self.fiche_to_metadata(fiche)
            
            vectors.append({
                "id": vector_id,
                "values": embedding,
                "metadata": metadata
            })
        
        # Upsert dans Pinecone (par batches de 100)
        print("📤 Upload vers Pinecone...")
        batch_size = 100
        for i in range(0, len(vectors), batch_size):
            batch = vectors[i:i + batch_size]
            self.pinecone_index.upsert(vectors=batch)
            print(f"  ✅ Batch {i//batch_size + 1}/{(len(vectors)-1)//batch_size + 1} uploadé")
        
        # Vérifier
        stats = self.pinecone_index.describe_index_stats()
        print(f"\n✅ Vectorisation terminée!")
        print(f"📊 Total vecteurs dans l'index: {stats.total_vector_count}")
    
    def search(self, query: str, niveau: str = None, matiere: str = None, top_k: int = 3) -> List[Dict]:
        """
        Recherche les fiches les plus pertinentes pour une question.
        
        Args:
            query: La question de l'élève
            niveau: Filtrer par niveau (CE2, 6ème, 4ème)
            matiere: Filtrer par matière (maths, français)
            top_k: Nombre de résultats
        
        Returns:
            Liste des fiches pertinentes avec leur score
        """
        print(f"\n🔍 Recherche: '{query[:50]}...'")
        
        # Générer l'embedding de la requête
        query_embedding = self.get_embedding(query)
        
        # Construire le filtre
        filter_dict = {}
        if niveau:
            filter_dict["niveau"] = niveau
        if matiere:
            filter_dict["matiere"] = matiere
        
        # Rechercher dans Pinecone
        results = self.pinecone_index.query(
            vector=query_embedding,
            top_k=top_k,
            include_metadata=True,
            filter=filter_dict if filter_dict else None
        )
        
        # Parser les résultats
        fiches_trouvees = []
        for match in results.matches:
            fiche_data = json.loads(match.metadata.get("full_content", "{}"))
            fiches_trouvees.append({
                "score": match.score,
                "id": match.id,
                "concept": match.metadata.get("concept"),
                "niveau": match.metadata.get("niveau"),
                "matiere": match.metadata.get("matiere"),
                "fiche": fiche_data
            })
            print(f"  📄 {match.metadata.get('concept')} (score: {match.score:.3f})")
        
        return fiches_trouvees


# =============================================================================
# FONCTIONS UTILITAIRES POUR FOXIE
# =============================================================================

class FoxieRAG:
    """
    Interface simplifiée pour que Foxie utilise le RAG.
    """
    
    def __init__(self, vectorizer: CurriculumVectorizer):
        self.vectorizer = vectorizer
    
    def get_context_for_question(self, question: str, child_level: str, subject: str = None) -> str:
        """
        Récupère le contexte pédagogique pertinent pour une question.
        Retourne un texte formaté à injecter dans le prompt de Foxie.
        
        Args:
            question: La question de l'enfant
            child_level: Le niveau de l'enfant (CE2, 6ème, 4ème)
            subject: La matière si connue (maths, français)
        
        Returns:
            Contexte formaté pour le prompt
        """
        # Rechercher les fiches pertinentes
        results = self.vectorizer.search(
            query=question,
            niveau=child_level,
            matiere=subject,
            top_k=2  # On prend les 2 plus pertinentes
        )
        
        if not results:
            return ""
        
        # Formater le contexte
        context_parts = ["[CONTEXTE PÉDAGOGIQUE]"]
        
        for i, result in enumerate(results):
            fiche = result["fiche"]
            context_parts.append(f"\n--- Fiche {i+1}: {fiche.get('concept')} ---")
            
            # Définition
            if fiche.get("definition"):
                context_parts.append(f"Définition: {fiche['definition']}")
            
            # Méthode
            if fiche.get("methode"):
                context_parts.append("Méthode:")
                for step in fiche["methode"][:5]:
                    context_parts.append(f"  {step}")
            
            # Erreurs à anticiper
            if fiche.get("erreurs_frequentes"):
                context_parts.append("Erreurs fréquentes à anticiper:")
                for err in fiche["erreurs_frequentes"][:3]:
                    context_parts.append(f"  - {err}")
            
            # Questions socratiques suggérées
            if fiche.get("questions_socratiques"):
                context_parts.append("Questions socratiques suggérées:")
                for q in fiche["questions_socratiques"]:
                    context_parts.append(f"  - {q}")
            
            # Astuces Foxie
            if fiche.get("astuces_foxie"):
                context_parts.append("Astuces à partager:")
                for tip in fiche["astuces_foxie"][:2]:
                    context_parts.append(f"  💡 {tip}")
        
        context_parts.append("\n[FIN CONTEXTE]")
        
        return "\n".join(context_parts)
    
    def build_foxie_prompt(self, question: str, child_name: str, child_level: str, 
                           child_age: int, subject: str = None, passions: List[str] = None) -> str:
        """
        Construit le prompt complet pour Foxie avec le contexte RAG.
        
        Args:
            question: La question de l'enfant
            child_name: Prénom de l'enfant
            child_level: Niveau scolaire
            child_age: Âge
            subject: Matière si connue
            passions: Liste des passions de l'enfant (pour les analogies)
        
        Returns:
            Prompt complet pour Claude
        """
        # Récupérer le contexte pédagogique
        pedagogical_context = self.get_context_for_question(question, child_level, subject)
        
        # Construire le prompt système
        system_prompt = f"""Tu es Foxie 🦊, un tuteur IA bienveillant et intelligent pour les devoirs.
Tu aides {child_name}, {child_age} ans, en classe de {child_level}.

## TON RÔLE FONDAMENTAL
Tu es un tuteur SOCRATIQUE. Tu ne donnes JAMAIS les réponses directement. Tu guides l'élève vers la découverte par le questionnement.

## RÈGLES ABSOLUES
1. JAMAIS de réponse directe - guide par des questions
2. Adapte ton langage au niveau {child_level} ({child_age} ans)
3. Si l'élève est frustré, reconnais son émotion d'abord
4. Célèbre les efforts, même si la réponse est fausse
5. Utilise le contexte pédagogique ci-dessous pour guider

{pedagogical_context}

## INFORMATIONS SUR L'ENFANT
- Prénom: {child_name}
- Âge: {child_age} ans
- Niveau: {child_level}
"""
        
        # Ajouter les passions si disponibles (pour les analogies)
        if passions:
            system_prompt += f"- Passions: {', '.join(passions)} (utilise-les pour des analogies si pertinent)\n"
        
        system_prompt += """
## FORMAT DE TES RÉPONSES
- Court (2-4 phrases max)
- Un emoji pertinent parfois
- Termine par une question pour faire réfléchir
- Ton chaleureux adapté à l'âge

Rappel: Tu as le contexte pédagogique ci-dessus. Utilise-le pour:
- Poser les bonnes questions socratiques
- Anticiper les erreurs fréquentes
- Guider vers la bonne méthode
- Partager des astuces au bon moment

MAIS ne récite jamais le contexte directement à l'élève !
"""
        
        return system_prompt


# =============================================================================
# SCRIPT PRINCIPAL
# =============================================================================

def main():
    """Script principal de vectorisation."""
    
    print("=" * 60)
    print("🦊 EduFamily - Vectorisation du Curriculum")
    print("=" * 60)
    
    # Vérifier les clés API
    if not config.PINECONE_API_KEY:
        print("❌ PINECONE_API_KEY non configurée!")
        print("   Créez un fichier .env avec: PINECONE_API_KEY=your_key")
        return
    
    if config.EMBEDDING_PROVIDER == "openai" and not config.OPENAI_API_KEY:
        print("❌ OPENAI_API_KEY non configurée!")
        print("   Créez un fichier .env avec: OPENAI_API_KEY=your_key")
        return
    
    if config.EMBEDDING_PROVIDER == "voyage" and not config.VOYAGE_API_KEY:
        print("❌ VOYAGE_API_KEY non configurée!")
        print("   Créez un fichier .env avec: VOYAGE_API_KEY=your_key")
        return
    
    # Initialiser le vectorizer
    vectorizer = CurriculumVectorizer(config)
    vectorizer.initialize()
    
    # Charger le curriculum
    curriculum_path = "edufamily_curriculum.json"
    fiches = vectorizer.load_curriculum(curriculum_path)
    
    # Vectoriser et uploader
    vectorizer.vectorize_and_upsert(fiches)
    
    # Test de recherche
    print("\n" + "=" * 60)
    print("🧪 Test de recherche")
    print("=" * 60)
    
    # Test 1: Question maths 6ème
    results = vectorizer.search(
        query="comment additionner des fractions avec des dénominateurs différents",
        niveau="6ème",
        matiere="maths"
    )
    
    # Test 2: Question français CE2
    results = vectorizer.search(
        query="comment conjuguer un verbe au présent",
        niveau="CE2",
        matiere="français"
    )
    
    # Démonstration FoxieRAG
    print("\n" + "=" * 60)
    print("🦊 Démonstration FoxieRAG")
    print("=" * 60)
    
    foxie = FoxieRAG(vectorizer)
    
    # Simuler une question
    context = foxie.get_context_for_question(
        question="3x + 5 = 20, je comprends pas comment trouver x",
        child_level="6ème",
        subject="maths"
    )
    
    print("\n📋 Contexte généré pour Foxie:")
    print(context[:1000] + "..." if len(context) > 1000 else context)
    
    print("\n✅ Vectorisation terminée avec succès!")
    print("🦊 Foxie peut maintenant utiliser le RAG pour aider les enfants!")


def demo_without_api():
    """
    Démonstration sans API (pour tester la structure).
    Génère les textes et metadata sans les uploader.
    """
    print("=" * 60)
    print("🦊 EduFamily - Démonstration (sans API)")
    print("=" * 60)
    
    # Charger le curriculum
    curriculum_path = "edufamily_curriculum.json"
    
    with open(curriculum_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Extraire les fiches
    fiches = []
    curriculum = data.get("curriculum", {})
    
    for niveau, niveau_data in curriculum.items():
        for fiche in niveau_data.get("maths", []):
            fiches.append(fiche)
        for fiche in niveau_data.get("francais", []):
            fiches.append(fiche)
    
    print(f"\n📚 {len(fiches)} fiches chargées")
    
    # Afficher quelques exemples de textes à vectoriser
    print("\n" + "=" * 60)
    print("📝 Exemples de textes à vectoriser:")
    print("=" * 60)
    
    for fiche in fiches[:3]:
        print(f"\n--- {fiche['id']} ---")
        
        # Simuler la conversion en texte
        text_parts = [
            f"Concept: {fiche.get('concept', '')}",
            f"Niveau: {fiche.get('niveau', '')} - Matière: {fiche.get('matiere', '')}",
            f"Définition: {fiche.get('definition', '')[:100]}...",
            f"Mots-clés: {', '.join(fiche.get('mots_cles', []))}"
        ]
        
        print("\n".join(text_parts))
        
        # Metadata
        print(f"\nMetadata pour filtrage:")
        print(f"  niveau: {fiche.get('niveau')}")
        print(f"  matiere: {fiche.get('matiere')}")
        print(f"  chapitre: {fiche.get('chapitre')}")
    
    print("\n✅ Structure validée!")
    print("💡 Pour vectoriser vraiment, configurez les API keys dans .env")


if __name__ == "__main__":
    import sys
    
    if "--demo" in sys.argv:
        demo_without_api()
    else:
        main()
