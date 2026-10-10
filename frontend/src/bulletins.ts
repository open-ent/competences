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
    images: {},
    nameCE: options.nameCE ?? '',
    imgStructure: ctx.images.imgStructure ?? '',
    hasImgStructure: !!ctx.images.imgStructure,
    imgSignature: ctx.images.imgSignature ?? '',
    hasImgSignature: !!ctx.images.imgSignature,
    useModel: flag('useModel'),
    showBilanPerDomaines: false,
    mentionOpinion: ctx.mentionOpinion,
    orientationOpinion: ctx.orientationOpinion,
    addOtherTeacher: flag('addOtherTeacher'),
    functionOtherTeacher: options.functionOtherTeacher ?? '',
    otherTeacherName: ctx.otherTeacherName ?? '',
  };
  for (const group of Object.values(BULLETIN_OPTIONS)) for (const [k] of group) body[k] = flag(k);
  if (body.useModel) body.idModel = options.idModel;
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
