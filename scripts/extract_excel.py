# -*- coding: utf-8 -*-
"""
Extraction de « BDD comités de suivi » (Région Souss-Massa) -> data/conventions_seed.json

POINT CRITIQUE : la feuille « Suivi simple » contient DEUX blocs avec un
alignement de colonnes DIFFÉRENT. Un import naïf sur les en-têtes de la ligne 4
place des libellés de statut dans des champs DATE.

  Bloc A — lignes 6..112  (107 conventions, suivi historique)
      C = Convention visée | H = Fréquence | N = Dernier comité
      T = Prochaine échéance | U = Statut (figé, NON importé)

  Bloc B — lignes 113..235 (123 conventions, service économique)
      C = Convention visée | H = Fréquence | I = Dernier comité
      L = Prochaine échéance | N = Statut (figé, NON importé) | T = Action (NON importée)

Le statut d'alerte n'est jamais importé : il est recalculé à l'affichage.
"""
import glob
import json
import re
import datetime
import unicodedata

import openpyxl

HEADER_ROW = 4
BLOC_A = range(6, 113)
BLOC_B = range(113, 236)

# Mois en arabe (usage marocain), variantes de graphie incluses.
MOIS_AR = {
    "ينایر": 1, "يناير": 1, "ینایر": 1,
    "فبراير": 2, "فبرایر": 2,
    "مارس": 3,
    "أبريل": 4, "ابريل": 4, "أبریل": 4, "ابریل": 4,
    "ماي": 5, "مايو": 5,
    "يونيو": 6, "یونیو": 6, "يونيه": 6, "یونیه": 6,
    "يوليوز": 7, "یولیوز": 7, "يوليو": 7,
    "غشت": 8, "أغسطس": 8,
    "شتنبر": 9, "سبتمبر": 9,
    "أكتوبر": 10, "اكتوبر": 10,
    "نونبر": 11, "نوفمبر": 11,
    "دجنبر": 12, "ديسمبر": 12,
}

# Textes signalant une absence de date, pas une donnée exploitable.
VIDES = {"-", "--", "/", "n/a", "na", ""}

# Chiffres arabo-indiens -> ASCII
TRANS_CHIFFRES = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")


def normaliser(texte):
    """Nettoie les espaces et normalise l'unicode (le fichier mélange les graphies arabes)."""
    if texte is None:
        return None
    t = unicodedata.normalize("NFKC", str(texte))
    t = t.replace("\u200f", "").replace("\u200e", "")  # marques RTL
    t = re.sub(r"\s+", " ", t).strip()
    return t or None


def parse_date(valeur):
    """Renvoie (date_iso | None, note_texte | None)."""
    if valeur is None:
        return None, None
    if isinstance(valeur, datetime.datetime):
        return valeur.date().isoformat(), None
    if isinstance(valeur, datetime.date):
        return valeur.isoformat(), None

    txt = normaliser(valeur)
    if txt is None or txt.lower() in VIDES:
        return None, None

    brut = txt.translate(TRANS_CHIFFRES)

    # « 09 يوليوز 2025 »
    m = re.match(r"^(\d{1,2})\s+(\S+)\s+(\d{4})$", brut)
    if m and m.group(2) in MOIS_AR:
        try:
            return datetime.date(int(m.group(3)), MOIS_AR[m.group(2)], int(m.group(1))).isoformat(), None
        except ValueError:
            return None, txt

    # « 12/05/2025 » ou « 12-05-2025 »
    m = re.match(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$", brut)
    if m:
        try:
            return datetime.date(int(m.group(3)), int(m.group(2)), int(m.group(1))).isoformat(), None
        except ValueError:
            return None, txt

    # « 2025-05-12 »
    m = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})$", brut)
    if m:
        try:
            return datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3))).isoformat(), None
        except ValueError:
            return None, txt

    # Texte métier à conserver (« غير محدد », « سيتم برمجة الاجتماع... », « 2027 »)
    return None, txt


def cellule(ws, ligne, colonne):
    valeur = ws.cell(ligne, colonne).value
    if valeur is None:
        return None
    if isinstance(valeur, str) and valeur.strip() == "":
        return None
    return valeur


# Les 22 champs du modèle. Les colonnes vides dans l'Excel restent nulles :
# elles existent pour la saisie à venir.
CHAMPS = [
    "nom_convention", "rattachement", "responsable_projet", "session", "date_visa",
    "presidence_comite", "membres_comite", "frequence_reunions", "enveloppe_budgetaire",
    "contribution_region", "maitrise_ouvrage", "maitrise_ouvrage_deleguee",
    "prochain_comite", "dernier_comite", "pv", "decision", "document_convention",
    "fiche_technique", "statut_convention", "prochaine_echeance", "nature_fonds",
]


def extraire():
    chemin = glob.glob("attached_assets/*.xlsx")[0]
    wb = openpyxl.load_workbook(chemin, data_only=True)
    ws = wb["Suivi simple"]

    conventions = []
    for ligne in list(BLOC_A) + list(BLOC_B):
        bloc = "A" if ligne in BLOC_A else "B"
        nom = normaliser(cellule(ws, ligne, 3))
        if not nom:
            continue

        frequence = normaliser(cellule(ws, ligne, 8))
        if bloc == "A":
            brut_dernier = cellule(ws, ligne, 14)   # N
            brut_echeance = cellule(ws, ligne, 20)  # T
        else:
            brut_dernier = cellule(ws, ligne, 9)    # I
            brut_echeance = cellule(ws, ligne, 12)  # L

        dernier, dernier_note = parse_date(brut_dernier)
        echeance, echeance_note = parse_date(brut_echeance)

        enreg = {champ: None for champ in CHAMPS}
        enreg.update({
            "nom_convention": nom,
            "frequence_reunions": frequence,
            "dernier_comite": dernier,
            "prochaine_echeance": echeance,
            "dernier_comite_note": dernier_note,
            "prochaine_echeance_note": echeance_note,
            "source_import": f"Excel bloc {bloc} (ligne {ligne})",
        })
        conventions.append(enreg)

    return conventions


if __name__ == "__main__":
    donnees = extraire()
    with open("data/conventions_seed.json", "w", encoding="utf-8") as fichier:
        json.dump(donnees, fichier, ensure_ascii=False, indent=2)

    dates_dernier = sum(1 for c in donnees if c["dernier_comite"])
    dates_echeance = sum(1 for c in donnees if c["prochaine_echeance"])
    notes = sum(1 for c in donnees if c["dernier_comite_note"] or c["prochaine_echeance_note"])
    print(f"{len(donnees)} conventions extraites")
    print(f"  dernier_comite typé DATE      : {dates_dernier}")
    print(f"  prochaine_echeance typé DATE  : {dates_echeance}")
    print(f"  notes texte conservées        : {notes}")
