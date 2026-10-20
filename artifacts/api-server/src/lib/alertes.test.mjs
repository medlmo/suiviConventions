import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  construireAlerte,
  META_ALERTES,
  NIVEAUX_ALERTE,
  niveauAlerteSql,
  rangUrgenceSql,
} from "./alertes.ts";

const AUJOURDHUI = "2026-10-20";
const cas = [
  { nom: "veille", date: "2026-10-19", frequence: null, niveau: "EN_RETARD", rang: 0 },
  { nom: "jour-même", date: AUJOURDHUI, frequence: null, niveau: "A_DECLENCHER", rang: 1 },
  { nom: "dans-30-jours", date: "2026-11-19", frequence: null, niveau: "A_DECLENCHER", rang: 1 },
  { nom: "dans-31-jours", date: "2026-11-20", frequence: null, niveau: "A_PREPARER", rang: 2 },
  { nom: "dans-60-jours", date: "2026-12-19", frequence: null, niveau: "A_PREPARER", rang: 2 },
  { nom: "dans-61-jours", date: "2026-12-20", frequence: null, niveau: "A_JOUR", rang: 3 },
  { nom: "frequence-conditionnelle-arabe", date: null, frequence: "كلما دعت الضرورة إلى ذلك", niveau: "A_SURVEILLER", rang: 4 },
  { nom: "frequence-conditionnelle-francaise", date: null, frequence: "EN CAS DE BESOIN", niveau: "A_SURVEILLER", rang: 4 },
  { nom: "sans-echeance-ni-clause", date: null, frequence: "Tous les six mois", niveau: "A_QUALIFIER", rang: 5 },
  { nom: "date-prioritaire-sur-clause", date: "2026-12-20", frequence: "si besoin", niveau: "A_JOUR", rang: 3 },
];

let repertoireTemporaire;
let repertoireDonnees;
let repertoireSocket;
let resultats;

function citerTexte(valeur) {
  return valeur === null ? "NULL::text" : `'${valeur.replaceAll("'", "''")}'::text`;
}

function citerDate(valeur) {
  return valeur === null ? "NULL::date" : `'${valeur}'::date`;
}

function lancerPsql(requete) {
  return execFileSync("psql", [
    "-X", "-qAt",
    "-h", repertoireSocket,
    "-U", execFileSync("id", ["-un"], { encoding: "utf8" }).trim(),
    "-d", "postgres",
    "-v", "ON_ERROR_STOP=1",
    "-c", requete,
  ], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
}

before(() => {
  repertoireTemporaire = mkdtempSync(join(tmpdir(), "alertes-conventions-"));
  repertoireDonnees = join(repertoireTemporaire, "data");
  repertoireSocket = join(repertoireTemporaire, "socket");
  mkdirSync(repertoireSocket);

  execFileSync("initdb", [
    "-D", repertoireDonnees,
    "--auth=trust",
    "--no-sync",
  ], { stdio: "ignore" });

  execFileSync("pg_ctl", [
    "-D", repertoireDonnees,
    "-l", join(repertoireTemporaire, "postgres.log"),
    "-o", `-c listen_addresses='' -c unix_socket_directories=${repertoireSocket}`,
    "-w", "start",
  ], { stdio: "ignore" });

  const dialect = new PgDialect();
  const niveauSql = dialect.sqlToQuery(niveauAlerteSql).sql
    .replaceAll("CURRENT_DATE", `DATE '${AUJOURDHUI}'`);
  const rangSql = dialect.sqlToQuery(rangUrgenceSql).sql
    .replaceAll("CURRENT_DATE", `DATE '${AUJOURDHUI}'`);
  const valeurs = cas.map((ligne, index) =>
    `(${citerDate(ligne.date)}, ${citerTexte(ligne.frequence)}, ${citerTexte(ligne.nom)}, ${index})`,
  ).join(",\n");

  resultats = lancerPsql(`
    WITH conventions(prochaine_echeance, frequence_reunions, scenario, ordre) AS (
      VALUES ${valeurs}
    )
    SELECT scenario || '|' || (${niveauSql}) || '|' || (${rangSql})
    FROM conventions
    ORDER BY ordre
  `);
});

after(() => {
  if (repertoireDonnees) {
    try {
      execFileSync("pg_ctl", [
        "-D", repertoireDonnees, "-m", "fast", "-w", "stop",
      ], { stdio: "ignore" });
    } catch {
      // Le répertoire temporaire doit être supprimé même si initdb ou pg_ctl a échoué.
    }
  }
  if (repertoireTemporaire) rmSync(repertoireTemporaire, { recursive: true, force: true });
});

test("les échéances passées, proches et lointaines respectent les seuils d'alerte", () => {
  assert.deepEqual(resultats.slice(0, 6), cas.slice(0, 6).map(
    ligne => `${ligne.nom}|${ligne.niveau}|${ligne.rang}`,
  ));
});

test("sans échéance, les clauses conditionnelles sont surveillées et les autres données qualifiées", () => {
  assert.deepEqual(resultats.slice(6, 9), cas.slice(6, 9).map(
    ligne => `${ligne.nom}|${ligne.niveau}|${ligne.rang}`,
  ));
});

test("une échéance présente détermine le niveau même si la fréquence est conditionnelle", () => {
  assert.equal(resultats[9], "date-prioritaire-sur-clause|A_JOUR|3");
});

test("les libellés, couleurs et jours restants correspondent aux niveaux calculés", () => {
  assert.deepEqual(
    NIVEAUX_ALERTE.map(niveau => construireAlerte(niveau, null)),
    NIVEAUX_ALERTE.map(niveau => ({
      niveau,
      ...META_ALERTES[niveau],
      joursRestants: null,
    })),
  );
  assert.deepEqual(
    construireAlerte("EN_RETARD", -1),
    {
      niveau: "EN_RETARD",
      ...META_ALERTES.EN_RETARD,
      joursRestants: -1,
    },
  );
});
