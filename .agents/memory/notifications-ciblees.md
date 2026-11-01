---
name: Notifications ciblées des conventions
description: Objectif métier du suivi des modifications, avec regroupement et routage hiérarchique.
---

Les notifications doivent avertir le responsable concerné lors d'une création ou d'un changement important, identifier l'auteur, résumer la modification et proposer un lien vers la convention. Les petites corrections doivent être regroupées plutôt que déclencher une notification par champ. Le routage suit l'organigramme, y compris les services directement rattachés à la DGS.

**Why:** L'utilisateur a demandé un suivi ciblé qui informe les responsables sans produire trop d'alertes.

**How to apply:** Résoudre les destinataires avec le référentiel hiérarchique courant, administrable, et non avec l'organigramme historique livré avec l'application. Préserver le regroupement lors des évolutions des formulaires. Ne pas transformer ce suivi en diffusion générale à tous les responsables et ne pas confondre le destinataire d'une notification avec une autorisation supplémentaire sur la convention.

**Why:** Les directions, divisions et services peuvent être renommés ou réaffectés ; un organigramme historique statique enverrait certaines notifications au mauvais responsable.

## Rappels de prochaine échéance

Le chef de service doit recevoir des notifications relatives à la prochaine échéance, deux semaines avant et une semaine avant.

**Why:** L'utilisateur a demandé ces deux délais de rappel pour le chef de service concerné.

**How to apply:** Conserver le ciblage du service, y compris les services directement rattachés à la DGS, et éviter les doublons après lecture. Une ancienne date remplacée ne doit plus être présentée comme un rappel actuel.

Les rappels sont des notifications internes, vérifiées à l'actualisation du flux et à la reconnexion. Une reconnexion tardive rattrape le seuil encore utile, sans cumuler tous les rappels manqués.

**Why:** Le déploiement Autoscale peut dormir ; un minuteur en mémoire ne garantit pas une exécution hors connexion. L'utilisateur n'a pas demandé de canal e-mail ou SMS.

**How to apply:** Ne pas présenter ce fonctionnement comme un envoi externe à heure fixe. Si un futur besoin exige une remise hors connexion à une heure précise, prévoir un ordonnanceur durable et le canal de remise adapté.
