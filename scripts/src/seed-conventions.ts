/**
 * Import initial des conventions extraites du fichier Excel.
 *
 * Source : `data/conventions_seed.json`, produit par `scripts/extract_excel.py`.
 * L'extraction est figée dans un JSON versionné plutôt que relue depuis le
 * .xlsx à chaque exécution : le fichier source comporte deux blocs de colonnes
 * décalés et des dates écrites en toutes lettres en arabe, dont l'interprétation
 * a été validée une fois avec la Région. Rejouer l'extraction à l'aveugle
 * risquerait de réintroduire silencieusement un mauvais alignement.
 *
 * Par sécurité le script refuse d'écraser une base déjà remplie ; utiliser
 * `--force` pour repartir de zéro.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { count } from "drizzle-orm";
import { db, conventionsTable, pool } from "@workspace/db";

interface LigneSource {
  nom_convention: string;
  rattachement: string | null;
  responsable_projet: string | null;
  session: string | null;
  date_visa: string | null;
  presidence_comite: string | null;
  membres_comite: string | null;
  frequence_reunions: string | null;
  enveloppe_budgetaire: number | null;
  contribution_region: number | null;
  maitrise_ouvrage: string | null;
  maitrise_ouvrage_deleguee: string | null;
  prochain_comite: string | null;
  dernier_comite: string | null;
  dernier_comite_note: string | null;
  pv: string | null;
  decision: string | null;
  document_convention: string | null;
  fiche_technique: string | null;
  statut_convention: string | null;
  prochaine_echeance: string | null;
  prochaine_echeance_note: string | null;
  nature_fonds: string | null;
  source_import: string | null;
}

const force = process.argv.includes("--force");

async function principal(): Promise<void> {
  const chemin = path.resolve(process.cwd(), "..", "data", "conventions_seed.json");
  const brut = await readFile(chemin, "utf8");
  const lignes = JSON.parse(brut) as LigneSource[];

  const [existant] = await db.select({ valeur: count() }).from(conventionsTable);
  const nombreExistant = existant?.valeur ?? 0;

  if (nombreExistant > 0 && !force) {
    console.log(
      `${nombreExistant} conventions déjà en base — import ignoré. Relancer avec --force pour réimporter.`,
    );
    return;
  }

  if (nombreExistant > 0) {
    await db.delete(conventionsTable);
    console.log(`${nombreExistant} conventions supprimées avant réimport.`);
  }

  const valeurs = lignes.map((ligne) => ({
    nomConvention: ligne.nom_convention,
    rattachement: ligne.rattachement,
    responsableProjet: ligne.responsable_projet,
    session: ligne.session,
    dateVisa: ligne.date_visa,
    presidenceComite: ligne.presidence_comite,
    membresComite: ligne.membres_comite,
    frequenceReunions: ligne.frequence_reunions,
    enveloppeBudgetaire:
      ligne.enveloppe_budgetaire === null ? null : String(ligne.enveloppe_budgetaire),
    contributionRegion:
      ligne.contribution_region === null ? null : String(ligne.contribution_region),
    maitriseOuvrage: ligne.maitrise_ouvrage,
    maitriseOuvrageDeleguee: ligne.maitrise_ouvrage_deleguee,
    prochainComite: ligne.prochain_comite,
    dernierComite: ligne.dernier_comite,
    dernierComiteNote: ligne.dernier_comite_note,
    pv: ligne.pv,
    decision: ligne.decision,
    documentConvention: ligne.document_convention,
    ficheTechnique: ligne.fiche_technique,
    statutConvention: ligne.statut_convention,
    prochaineEcheance: ligne.prochaine_echeance,
    prochaineEcheanceNote: ligne.prochaine_echeance_note,
    natureFonds: ligne.nature_fonds,
    sourceImport: ligne.source_import,
  }));

  for (let debut = 0; debut < valeurs.length; debut += 50) {
    await db.insert(conventionsTable).values(valeurs.slice(debut, debut + 50));
  }

  console.log(`${valeurs.length} conventions importées.`);
}

principal()
  .catch((erreur) => {
    console.error(erreur);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
