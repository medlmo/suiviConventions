---
name: Fiches techniques Word
description: Portée de l'export Word et incompatibilité rencontrée lors de l'intégration du logo au serveur.
---

La fiche technique Word est un export des informations actuellement enregistrées. La télécharger ne doit pas modifier la convention ou ajouter automatiquement un document à son historique.

**Why:** L'utilisateur demande de générer une synthèse depuis les actions de la liste, pas de remplacer une pièce jointe ou d'archiver automatiquement chaque téléchargement. Une génération à la demande évite les fiches périmées.

**How to apply:** Préserver cette séparation entre export et archivage. N'archiver une fiche générée dans les documents que sur demande distincte.

La fiche Word doit inclure le tableau du « Montage financier » enregistré sur la convention, avec les colonnes d'années, les partenaires et les totaux annuels.

**Why:** L'utilisateur a demandé explicitement la présence du montage financier dans la fiche technique Word de chaque convention.

**How to apply:** Lire `suiviFinancier` dans les données de la convention pour produire l'export. Garder les années et montants enregistrés tels quels et inclure une indication explicite si aucun suivi n'existe.

Pour embarquer une image dans le serveur compilé, privilégier le chargement base64 avec décodage par Buffer plutôt que le chargement binaire natif d'esbuild.

**Why:** Le chargement binaire a produit un appel à Uint8Array.fromBase64, absent du runtime Node de ce projet, et a empêché la génération du document malgré un contrôle TypeScript réussi.

**How to apply:** Vérifier une génération réelle après tout changement du chargement des images ; ne pas se fier uniquement à la compilation ou aux types.

Chaque fiche technique générée doit afficher sa date réelle de génération, distincte des dates portées par la convention.

**Why:** L'utilisateur a demandé que la fiche indique la date à laquelle elle a été générée.

**How to apply:** Utiliser la date de génération de la fiche, et non la date de visa ou une autre date métier de la convention.
