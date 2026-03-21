import sys
import json
import os
from dotenv import load_dotenv
from openai import OpenAI
from pinecone import Pinecone

load_dotenv()

def search(query, niveau, matiere=None):
    # Initialiser les clients
    pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
    index = pc.Index("edufamily-curriculum")
    openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    
    # Générer l'embedding de la question
    response = openai_client.embeddings.create(
        model="text-embedding-3-small",
        input=query
    )
    query_embedding = response.data[0].embedding
    
    # Construire le filtre
    filter_dict = {"niveau": niveau}
    if matiere:
        filter_dict["matiere"] = matiere
    
    # Rechercher dans Pinecone
    results = index.query(
        vector=query_embedding,
        top_k=2,
        include_metadata=True,
        filter=filter_dict
    )
    
    # Extraire les fiches
    fiches = []
    for match in results.matches:
        fiche = json.loads(match.metadata.get("full_content", "{}"))
        fiches.append(fiche)
    
    return fiches

if __name__ == "__main__":
    query = sys.argv[1]
    niveau = sys.argv[2]
    matiere = sys.argv[3] if len(sys.argv) > 3 else None
    
    fiches = search(query, niveau, matiere)
    print(json.dumps(fiches, ensure_ascii=False))
