# Rappels des comités par SMTP

## Périmètre

Rappels aux chefs de service actifs disposant d'une adresse e-mail valide renseignée
par l'administration. Le périmètre utilise les mêmes règles que l'application,
y compris les services directement rattachés à la DGS.
Les créations et modifications ordinaires ne déclenchent pas d'e-mail.

L'échéance est `prochaineEcheance`, calculée ou renseignée dans la convention.
Deux fenêtres sont utilisées : J−30 à J−15 et J−14 à J−1. Un premier passage
tardif ne rattrape que la fenêtre courante, comme les rappels internes.
Les conventions supprimées, arrivées à terme ou résiliées sont exclues.

## Configuration

Variables : `SMTP_HOST`, `SMTP_PORT=465`, `SMTP_USER`, `MAIL_FROM`,
`APP_PUBLIC_URL` (URL HTTPS publiée).
Secret : `SMTP_PASSWORD`.
L'envoi nécessite explicitement `MAIL_ENABLED=true`. Le développement ne lance
jamais le minuteur d'envoi automatiquement. Le chiffrement TLS et la validation
du certificat sont obligatoires ; aucun contournement n'est prévu.
IMAP et POP3 ne sont pas utilisés.

Ne pas activer les envois dans un environnement de test utilisant des adresses réelles.
Laisser `MAIL_ENABLED=false` tant que la configuration n'est pas validée.

## Commandes

Après compilation de l'API :

- `pnpm --filter @workspace/api-server run mail:verify` : connexion et authentification
  uniquement, sans envoyer de message.
- `pnpm --filter @workspace/api-server run mail:preview` : comptage en lecture seule
  des couples chef/convention éligibles, sans écriture et sans envoi. Ce comptage
  inclut les rappels éventuellement déjà expédiés : ce n'est pas le nombre d'envois à faire.
- `pnpm --filter @workspace/api-server run mail:reminders` : préparation et traitement
  d'au maximum 100 envois. Le code de sortie est non nul si le traitement échoue
  ou si un envoi échoue. Réexécuter périodiquement pour les volumes supérieurs.

## Planification et activation

Le serveur de production activé lance un passage au démarrage, puis toutes les
15 minutes **tant qu'il est actif**. Autoscale peut s'arrêter sans trafic :
ce minuteur n'est donc pas une garantie d'envoi à date fixe.
Pour une garantie hors connexion, planifier la commande indépendante sur un
exécuteur disposant du même code, de la base et des variables, ou utiliser
un serveur toujours actif. Le site web doit rester déployé comme site web :
ne pas le convertir en déploiement planifié.

Le choix de la planification reste à finaliser avant de promettre un envoi
quotidien indépendant des connexions. Aucune tâche externe n'est créée par ce code.
La nouvelle table est créée en développement ; sa création en production
passe par la publication normale du projet, pas par du DDL au démarrage.

## Cohérence et reprise

Un registre distinct des notifications internes conserve chaque combinaison
destinataire/convention/date/seuil. Lire une notification interne ne supprime pas
le rappel e-mail. Les jobs sont réservés atomiquement avec `SKIP LOCKED`, un bail
de dix minutes et un jeton de propriété pour les instances concurrentes.
Les échecs sont espacés progressivement (15 minutes à 24 heures).
Le rôle, l'adresse, le périmètre, le statut et l'échéance sont revérifiés avant envoi.

SMTP ne permet pas de garantir exactement un envoi : une panne après acceptation
par le serveur et avant confirmation en base peut causer une réexpédition.
Un `Message-ID` stable est réutilisé, sans supposer que les destinataires le dédupliquent.
L'état « envoyé » signifie accepté par le serveur SMTP, pas livré ni lu.
Les rejets ultérieurs et les rebonds ne sont pas suivis ici.

Les journaux ne contiennent ni mot de passe, ni adresse de destinataire,
ni contenu de convention. Seuls les compteurs et codes d'erreur techniques
sont journalisés.
