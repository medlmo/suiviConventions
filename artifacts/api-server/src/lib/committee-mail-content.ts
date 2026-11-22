const echapperHtml = (value: string) => value.replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

export function buildCommitteeReminderContent(
  titre: string,
  echeance: string,
  seuil: number,
  joursRestants: number,
  lien: string,
) {
  const [annee, mois, jour] = echeance.split("-");
  const date = `${jour}/${mois}/${annee}`;
  const subject = `Rappel J−${seuil} — Comité de suivi du ${date}`;
  const introduction = `La prochaine échéance du comité de suivi est fixée au ${date} (dans ${joursRestants} jour${joursRestants > 1 ? "s" : ""}).`;
  const avertissement = "Ce message est un rappel automatique fondé sur la prochaine échéance renseignée dans l’application.";
  return {
    subject,
    text: `Bonjour,\n\n${introduction}\n\nConvention : ${titre}\n\nConsulter la convention : ${lien}\n\n${avertissement}\n\nSuivi des conventions — Région Souss Massa`,
    html: `<div lang="fr" style="font-family:Arial,sans-serif;line-height:1.6;color:#122b49;max-width:640px;margin:auto"><h2>Rappel de comité de suivi</h2><p>Bonjour,</p><p>${echapperHtml(introduction)}</p><p dir="auto"><strong>Convention :</strong> ${echapperHtml(titre)}</p><p><a href="${echapperHtml(lien)}">Consulter la convention</a></p><p style="color:#64748b;font-size:13px">${avertissement}</p><p>Suivi des conventions — Région Souss Massa</p></div>`,
  };
}
