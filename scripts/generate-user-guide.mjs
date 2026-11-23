import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  ImageRun,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "../artifacts/api-server/node_modules/docx/dist/index.mjs";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const outputDir = resolve(scriptDir, "../generated-artifacts");
const docxPath = resolve(outputDir, "guide-utilisateur-suivi-des-conventions.docx");

const navy = "183454";
const blue = "285F8F";
const orange = "C76D22";
const gray = "586574";

const sections = [
  {
    title: "1. Accéder à l’application",
    intro: "L’application est réservée aux comptes créés par l’administrateur. L’adresse d’accès et les identifiants vous sont communiqués par votre organisation.",
    blocks: [
      { type: "steps", items: [
        "Ouvrez l’adresse de l’application dans votre navigateur.",
        "Saisissez votre nom d’utilisateur et votre mot de passe, puis connectez-vous.",
        "Pour quitter votre compte, ouvrez le menu latéral et choisissez « Se déconnecter ».",
      ] },
      { type: "image", file: "ecran-connexion.jpg", width: 540, height: 375, caption: "Écran de connexion — utilisez le compte communiqué par votre administrateur." },
      { type: "callout", title: "Sur téléphone ou tablette", text: "Le bouton de menu ouvre la navigation latérale. La cloche reste dans la barre supérieure. Les mêmes fonctions sont disponibles, avec les filtres et formulaires adaptés à l’écran." },
      { type: "callout", title: "Session expirée", text: "Si l’application demande une nouvelle connexion, reconnectez-vous. En cas de problème persistant, contactez l’administrateur de l’application." },
    ],
  },
  {
    title: "2. Vos droits selon votre fonction",
    intro: "Les conventions visibles et modifiables dépendent du rôle et du rattachement de votre compte. Le périmètre est appliqué par l’application, même si vous ouvrez directement un lien.",
    blocks: [
      { type: "table", headers: ["Profil", "Consultation", "Saisie et modification"], rows: [
        ["Chef de service", "Conventions rattachées à votre service.", "Création et modification dans votre service. Les rappels d’échéance vous concernent."],
        ["Chef de division", "Conventions de votre division et de ses services.", "Création et modification dans votre division. Un filtre permet de choisir un service."],
        ["Directeur", "Consultation et export des conventions.", "Lecture seule : pas de création ni de modification."],
        ["Directeur Général des Services", "Consultation et export des conventions.", "Lecture seule : pas de création ni de modification."],
      ] },
      { type: "paragraph", text: "Si une convention attendue n’apparaît pas, vérifiez d’abord les filtres. Si elle reste absente, demandez à l’administrateur de vérifier le rattachement de votre compte ou de la convention." },
    ],
  },
  {
    title: "3. Se repérer dans l’application",
    intro: "Le menu principal donne accès aux pages utiles au suivi quotidien.",
    blocks: [
      { type: "table", headers: ["Écran", "À quoi il sert"], rows: [
        ["Tableau de bord", "Voir les indicateurs, les échéances prioritaires et l’agenda à venir."],
        ["Toutes les conventions", "Rechercher, filtrer, ouvrir une fiche, télécharger sa fiche technique ou exporter les résultats en Excel."],
        ["Nouvelle convention", "Créer une fiche lorsque votre rôle le permet."],
        ["Cloche Notifications", "Consulter les créations, changements, corrections regroupées et rappels visibles pour votre compte."],
      ] },
    ],
  },
  {
    title: "4. Comprendre le tableau de bord",
    intro: "Les indicateurs s’adaptent au périmètre de votre compte. Les montants sont affichés en MAD et les pourcentages aident à comparer les périodes.",
    blocks: [
      { type: "image", file: "tableau-bord-actuel.jpg", width: 540, height: 375, caption: "Capture de démonstration réalisée avec des données fictives. Le nombre, les montants et les alertes varient selon votre périmètre." },
      { type: "image", file: "tableau-bord-mobile-actuel.jpg", width: 240, height: 520, caption: "Sur téléphone, les cartes s’empilent et restent accessibles en faisant défiler la page." },
      { type: "bullets", items: [
        "Nombre de conventions visées : nombre de fiches du périmètre.",
        "Budget alloué : somme des enveloppes budgétaires renseignées.",
        "Contribution de la Région : somme des contributions de la Région. Le pourcentage principal compare ce montant au budget global.",
        "Avant 2021 et 2021–2026 : répartition calculée selon la date de visa, et non selon la date de session. Les pourcentages des sous-périodes sont rapportés au total de l’indicateur.",
        "Les fiches dont la date de visa n’est pas renseignée ou est après 2026 apparaissent dans une ligne complémentaire lorsqu’il y en a.",
      ] },
      { type: "heading", text: "Niveaux d’alerte des comités de suivi" },
      { type: "table", headers: ["Libellé", "Signification pratique"], rows: [
        ["Hors échéance", "La date de prochaine échéance est passée."],
        ["À tenir entre 0 et 30 jours", "L’échéance arrive dans les 30 prochains jours."],
        ["À tenir entre 31 et 60 jours", "L’échéance arrive dans 31 à 60 jours."],
        ["Tenus", "La preuve disponible confirme que l’échéance précédente a été respectée. Une échéance éloignée ne suffit pas à elle seule."],
        ["Fréquence conditionnelle", "La fréquence est exprimée comme conditionnelle plutôt que par un nombre de mois."],
        ["Échéance non renseignée", "La date ne permet pas de calculer une échéance exploitable."],
      ] },
      { type: "paragraph", text: "Les alertes évoluent avec la date du jour. Cliquez sur une carte d’alerte ou sur une convention des « Priorités d’action » pour ouvrir les fiches concernées. « Save the date » présente les échéances à venir." },
    ],
  },
  {
    title: "5. Rechercher et filtrer les conventions",
    intro: "Ouvrez « Toutes les conventions ». La liste affiche 25 résultats par page et conserve le périmètre autorisé pour votre compte.",
    blocks: [
      { type: "image", file: "liste-conventions-actuelle.jpg", width: 540, height: 375, caption: "Exemple de la liste avec recherche, filtres, export et fiche technique. Les lignes sont fictives; les actions varient selon le rôle." },
      { type: "steps", items: [
        "Saisissez un mot du titre en français ou en arabe, ou un terme lié à la convention.",
        "Affinez avec les filtres disponibles : statut, objet, partenaire et, selon votre rôle, service ou rattachement.",
        "Cliquez sur l’en-tête d’une colonne pour trier; un second clic inverse l’ordre.",
        "Utilisez « Effacer les filtres » pour revenir à la liste non filtrée.",
        "Choisissez « Ouvrir » pour afficher la fiche complète ou « Fiche technique » pour télécharger son document Word.",
      ] },
      { type: "callout", title: "À retenir", text: "Un filtre ne donne pas accès à des conventions hors de votre périmètre. Si aucun résultat ne s’affiche, vérifiez les filtres actifs avant de conclure que la fiche n’existe pas." },
    ],
  },
  {
    title: "6. Créer une convention",
    intro: "La création est disponible pour les chefs de service et les chefs de division. Les directeurs disposent d’un accès en consultation.",
    blocks: [
      { type: "image", file: "formulaire-nouvelle-convention.jpg", width: 540, height: 375, caption: "Exemple du formulaire vierge. Les champs obligatoires sont signalés par un astérisque; le format des dates dépend du navigateur." },
      { type: "steps", items: [
        "Choisissez « Nouvelle convention » dans le menu.",
        "Saisissez l’intitulé en arabe. Vous pouvez ajouter l’intitulé français.",
        "Renseignez les champs obligatoires : rattachement, responsable du projet et date de session. Pour les comptes de service ou de division, certains rattachements sont préremplis et limités à votre périmètre.",
        "Complétez les informations utiles : statut, objet, visa, localisation, budget, contribution, partenaires et maîtrise d’ouvrage.",
        "Dans « Comité & Échéances », indiquez la fréquence, la date du dernier comité et la prochaine échéance. Si les données permettent un calcul, l’application propose la date automatiquement; sinon, saisissez-la manuellement.",
        "Ajoutez si besoin les documents, puis choisissez « Créer la convention ».",
      ] },
      { type: "callout", title: "Avant de créer", text: "Vérifiez le rattachement et le service : ils déterminent le périmètre de suivi et les destinataires des notifications. La contribution de la Région ne peut pas dépasser l’enveloppe budgétaire." },
    ],
  },
  {
    title: "7. Consulter et modifier une fiche",
    intro: "Depuis la liste, ouvrez la convention. Les champs de la fiche sont organisés par thème; une personne en lecture seule ne voit pas les actions d’enregistrement.",
    blocks: [
      { type: "image", file: "fiche-convention-actuelle.jpg", width: 540, height: 375, caption: "Fiche de démonstration montrant les blocs Identification et Comité de Suivi. Les données sont fictives." },
      { type: "table", headers: ["Bloc", "Informations principales"], rows: [
        ["Identification", "Intitulés, statut, rattachement, responsable, session, compétence, objet, visa et territoires."],
        ["Budget & Maîtrise d’Ouvrage", "Enveloppe et contribution en MAD, nature des fonds, partenaires, porteur et maîtrise d’ouvrage."],
        ["Comité de Suivi", "Prochaine échéance, notes, dernier comité, fréquence, décision, présidence et membres."],
        ["Documents & commentaires", "Convention, avenants, procès-verbaux (PV) et commentaires libres."],
        ["Montage financier", "Contribution prévue par partenaire et par année."],
        ["Situation des versements", "Tranches réellement versées par partenaire, avec montant et date facultative."],
        ["Avancement physique", "Historique de constats pour les projets de type Infrastructure ou Prestations."],
      ] },
      { type: "steps", items: [
        "Modifiez les champs concernés; les montants sont regroupés par milliers pour faciliter la lecture.",
        "Relisez les dates et les montants, puis cliquez sur « Enregistrer ».",
        "Attendez le message confirmant l’enregistrement avant de quitter la fiche.",
      ] },
      { type: "callout", title: "Convention historique sans date de session", text: "La date de session est requise à l’enregistrement. Si une ancienne fiche n’en a pas, complétez-la avant de modifier les autres champs." },
      { type: "callout", title: "Conflit de modification", text: "Si une autre personne a modifié la fiche depuis son ouverture, l’application demande de l’actualiser. Rechargez la fiche, vérifiez les données récentes, puis recommencez votre modification." },
    ],
  },
  {
    title: "8. Saisir le montage financier et les versements",
    intro: "Les partenaires doivent d’abord être renseignés dans la fiche pour pouvoir les utiliser dans les tableaux financiers.",
    blocks: [
      { type: "image", file: "montage-financier-actuel.jpg", width: 540, height: 375, caption: "Vue des blocs Montage financier et Situation des versements. Les champs disponibles évoluent avec les partenaires et les années ajoutés." },
      { type: "steps", items: [
        "Dans « Montage financier », ajoutez les années concernées puis saisissez, pour chaque partenaire, sa contribution prévue pour chaque année.",
        "Dans « Situation des versements », sélectionnez le partenaire et l’année, puis ajoutez une ou plusieurs tranches réellement versées.",
        "Saisissez le montant de chaque tranche. La date de versement est facultative et peut être différente de l’année affichée sur la ligne.",
        "Enregistrez la fiche pour conserver les deux tableaux.",
      ] },
      { type: "bullets", items: [
        "Le taux de versement est calculé à partir de la contribution du partenaire concerné, et non d’un total programmé.",
        "Pour la Région, le calcul est rapporté à sa contribution à la convention.",
        "Si le partenaire n’apparaît pas dans le choix, ajoutez-le d’abord dans le champ « Partenaires » puis enregistrez la fiche.",
      ] },
    ],
  },
  {
    title: "9. Gérer les documents",
    intro: "La fiche conserve un historique des documents ajoutés. Les fichiers acceptés sont des PDF ou des documents Word de 10 Mo maximum.",
    blocks: [
      { type: "bullets", items: [
        "Ajoutez une convention ou un avenant dans le bloc de documents correspondant. Le numéro d’avenant est attribué et affiché dans l’application.",
        "Ajoutez les PV dans « PV des comités ». La date du PV est facultative.",
        "Cliquez sur « Enregistrer » après l’ajout pour associer le document à la fiche.",
        "Utilisez le lien « Télécharger » pour récupérer un document déjà enregistré.",
        "« Retirer ce fichier » le détache de la fiche après l’enregistrement; cela ne supprime pas le fichier physique du stockage.",
        "« Fiche technique » télécharge un document Word récapitulatif de la convention.",
      ] },
      { type: "callout", title: "Téléversement", text: "Attendez la fin du téléversement avant d’enregistrer ou de quitter la page. Si le fichier est refusé, vérifiez son format et sa taille." },
    ],
  },
  {
    title: "10. Notifications et rappels",
    intro: "La cloche en haut de l’écran ouvre les notifications associées à votre compte et à votre périmètre.",
    blocks: [
      { type: "bullets", items: [
        "Les notifications peuvent signaler une création, une modification importante, des corrections mineures regroupées ou un rappel d’échéance.",
        "Ouvrez une notification pour accéder à la convention. Vous pouvez marquer une notification comme lue, filtrer les non lues ou tout marquer comme lu.",
        "Les rappels d’échéance concernent les chefs de service : un premier rappel est associé à la fenêtre J−30, puis un autre à J−14. Les rappels obsolètes disparaissent si la date change ou si la convention est clôturée.",
        "Un e-mail de rappel dépend de l’activation du service d’envoi et de la présence d’une adresse valide sur le compte destinataire.",
      ] },
      { type: "callout", title: "À propos du déclenchement des e-mails", text: "Dans le fonctionnement actuel, la vérification des rappels par e-mail est déclenchée par la consultation du flux de notifications. Une personne connectée doit donc ouvrir ou actualiser l’application; le destinataire du rappel n’a pas besoin d’être connecté. L’envoi n’est pas garanti à une heure précise si personne n’utilise l’application." },
    ],
  },
  {
    title: "11. Exporter les conventions",
    intro: "Le bouton « Export Excel (.xlsx) » se trouve au-dessus de la liste.",
    blocks: [
      { type: "steps", items: [
        "Appliquez d’abord les filtres que vous souhaitez retrouver dans le fichier.",
        "Cliquez sur « Export Excel (.xlsx) » et attendez la fin de la génération.",
        "Ouvrez le fichier téléchargé dans Excel ou un tableur compatible.",
      ] },
      { type: "callout", title: "Limites de l’export", text: "L’export porte sur les résultats correspondant aux filtres, pas seulement sur la page affichée. La limite est de 5 000 conventions par export. Si le volume dépasse cette limite, ajoutez des filtres et recommencez." },
    ],
  },
  {
    title: "12. Résoudre les difficultés courantes",
    intro: "Quelques vérifications simples permettent souvent de débloquer la situation.",
    blocks: [
      { type: "table", headers: ["Situation", "Que faire"], rows: [
        ["La convention n’apparaît pas", "Effacez les filtres. Si elle reste absente, demandez à l’administrateur de vérifier les rattachements de votre compte et de la fiche."],
        ["Le bouton Enregistrer est absent", "Votre rôle ou le périmètre de cette fiche est probablement en lecture seule."],
        ["Le formulaire refuse l’enregistrement", "Corrigez les champs signalés, notamment l’intitulé, le rattachement, le responsable et la date de session."],
        ["La fiche a changé depuis son ouverture", "Actualisez la fiche et vérifiez les données avant de ressaisir vos changements."],
        ["L’export échoue", "Réessayez; si le volume est trop important, réduisez-le avec des filtres."],
        ["Un fichier ne s’ajoute pas", "Vérifiez qu’il s’agit d’un PDF ou d’un document Word de 10 Mo maximum, puis attendez la fin du téléversement."],
        ["La connexion ou les données ne chargent pas", "Vérifiez votre connexion, réessayez et reconnectez-vous si votre session a expiré. Si le problème persiste, contactez l’administrateur."],
      ] },
    ],
  },
];

function docParagraph(text, options = {}) {
  return new Paragraph({
    spacing: { after: 120, line: 280 },
    children: [new TextRun({ text, font: "Arial", size: 21, color: "263545", ...options })],
  });
}

function docHeading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: level,
    spacing: { before: level === HeadingLevel.HEADING_1 ? 260 : 180, after: 100 },
    border: level === HeadingLevel.HEADING_1 ? {
      bottom: { color: "D8E2EC", style: BorderStyle.SINGLE, size: 8, space: 5 },
    } : undefined,
    children: [new TextRun({ text, font: "Arial", bold: true, color: level === HeadingLevel.HEADING_1 ? navy : blue })],
  });
}

function docList(items, numbered = false) {
  return items.map((item, index) => new Paragraph({
    indent: { left: 420, hanging: 220 },
    spacing: { after: 80, line: 275 },
    children: [
      new TextRun({ text: numbered ? `${index + 1}. ` : "• ", font: "Arial", bold: true, color: numbered ? orange : blue, size: 21 }),
      new TextRun({ text: item, font: "Arial", size: 21, color: "263545" }),
    ],
  }));
}

function docTable(headers, rows) {
  const cell = (text, header = false, index = 0) => new TableCell({
    width: { size: 100 / headers.length, type: WidthType.PERCENTAGE },
    shading: header
      ? { fill: navy, type: ShadingType.CLEAR }
      : index % 2 ? { fill: "F4F7FA", type: ShadingType.CLEAR } : undefined,
    margins: { top: 90, bottom: 90, left: 100, right: 100 },
    verticalAlign: "top",
    children: [new Paragraph({
      spacing: { after: 0, line: 240 },
      children: [new TextRun({ text, font: "Arial", size: header ? 18 : 17, bold: header, color: header ? "FFFFFF" : "263545" })],
    })],
  });
  const border = { style: BorderStyle.SINGLE, size: 4, color: "D6DEE7" };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: headers.map(() => 9000 / headers.length),
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((header) => cell(header, true)) }),
      ...rows.map((row, rowIndex) => new TableRow({ cantSplit: true, children: row.map((value, column) => cell(value, false, rowIndex + column)) })),
    ],
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
  });
}

async function renderDocBlock(block) {
  if (block.type === "paragraph") return [docParagraph(block.text)];
  if (block.type === "heading") return [docHeading(block.text, HeadingLevel.HEADING_2)];
  if (block.type === "bullets") return docList(block.items);
  if (block.type === "steps") return docList(block.items, true);
  if (block.type === "table") return [docTable(block.headers, block.rows), new Paragraph({ spacing: { after: 80 } })];
  if (block.type === "image") {
    const imagePath = resolve(outputDir, "screenshots", block.file);
    const imageData = await readFile(imagePath);
    return [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 100, after: 50 },
        children: [new ImageRun({
          type: "jpg",
          data: imageData,
          transformation: { width: block.width, height: block.height },
          altText: { name: block.caption, title: block.caption, description: block.caption },
        })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 160, line: 240 },
        children: [new TextRun({ text: block.caption, font: "Arial", size: 16, italics: true, color: gray })],
      }),
    ];
  }
  if (block.type === "callout") return [
    new Paragraph({
      shading: { fill: "F3F7FB", type: ShadingType.CLEAR },
      border: { left: { color: blue, style: BorderStyle.SINGLE, size: 18, space: 8 } },
      indent: { left: 140, right: 100 },
      spacing: { before: 100, after: 140, line: 275 },
      children: [
        new TextRun({ text: `${block.title} — `, font: "Arial", size: 20, bold: true, color: navy }),
        new TextRun({ text: block.text, font: "Arial", size: 20, color: "263545" }),
      ],
    }),
  ];
  return [];
}

async function createDocx() {
  const children = [
    new Paragraph({ spacing: { before: 1500, after: 180 }, children: [new TextRun({ text: "RÉGION SOUSS MASSA", font: "Arial", bold: true, size: 24, color: orange })] }),
    new Paragraph({ spacing: { after: 220 }, children: [new TextRun({ text: "GUIDE UTILISATEUR", font: "Arial", bold: true, size: 44, color: navy })] }),
    new Paragraph({ spacing: { after: 500 }, children: [new TextRun({ text: "Suivi des conventions", font: "Arial", size: 32, color: blue })] }),
    new Paragraph({
      shading: { fill: "F2F6FA", type: ShadingType.CLEAR },
      border: { left: { color: blue, style: BorderStyle.SINGLE, size: 24, space: 10 } },
      indent: { left: 180, right: 120 },
      spacing: { before: 160, after: 500, line: 310 },
      children: [new TextRun({ text: "À destination des chefs de service, chefs de division et directeurs\nRepères pour consulter, créer, modifier et suivre les conventions.", font: "Arial", size: 24, color: navy })],
    }),
    new Paragraph({ spacing: { before: 1200 }, children: [new TextRun({ text: "Version utilisateur · Novembre 2026", font: "Arial", size: 20, color: gray })] }),
    new Paragraph({ children: [new PageBreak()] }),
  ];

  for (const section of sections) {
    children.push(docHeading(section.title));
    children.push(new Paragraph({
      spacing: { after: 150, line: 280 },
      children: [new TextRun({ text: section.intro, font: "Arial", size: 20, color: gray })],
    }));
    for (const block of section.blocks) children.push(...await renderDocBlock(block));
  }

  const footer = new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "Suivi des conventions · Guide utilisateur · ", font: "Arial", size: 16, color: gray }),
        new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: gray }),
      ],
    })],
  });
  const document = new Document({
    creator: "Région Souss Massa",
    title: "Guide utilisateur — Suivi des conventions",
    subject: "Guide destiné aux chefs de service, chefs de division et directeurs",
    description: "Guide pratique d’utilisation de l’application Suivi des conventions.",
    styles: {
      default: { document: { run: { font: "Arial", size: 21, color: "263545" } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Arial", size: 30, bold: true, color: navy }, paragraph: { spacing: { before: 260, after: 100 } } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Arial", size: 24, bold: true, color: blue }, paragraph: { spacing: { before: 180, after: 80 } } },
      ],
    },
    sections: [{
      properties: {
        page: { size: { width: 11906, height: 16838 }, margin: { top: 900, right: 900, bottom: 1000, left: 900 } },
      },
      footers: { default: footer },
      children,
    }],
  });
  await writeFile(docxPath, await Packer.toBuffer(document));
}

await mkdir(outputDir, { recursive: true });
await createDocx();
console.log(`Word: ${docxPath}`);
