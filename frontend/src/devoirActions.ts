import { isHeadTeacher } from './rules';
import type { Viewer } from './rules';
import { isEndSaisie } from './saisie';
import type { Classe, Devoir, PeriodeClasse } from './types';

/** Seuil au-delà duquel le récapitulatif de suppression ne liste plus les devoirs un par un (`conditionAffichageText`). */
export const RECAP_LIST_LIMIT = 16;

/** Informations d'évaluation d'un devoir (`GET /competences/devoirs/evaluations/informations`). */
export interface EvaluatedInfo {
  id: number;
  nbevalskill: number | null;
  nbevalnum: number | null;
}

export type PeriodesByClasse = Record<string, PeriodeClasse[] | undefined>;

/** La saisie de la période du devoir est-elle close pour cet usager (`checkEndSaisieSeul`) ? */
export function isDevoirSaisieClosed(devoir: Pick<Devoir, 'id_groupe' | 'id_periode'>, periodes: PeriodesByClasse, classes: Classe[], viewer: Viewer): boolean {
  const classe = classes.find((c) => c.id === devoir.id_groupe);
  const periode = periodes[devoir.id_groupe]?.find((p) => p.id_type === devoir.id_periode);
  return isEndSaisie(periode, viewer.today, !!classe && isHeadTeacher(classe, viewer));
}

/**
 * « Modifier l'évaluation » : un seul devoir sélectionné, et soit la direction, soit une saisie encore ouverte
 * (`isChefEtabOrHeadTeacher() || !checkEndSaisie`). Sans date de fin de saisie, la saisie est ouverte.
 */
export function canEditSelection(selected: Devoir[], periodes: PeriodesByClasse, classes: Classe[], viewer: Viewer): boolean {
  if (selected.length !== 1) return false;
  return viewer.isAdmin || !isDevoirSaisieClosed(selected[0], periodes, classes, viewer);
}

/**
 * Sépare les devoirs à supprimer de ceux qui ne le sont plus : hors direction, une évaluation dont la saisie est
 * close ne se supprime pas, sauf pour le professeur principal de la classe (qui n'est jamais « clos »).
 */
export function splitDeletable<T extends Devoir>(selected: T[], periodes: PeriodesByClasse, classes: Classe[], viewer: Viewer): { deletable: T[]; uncancelable: T[] } {
  if (viewer.isAdmin) return { deletable: selected, uncancelable: [] };
  const deletable: T[] = [];
  const uncancelable: T[] = [];
  for (const d of selected) (isDevoirSaisieClosed(d, periodes, classes, viewer) ? uncancelable : deletable).push(d);
  return { deletable, uncancelable };
}

export interface EvaluatedSplit {
  skills: Devoir[];
  marks: Devoir[];
}

/** Devoirs portant des compétences évaluées et/ou des notes, parmi ceux qu'on s'apprête à supprimer. */
export function evaluatedSplit(infos: EvaluatedInfo[], devoirs: Devoir[]): EvaluatedSplit {
  const byId = new Map(devoirs.map((d) => [d.id, d]));
  const pick = (count: (i: EvaluatedInfo) => number | null) =>
    infos.filter((i) => (count(i) ?? 0) > 0).map((i) => byId.get(i.id)).filter((d): d is Devoir => !!d);
  return { skills: pick((i) => i.nbevalskill), marks: pick((i) => i.nbevalnum) };
}

/**
 * Message de la seconde confirmation. Peu de devoirs : le message liste leurs noms (`listed`) ; beaucoup : un message
 * générique (au-delà de 16, comme l'AngularJS — dont le cas « exactement 16 » ne montrait rien).
 */
export function evaluatedMessage(split: EvaluatedSplit): { key: string; listed: boolean } | null {
  const s = split.skills.length;
  const m = split.marks.length;
  if (s === 0 && m === 0) return null;
  const listed = s + m < RECAP_LIST_LIMIT;
  if (s > 0 && m > 0) return { key: listed ? 'evaluations.devoir.recaputilatif.suppression.text6' : 'evaluations.devoir.recaputilatif.suppression.text1', listed };
  if (m > 0) return { key: listed ? 'evaluations.devoir.recaputilatif.suppression.text5' : 'evaluations.devoir.recaputilatif.suppression.text2', listed };
  return { key: listed ? 'evaluations.devoir.recaputilatif.suppression.text4' : 'evaluations.devoir.recaputilatif.suppression.text3', listed };
}

/** Classes proposées à la duplication, filtrées par la recherche (nom, sans accent ni casse). */
export function duplicationTargets(classes: Classe[], search: string, viewerValid: (c: Classe) => boolean): { classes: Classe[]; groupes: Classe[] } {
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const needle = fold(search.trim());
  const ok = classes.filter((c) => viewerValid(c) && fold(c.name).includes(needle)).sort((a, b) => a.name.localeCompare(b.name));
  return { classes: ok.filter((c) => c.type_groupe === 0), groupes: ok.filter((c) => c.type_groupe !== 0) };
}
