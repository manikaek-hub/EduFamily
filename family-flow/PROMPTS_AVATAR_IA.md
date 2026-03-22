# Prompts pour générer les avatars Foxie avec l'IA

## Où générer ?

Choisis l'un de ces outils gratuits :
- **Bing Image Creator** (DALL-E 3) : https://www.bing.com/images/create — gratuit, très bon
- **Leonardo.ai** : https://leonardo.ai — gratuit (150 tokens/jour), excellent pour les personnages
- **Ideogram** : https://ideogram.ai — gratuit, bon rendu texte et portraits
- **Playground AI** : https://playground.com — gratuit, facile d'utilisation

---

## AVATAR 1 — Humanoïde (tutrice réaliste)

### Expression 1 : Souriante (défaut)
```
Portrait of a friendly young woman AI tutor, age 25, warm smile, auburn red hair with soft waves, bright green eyes, light freckles, wearing a sage green top. Soft warm lighting, cream/beige neutral background. Head and shoulders framing, circular crop friendly. Approachable, like a kind older sister helping with homework. Digital art, semi-realistic style, clean lines, warm color palette.
```

### Expression 2 : Réfléchit
```
Portrait of a friendly young woman AI tutor, age 25, thoughtful expression, finger gently touching her chin, looking slightly upward, auburn red hair with soft waves, bright green eyes, light freckles, wearing a sage green top. Soft warm lighting, cream/beige neutral background. Head and shoulders framing. She appears to be thinking about a math problem. Digital art, semi-realistic style, clean lines, warm color palette.
```

### Expression 3 : Encourage
```
Portrait of a friendly young woman AI tutor, age 25, excited and proud expression, big warm smile, eyes sparkling with joy, subtle thumbs up gesture, auburn red hair with soft waves, bright green eyes, light freckles, wearing a sage green top. Soft warm lighting, cream/beige neutral background. Head and shoulders framing. She is celebrating a student's success. Digital art, semi-realistic style, clean lines, warm color palette. Small sparkle/star effects around her.
```

### Expression 4 : Écoute
```
Portrait of a friendly young woman AI tutor, age 25, attentive listening expression, head slightly tilted to the side, gentle empathetic smile, auburn red hair with soft waves, bright green eyes, light freckles, wearing a sage green top. Soft warm lighting, cream/beige neutral background. Head and shoulders framing. She looks genuinely interested in what someone is saying. Digital art, semi-realistic style, clean lines, warm color palette.
```

---

## AVATAR 2 — Mascotte Renard

### Expression 1 : Souriante (défaut)
```
Cute cartoon fox mascot character, friendly smile, big expressive brown eyes, orange fur with white chest patch, wearing a small sage green scarf. Pixar/Disney style, round soft shapes, warm lighting, cream beige background. Portrait framing, circular crop friendly. Adorable and approachable for children. Clean vector-like digital art, no text.
```

### Expression 2 : Réfléchit
```
Cute cartoon fox mascot character, thoughtful expression, one ear tilted, looking upward with curious eyes, small thought bubble with lightbulb above head, orange fur with white chest patch, wearing a small sage green scarf. Pixar/Disney style, round soft shapes, warm lighting, cream beige background. Portrait framing. Clean vector-like digital art, no text.
```

### Expression 3 : Encourage
```
Cute cartoon fox mascot character, very happy and excited expression, eyes closed in joy with big open smile, ears perked up, small stars and sparkles around, orange fur with white chest patch, wearing a small sage green scarf. Pixar/Disney style, round soft shapes, warm lighting, cream beige background. Portrait framing. Celebrating a win. Clean vector-like digital art, no text.
```

### Expression 4 : Écoute
```
Cute cartoon fox mascot character, attentive listening expression, head tilted to the side, one ear forward, gentle caring smile, soft empathetic eyes, orange fur with white chest patch, wearing a small sage green scarf. Pixar/Disney style, round soft shapes, warm lighting, cream beige background. Portrait framing. Clean vector-like digital art, no text.
```

---

## Conseils pour un bon résultat

1. **Cohérence** : Génère les 4 expressions du même style à la suite sur le même outil — le style restera plus cohérent
2. **Format** : Télécharge en PNG, idéalement 512x512 ou plus
3. **Recadrage** : Recadre en carré centré sur le visage si nécessaire
4. **Nommage** : Enregistre les fichiers ainsi :
   - `foxie-human-smile.png`
   - `foxie-human-think.png`
   - `foxie-human-encourage.png`
   - `foxie-human-listen.png`
   - `foxie-fox-smile.png`
   - `foxie-fox-think.png`
   - `foxie-fox-encourage.png`
   - `foxie-fox-listen.png`

5. **Placement** : Mets-les dans `family-flow/frontend/public/assets/avatars/`

6. **Intégration** : Claude Code les intégrera dans l'app via le composant `FoxieAvatar.jsx` (décrit dans SPECS_TECHNIQUES.md, section 7)

## Astuce Leonardo.ai

Si tu utilises Leonardo.ai, choisis le modèle **Leonardo Phoenix** pour l'humanoïde et **Leonardo Anime XL** pour le renard. Active "Alchemy" pour un meilleur rendu.

## Astuce Bing Image Creator

Bing génère 4 images par prompt. Choisis la meilleure de chaque série. Tu peux ajouter "consistent character design" au prompt pour plus de cohérence entre les expressions.
