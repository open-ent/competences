/**
 * Génération des bulletins (`#/bulletin`), portée depuis `print_bulletin.html`,
 * `eval_print_bulletin_ctl.ts` (generateBulletin, sendBulletins, getOptions), `updateFilters` et
 * `ExportBulletins.toJSON`.
 */

import type { PeriodeClasse } from './types';

/** Options cochables, par page du bulletin, dans l'ordre de l'AngularJS. */
export const BULLETIN_OPTIONS = {
  page1: [
    ['getResponsable', 'show.responsables'],
    ['getProgramElements', 'show.programElements'],
    ['coefficient', 'evaluations.test.coefficient'],
    ['moyenneGenerale', 'average.general'],
    ['studentRank', 'display.sudent.rank'],
    ['classAverageMinMax', 'display.classaverage.minmax'],
    ['moyenneAnnuelle', 'average.annual'],
    ['moyenneEleve', 'average.student'],
    ['moyenneEleveSousMat', 'evaluations.moyenne.with.sous.matiere'],
    ['moyenneClasse', 'average.class'],
    ['moyenneClasseSousMat', 'evaluations.moyenne.with.sous.matiere'],
    ['positionnement', 'evaluations.releve.positionnement'],
    ['positionnementSousMat', 'evaluations.positionnement.with.sous.matiere'],
    ['hideHeadTeacher', 'evaluations.export.bulletin.hide.headTeacher'],
    ['showSkillsValidatedPercentage', 'evaluations.export.bulletin.show.skillsValidatedPercentage'],
  ],
  page2: [
    ['showProjects', 'show.projects'],
    ['showFamily', 'show.family'],
  ],
  parametres: [
    ['simple', 'viescolaire.bulletin.lycee'],
    ['agricultureLogo', 'evaluations.bulletin.agricole'],
    ['neutre', 'viescolaire.bulletin.neutre'],
  ],
} as const;

export type PrintOptions = Record<string, unknown> & {
  useModel?: boolean;
  idModel?: number;
  nameCE?: string;
  addOtherTeacher?: boolean;
  functionOtherTeacher?: string;
  otherTeacherId?: string;
};

/** Une période proposée : son type, et les classes choisies qui l'ont (`updateFilters`). */
export interface BulletinPeriode {
  id_type: number;
  type: number;
  ordre: number;
  classes: string[];
}

/** Les périodes des classes choisies, regroupées par type de période. */
export function bulletinPeriodes(periodesByClasse: Map<string, PeriodeClasse[]>): BulletinPeriode[] {
  const byType = new Map<number, BulletinPeriode>();
  for (const [classeId, periodes] of periodesByClasse) {
    for (const p of periodes) {
      if (p.id === null) continue;
      const entry = byType.get(p.id_type) ?? { id_type: p.id_type, type: p.type, ordre: p.ordre, classes: [] };
      entry.classes.push(classeId);
      byType.set(p.id_type, entry);
    }
  }
  return [...byType.values()].sort((a, b) => a.id_type - b.id_type);
}

/**
 * Avis d'orientation par défaut (`resetOpinions`) : celui de fin d'année pour la dernière
 * période — 3e trimestre (type 5) ou 2nd semestre (type 2) —, sinon celui des premières.
 */
export const orientationDefaultKey = (idType: number) =>
  idType === 5 || idType === 2 ? 'orientation.avis.LastTrimester' : 'orientation.avis.FirstSecondTrimester';

/**
 * Corps envoyé pour UNE classe (`ExportBulletins.toJSON`). Les sous-matières ne s'impriment que
 * si au moins une colonne de la matière (moyennes ou positionnement) est demandée.
 */
export function bulletinBody(
  options: PrintOptions,
  ctx: {
    structureId: string;
    classeId: string;
    classeName: string;
    periode: BulletinPeriode;
    studentIds: string[];
    mentionOpinion: string;
    orientationOpinion: string;
    otherTeacherName?: string;
    images: { imgStructure?: string; imgSignature?: string };
    /** Bilan par domaine : l'image déposée pour chaque élève (`graph/img`). */
    graphImages?: Record<string, string>;
  },
): Record<string, unknown> {
  const flag = (k: string) => options[k] === true;
  const body: Record<string, unknown> = {
    idStudents: ctx.studentIds,
    classeName: ctx.classeName,
    idClasse: ctx.classeId,
    idStructure: ctx.structureId,
    idPeriode: ctx.periode.id_type,
    typePeriode: ctx.periode.type,
    images: ctx.graphImages ?? {},
    nameCE: options.nameCE ?? '',
    imgStructure: ctx.images.imgStructure ?? '',
    hasImgStructure: !!ctx.images.imgStructure,
    imgSignature: ctx.images.imgSignature ?? '',
    hasImgSignature: !!ctx.images.imgSignature,
    useModel: flag('useModel'),
    // Le bilan par domaine n'existe pas sur le bulletin de lycée (`simple`).
    showBilanPerDomaines: flag('showBilanPerDomaines') && !flag('simple') && !!ctx.graphImages,
    mentionOpinion: ctx.mentionOpinion,
    orientationOpinion: ctx.orientationOpinion,
    addOtherTeacher: flag('addOtherTeacher'),
    functionOtherTeacher: options.functionOtherTeacher ?? '',
    otherTeacherName: ctx.otherTeacherName ?? '',
  };
  for (const group of Object.values(BULLETIN_OPTIONS)) for (const [k] of group) body[k] = flag(k);
  if (body.useModel) body.idModel = options.idModel;
  if (body.showBilanPerDomaines) body.idImagesFiles = Object.values(ctx.graphImages ?? {});
  const subColumns = flag('moyenneClasseSousMat') || flag('moyenneEleveSousMat') || flag('positionnementSousMat');
  body.printSousMatieres = subColumns && (flag('moyenneClasse') || flag('moyenneEleve') || flag('positionnement'));
  return body;
}

/** « : M. J. Dupont » — nom de l'intervenant ajouté, tel que l'AngularJS le composait. */
export function otherTeacherName(t: { civility?: string; firstName?: string; lastName?: string } | undefined): string {
  if (!t) return '';
  const initial = t.firstName ? ` ${t.firstName[0]}. ` : ' ';
  return ` : ${t.civility ?? ''}${initial}${t.lastName ?? ''}`;
}

// ── Modèles d'options (`ReportModelPrintExport`) ────────────────────────────

/** Options cochables qu'un modèle enregistre (`ReportsModelsPrintExportPreferencesCheckboxConst`). */
export const MODEL_CHECKBOXES = [
  'moyenneClasse', 'moyenneGenerale', 'getProgramElements', 'getResponsable', 'coefficient', 'classAverageMinMax',
  'moyenneEleve', 'showBilanPerDomaines', 'showProjects', 'moyenneClasseSousMat', 'moyenneAnnuelle', 'withLevelsStudent',
  'showFamily', 'withLevelsClass', 'positionnement', 'studentRank', 'useModel', 'agricultureLogo', 'moyenneEleveSousMat',
  'positionnementSousMat', 'addOtherTeacher', 'hideHeadTeacher', 'simple', 'neutre', 'showSkillsValidatedPercentage',
] as const;
/** Textes qu'un modèle enregistre (`ReportsModelsPrintExportPreferencesTextConst`). */
export const MODEL_TEXTS = [
  'mentionOpinion', 'orientationOpinion', 'nameCE', 'imgStructure', 'imgSignature', 'otherTeacherId', 'otherTeacherName',
  'functionOtherTeacher', 'idModel', 'mentionClass',
] as const;

export interface ReportModel {
  _id: string;
  userId: string;
  structureId: string;
  title: string;
  /** Les options cochées, en liste (le serveur ne garde que celles à vrai). */
  preferencesCheckbox: string[];
  preferencesText: Record<string, unknown>;
}

/** Les options d'un modèle appliquées : toute case absente du modèle est décochée. */
export function applyModel(print: PrintOptions, model: ReportModel): PrintOptions {
  const checks = Object.fromEntries(MODEL_CHECKBOXES.map((k) => [k, model.preferencesCheckbox.includes(k)]));
  const texts = Object.fromEntries(Object.entries(model.preferencesText ?? {}).filter(([, v]) => v !== undefined && v !== null));
  return { ...print, ...checks, ...texts };
}

/** Le corps envoyé pour enregistrer les options courantes dans un modèle (`setPreferences…WithClean`). */
export function modelPreferences(print: PrintOptions, texts: { mentionClass: string; orientationOpinion: string }) {
  return {
    preferencesCheckbox: Object.fromEntries(MODEL_CHECKBOXES.map((k) => [k, print[k] === true])),
    preferencesText: Object.fromEntries(MODEL_TEXTS.map((k) => [k, k === 'mentionClass' ? texts.mentionClass : k === 'orientationOpinion' ? texts.orientationOpinion : print[k]])),
  };
}

/** Élève tel que le serveur le renvoie dans la réponse 400 d'un conflit de coefficients. */
interface ConflictStudentRaw {
  idEleve?: string;
  lastName?: string;
  firstName?: string;
  name?: string;
  classeOf?: string;
  classeNameToShow?: string;
  has_conflict_coefficient?: boolean;
  conflict_coefficient?: Array<{ libelleMatiere?: string; coefficient?: number | string; teachers?: Array<{ firstName?: string; name?: string }> }>;
}

export interface BulletinConflictLike {
  idEleve: string;
  nom: string;
  classe: string;
  subjects: Array<{ libelle: string; coefficient: string; teachers: string[] }>;
}

/**
 * Élèves en conflit de coefficients, dédoublonnés par identifiant (le serveur renvoie un élève par matière en conflit),
 * avec les matières, coefficients et enseignants à signaler à l'administrateur. Un élève sans conflit est ignoré.
 */
export function bulletinConflicts(eleves: ConflictStudentRaw[]): BulletinConflictLike[] {
  const seen = new Map<string, BulletinConflictLike>();
  for (const e of eleves) {
    if (!e.has_conflict_coefficient) continue;
    const id = e.idEleve ?? `${e.lastName ?? e.name ?? ''}-${e.firstName ?? ''}`;
    if (seen.has(id)) continue;
    seen.set(id, {
      idEleve: id,
      nom: `${e.lastName ?? e.name ?? ''} ${e.firstName ?? ''}`.trim(),
      classe: `${e.classeOf ?? ''} ${e.classeNameToShow ?? ''}`.trim(),
      subjects: (e.conflict_coefficient ?? []).map((s) => ({
        libelle: s.libelleMatiere ?? '',
        coefficient: String(s.coefficient ?? ''),
        teachers: (s.teachers ?? []).map((t) => `${(t.firstName ?? '').charAt(0)}${t.firstName ? '.' : ''}${t.name ?? ''}`),
      })),
    });
  }
  return [...seen.values()];
}

/** Un autre modèle porte-t-il déjà ce titre (sans tenir compte de la casse ni des espaces de bord) ? `exceptId` : le modèle renommé. */
export function reportModelTitleTaken(models: Array<{ _id: string; title: string }>, title: string, exceptId?: string): boolean {
  const wanted = title.trim().toLowerCase();
  return models.some((m) => m._id !== exceptId && m.title.trim().toLowerCase() === wanted);
}

/**
 * Corps du renommage d'un modèle : le nouveau titre avec ses options actuelles (le serveur remplace les préférences
 * reçues, un corps réduit au titre les effacerait). Les cases sont reconstruites depuis la liste des options cochées.
 */
export function renamedModelBody(model: ReportModel, title: string) {
  return {
    title: title.trim(),
    preferencesCheckbox: Object.fromEntries(MODEL_CHECKBOXES.map((k) => [k, model.preferencesCheckbox.includes(k)])),
    preferencesText: model.preferencesText,
  };
}
