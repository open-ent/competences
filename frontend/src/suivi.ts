/**
 * Règles du suivi des compétences d'un élève (`#/competences/eleve`), portées depuis l'IHM
 * AngularJS : `Utils.setMaxOrAverageCompetenceShow`, `getNiveauMaxOfListEval`,
 * `getNiveauMoyOfListEval`, `FilterNotEvaluated`, `getTitulairesForRemplacantsCoEnseignant`,
 * `getMoyenneForBFC` et `switchColorCompetenceNivFinal`.
 *
 * Les niveaux manipulés ici sont les VALEURS ENREGISTRÉES (0 à 3, −1 = non évalué) ; la table de
 * conversion travaille, elle, sur l'ordre des niveaux (1 à 4), d'où les « + 1 » et « − 1 ».
 */

import { isSubstitutionActive } from './rules';
import type { Classe } from './types';

/** Une évaluation de compétence de l'élève (`GET /competences/competence/notes/eleve/:id`). */
export interface CompetenceEvaluation {
  id_competence: number;
  id_domaine: number;
  id_competences_notes: number;
  evaluation: number;
  owner: string;
  owner_name?: string;
  id_matiere: string;
  id_devoir: number;
  evaluation_libelle: string;
  evaluation_date: string;
  created: string;
  formative: boolean;
  niveau_final: number | null;
  niveau_final_annuel: number | null;
  eval_lib_historise: boolean;
}

/** Une ligne de la table de conversion (`GET /competences/competence/notes/bilan/conversion`). */
export interface Conversion {
  valmin: number;
  valmax: number;
  ordre: number;
  libelle: string;
}

/** Un couple enseignant / matière dont l'usager peut revendiquer les évaluations. */
export interface TeacherSubject {
  id_enseignant: string;
  id_matiere: string;
}

/**
 * « Mes évaluations » (`getTitulairesForRemplacantsCoEnseignant`) : pour chaque service de la
 * classe où l'usager enseigne — titulaire, co-enseignant ou remplaçant à date —, le titulaire et
 * TOUS ses co-enseignants et remplaçants comptent comme « moi ». Un remplaçant voit donc les
 * évaluations du titulaire qu'il remplace, et inversement.
 */
export function myTeachers(userId: string, classe: Classe | undefined, today: string): TeacherSubject[] {
  const list: TeacherSubject[] = [];
  for (const service of classe?.services ?? []) {
    const substitute = (service.substituteTeachers ?? []).find((s) => s.second_teacher_id === userId);
    const mine =
      (substitute && isSubstitutionActive(substitute.start_date, substitute.entered_end_date, today)) ||
      (service.coTeachers ?? []).some((c) => c.second_teacher_id === userId) ||
      service.id_enseignant === userId;
    if (!mine) continue;
    list.push({ id_enseignant: service.id_enseignant, id_matiere: service.id_matiere });
    for (const c of service.coTeachers ?? []) list.push({ id_enseignant: c.second_teacher_id, id_matiere: c.subject_id ?? '' });
    for (const s of service.substituteTeachers ?? []) list.push({ id_enseignant: s.second_teacher_id, id_matiere: s.subject_id ?? '' });
  }
  return list;
}

export const isMine = (e: Pick<CompetenceEvaluation, 'owner' | 'id_matiere'>, teachers: TeacherSubject[]) =>
  teachers.some((t) => t.id_enseignant === e.owner && t.id_matiere === e.id_matiere);

/**
 * `getMoyenneForBFC` : l'ordre du niveau dont l'intervalle contient la moyenne (borne haute
 * incluse pour le dernier niveau seulement), −1 si aucun.
 */
export function convert(moyenne: number, table: Conversion[]): number {
  let found: Conversion | undefined;
  for (const c of table) {
    const last = c.ordre === table.length;
    if (c.valmin <= moyenne && (last ? c.valmax >= moyenne : c.valmax > moyenne)) found = c;
  }
  return found ? found.ordre : -1;
}

const average = (values: number[]) => values.reduce((a, b) => a + b, 0) / (values.length === 0 ? 1 : values.length);

/**
 * Niveau d'une liste d'évaluations (`getNiveauMaxOfListEval` / `getNiveauMoyOfListEval`).
 *  - `onlyNote` (niveau ATTEINT) : le meilleur niveau obtenu — ou la moyenne des niveaux si
 *    l'établissement l'a choisi —, sans passer par les niveaux finaux ;
 *  - sinon (niveau FINAL) : par matière, le niveau final posé par l'enseignant s'il existe (le
 *    niveau final ANNUEL sur l'année), sinon le meilleur niveau ou leur moyenne ; puis la moyenne
 *    des matières, convertie par la table.
 * ⚠ En mode « maximum » avec `onlyNote`, la table de conversion n'intervient PAS : c'était le
 * comportement de l'AngularJS.
 */
export function niveauOf(
  evals: CompetenceEvaluation[],
  table: Conversion[],
  options: { average: boolean; onlyNote: boolean; isYear: boolean },
): number {
  const scored = evals.filter((e) => e.evaluation > -1);
  // Sans évaluation notée : « non évalué ». L'AngularJS calculait ici une moyenne de liste vide (0),
  // convertie en « maîtrise insuffisante », qu'il masquait ensuite à l'affichage.
  if (scored.length === 0) return -1;
  if (options.onlyNote) {
    if (!options.average) return Math.max(...scored.map((e) => e.evaluation));
    return convert(average(scored.map((e) => e.evaluation)) + 1, table) - 1;
  }
  const byMatiere = new Map<string, CompetenceEvaluation[]>();
  for (const e of scored) byMatiere.set(e.id_matiere, [...(byMatiere.get(e.id_matiere) ?? []), e]);
  const perMatiere = [...byMatiere.values()].map((list) => {
    const first = list[0];
    if (options.isYear && first.niveau_final_annuel !== null) return first.niveau_final_annuel;
    if (first.niveau_final !== null) return first.niveau_final;
    const values = list.map((e) => e.evaluation);
    return options.average ? average(values) : Math.max(...values);
  });
  return convert(average(perMatiere) + 1, table) - 1;
}

export interface CompetenceLevels {
  /** Toutes les évaluations : le niveau retenu (« Niveau »). */
  all?: number;
  /** Mes évaluations : niveau atteint et niveau final. */
  atteint?: number;
  final?: number;
}

/**
 * `setMaxOrAverageCompetenceShow`. Les évaluations formatives ne comptent jamais. Sur toutes les
 * évaluations, celles de l'année en cours priment ; à défaut (élève redoublant, années
 * historisées), on prend la PLUS RÉCENTE, convertie.
 */
export function competenceLevels(
  evals: CompetenceEvaluation[],
  teachers: TeacherSubject[],
  table: Conversion[],
  options: { average: boolean; isYear: boolean },
): CompetenceLevels {
  const counted = evals.filter((e) => !e.formative);
  const result: CompetenceLevels = {};
  if (counted.length > 0) {
    const current = counted.filter((e) => e.eval_lib_historise === false);
    if (current.length > 0) {
      result.all = niveauOf(current, table, { ...options, onlyNote: false });
    } else {
      const last = counted.reduce((a, b) => (Date.parse(b.created) > Date.parse(a.created) ? b : a));
      result.all = convert(last.evaluation + 1, table) - 1;
    }
  }
  const mine = (counted.filter((e) => e.eval_lib_historise === false).length > 0
    ? counted.filter((e) => e.eval_lib_historise === false)
    : counted
  ).filter((e) => isMine(e, teachers));
  if (mine.length > 0) {
    result.atteint = niveauOf(mine, table, { ...options, onlyNote: true, isYear: false });
    result.final = niveauOf(mine, table, { ...options, onlyNote: false });
  }
  return result;
}

/**
 * `FilterNotEvaluated` : avec « compétences évaluées seulement » (ou pour une compétence
 * masquée), une compétence n'apparaît que si son meilleur niveau — sur MES évaluations si ce
 * filtre est actif — n'est pas « non évalué ».
 */
export function isShown(
  evals: CompetenceEvaluation[],
  masque: boolean,
  onlyEvaluated: boolean,
  onlyMine: boolean,
  teachers: TeacherSubject[],
): boolean {
  if (!onlyEvaluated && !masque) return true;
  const list = onlyMine ? evals.filter((e) => isMine(e, teachers)) : evals;
  if (list.length === 0) return false;
  return Math.max(...list.map((e) => e.evaluation)) !== -1;
}

/**
 * Clic sur le niveau final (`switchColorCompetenceNivFinal`) : niveau suivant, et retour au
 * premier après le dernier — il n'y a pas de « non évalué » dans ce tour.
 */
export function nextFinal(current: number | undefined, nbLevels: number): number {
  if (current === undefined || current < 0 || current >= nbLevels - 1) return 0;
  return current + 1;
}

/** Les matières concernées par un niveau final : celles de mes évaluations non formatives. */
export function finalMatieres(evals: CompetenceEvaluation[], teachers: TeacherSubject[]): string[] {
  return [...new Set(evals.filter((e) => isMine(e, teachers) && !e.formative).map((e) => e.id_matiere))];
}
