# Rappels des comités par SMTP

## Périmètre

Rappels aux responsables actifs disposant d'une adresse e-mail valide renseignée
par l'administration : chef de service responsable, chef de sa division et directeur
de sa direction. Pour un service rattaché directement à la DGS, le directeur général
des services remplace le chef de division et le directeur de direction. Le routage
utilise le référentiel courant et vérifie à nouveau le rôle et le rattachement avant envoi.
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
jamais le minuteur d'envoi automatiquement, et la commande planifiée n'envoie rien
hors production. Le chiffrement TLS et la validation
du certificat sont obligatoires ; aucun contournement n'est prévu.
IMAP et POP3 ne sont pas utilisés.

Ne pas activer les envois dans un environnement de test utilisant des adresses réelles.
Laisser `MAIL_ENABLED=false` tant que la configuration n'est pas validée.

Un essai temporaire d'envoi automatique en développement exige en plus
`MAIL_DEV_ENABLED=true`, `MAIL_DEV_TEST_RECIPIENT` et
`MAIL_DEV_TEST_CONVENTION_ID`. Il est alors limité à cette seule adresse et cette
seule convention, à un message par vérification. Supprimer ces variables après
l'essai ; ce mode ne modifie pas l'activation de production. La commande
`pnpm --filter @workspace/api-server run mail:dev-test` exécute une seule fois
ce rappel limité pour vérifier le parcours complet.

## Commandes

Après compilation de l'API :

- `pnpm --filter @workspace/api-server run mail:verify` : connexion et authentification
  uniquement, sans envoyer de message.
- `pnpm --filter @workspace/api-server run mail:test -- destinataire@exemple.ma` :
  envoie un seul e-mail de test à l'adresse fournie, sans toucher à la file des rappels.
- `pnpm --filter @workspace/api-server run mail:preview` : comptage en lecture seule
  des couples chef/convention éligibles, sans écriture et sans envoi. Ce comptage
  inclut les rappels éventuellement déjà expédiés : ce n'est pas le nombre d'envois à faire.
- `pnpm --filter @workspace/api-server run mail:reminders` : préparation et traitement
  d'au maximum 100 envois. La commande ne fait rien et réussit si `MAIL_ENABLED`
  n'est pas exactement `true` ou si elle n'est pas exécutée en production. Le code
  de sortie est non nul si le traitement échoue ou si un envoi échoue. Réexécuter
  périodiquement pour les volumes supérieurs.

## Déclenchement et activation

Seulement les rappels de comité à J−30 et J−14 : aucun horaire quotidien,
aucun ordonnanceur externe, aucune route ni aucun secret supplémentaires.
Le site reste en Autoscale.

La consultation du flux de notifications par un utilisateur connecté vérifie
aussi les rappels e-mail pour tous les chefs éligibles, selon leurs propres
périmètres. Le destinataire n'a donc pas besoin d'être connecté lui-même.
La lecture d'une notification interne n'empêche jamais son rappel e-mail.

Pour éviter un traitement complet à chaque actualisation, les vérifications
sont espacées d'au moins 15 minutes par instance active. Ce délai est uniquement
une protection contre les vérifications répétées, pas une planification.
Les traitements simultanés partagent la même promesse et la requête attend la
fin du passage SMTP ; une erreur SMTP ne bloque pas les notifications internes.

Sans utilisation de l'application, aucune vérification n'a lieu. Au prochain
accès, seule la fenêtre encore utile est rattrapée (J−30 à J−15, puis J−14 à J−1),
sans cumuler les deux rappels manqués et sans envoyer après l'échéance.

Conserver `MAIL_ENABLED=false` jusqu'à l'accord explicite d'activation de
l'utilisateur. Aucun envoi n'est effectué en développement, même si cette
variable est vraie. La création de la table en production passe par la
publication normale du projet, pas par du DDL au démarrage.

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
