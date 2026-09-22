---
name: Recherche plein texte sur du contenu arabe (Postgres)
description: Normaliser la colonne et le terme recherché, sinon une recherche correcte rate une grande partie des résultats.
---

Sur des données saisies en arabe par plusieurs personnes, un `LIKE` direct est inutilisable : le même mot s'écrit de plusieurs façons visuellement identiques. La recherche applique `translate(lower(...))` **à la colonne et au terme**, jamais à un seul des deux.

**Why:** observé concrètement sur un import Excel réel — les deux blocs du fichier avaient été saisis avec des claviers différents. Étendre la normalisation au tatweel et aux diacritiques a fait passer une requête courante de 182 à 200 résultats sur 230 lignes ; l'agent aurait conclu à tort que ces dossiers n'existaient pas.

**How to apply:** deux familles de caractères, traitées différemment par `translate()`.
- *À remplacer* (source et cible de même longueur) : yeh farsi ی→ي, keheh ک→ك, alef maksura ى→ي, alefs hamzés أإآٱ→ا, ta marbouta ة→ه, ؤ→و, ئ→ي.
- *À supprimer* (présents dans la source, absents de la cible — `translate()` les retire) : tatweel U+0640 et les diacritiques U+064B–U+0653, U+0654, U+0655, U+0670.

Penser aussi à échapper `%`, `_` et `\` dans le terme saisi : sans cela, taper « % » remonte tout le fichier.
