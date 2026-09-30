---
name: Calcul des échéances des conventions
description: Arbitrage métier entre première échéance, fréquence conditionnelle et dates historiques.
---

Avant le premier comité tenu, la première échéance part de la date de visa selon la nature du projet, même si la fréquence des réunions est déjà inconnue ou conditionnelle. Après le premier comité, une fréquence chiffrée en mois part du dernier comité tenu ; une fréquence non calculable permet une saisie manuelle. Ne pas reporter artificiellement une échéance dépassée vers le futur.

Une échéance historique saisie manuellement et différente du résultat calculé reste intacte lorsqu'on modifie uniquement des informations sans effet sur la date. Un changement de la date de base ou de la fréquence pertinente déclenche le nouveau calcul ; une reprise globale des anciennes données mérite une décision distincte.

**Why:** L'utilisateur a explicitement confirmé le calcul depuis le visa même lorsque la fréquence est inconnue dès la création, puis la saisie manuelle après le premier comité. Une simple correction de commentaire ne vaut pas accord pour écraser une ancienne date manuelle.

**How to apply:** Vérifier la présence du dernier comité avant de choisir la base de calcul. Avant comité, seuls le visa et la nature déterminent la date ; après comité, seuls la date du comité et la fréquence la déterminent. Préserver les dates manuelles divergentes lors d'une modification sans changement de ces données.