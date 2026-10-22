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
  /** 1 = évaluation libre (devoir créé pour un seul élève, supprimable depuis le suivi). */
  id_typeeval?: number;
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

// ── Suivi de classe ──────────────────────────────────────────────────────────

/** Une évaluation de compétence d'un élève de la classe (`GET /competence/notes/classe/:id/:type`). */
export interface ClasseEvaluation {
  id_eleve: string;
  id_competence: number;
  id_domaine: number;
  evaluation: number;
  niveau_final: number | null;
  niveau_final_annuel: number | null;
  id_matiere: string;
  owner: string;
}

/**
 * Niveau de chaque élève sur une compétence (`Utils.setCompetenceEvaluations`) : la même règle
 * que le niveau final du suivi élève, élève par élève — meilleur niveau par matière (ou niveau
 * final posé), moyenne des matières, conversion. « Mes évaluations » restreint aux miennes.
 * Un élève sans évaluation notée vaut « non évalué » (−1).
 */
export function classeLevels(
  evals: ClasseEvaluation[],
  eleveIds: string[],
  teachers: TeacherSubject[],
  table: Conversion[],
  options: { average: boolean; isYear: boolean; onlyMine: boolean },
): Map<string, number> {
  const counted = options.onlyMine ? evals.filter((e) => isMine(e, teachers)) : evals;
  const result = new Map<string, number>();
  for (const id of eleveIds) {
    const own = counted
      .filter((e) => e.id_eleve === id)
      .map((e) => ({ ...e, formative: false, eval_lib_historise: false }) as unknown as CompetenceEvaluation);
    result.set(id, own.length === 0 ? -1 : niveauOf(own, table, { average: options.average, isYear: options.isYear, onlyNote: false }));
  }
  return result;
}

/** Répartition des élèves par niveau, du « non évalué » (−1) au plus haut. */
export function distribution(levels: Map<string, number>, maxValue: number): Array<{ value: number; count: number }> {
  const counts = new Map<number, number>();
  for (const v of levels.values()) counts.set(v, (counts.get(v) ?? 0) + 1);
  return Array.from({ length: maxValue + 2 }, (_, i) => i - 1).map((value) => ({ value, count: counts.get(value) ?? 0 }));
}

/** `ClasseFilterNotEvaluated` : la compétence a-t-elle au moins une évaluation notée (des miennes si filtré) ? */
export function classeShown(evals: ClasseEvaluation[], masque: boolean, onlyEvaluated: boolean, onlyMine: boolean, teachers: TeacherSubject[]): boolean {
  if (!onlyEvaluated && !masque) return true;
  const list = onlyMine ? evals.filter((e) => isMine(e, teachers)) : evals;
  return list.some((e) => e.evaluation !== -1);
}

// ── Vue par enseignement (`DefaultEnseignement.loadCompetences`) ─────────────

/** Enseignement « Langues » : ses compétences se présentent matière par matière. */
export const ENSEIGNEMENT_LANGUES = 6;

interface EnseignementRef {
  id: number;
  nom: string;
  competences_1?: Array<{ id: number; nom: string; masque?: boolean; competences_2?: Array<{ id: number; nom: string; masque?: boolean }> }>;
}

export interface EnseignementBloc {
  key: string;
  /** Nom de l'enseignement, suivi de la matière pour les langues. */
  titre: string;
  competences: Array<{
    id: number;
    nom: string;
    sous: Array<{ competence: { id: number; nom: string; masque: boolean }; evals: CompetenceEvaluation[] }>;
  }>;
}

/**
 * Les enseignements du cycle avec, sous chaque compétence, ses sous-compétences et leurs
 * évaluations (rattachées par compétence, quel que soit le domaine). Pour les langues, un bloc par
 * matière évaluée, limité aux évaluations de cette matière ; sans évaluation, un seul bloc.
 */
export function enseignementBlocs(enseignements: EnseignementRef[], evaluations: CompetenceEvaluation[], matiereNames: Map<string, string>): EnseignementBloc[] {
  const blocs: EnseignementBloc[] = [];
  for (const ens of enseignements) {
    const build = (matiereId?: string): EnseignementBloc['competences'] =>
      (ens.competences_1 ?? []).map((c1) => ({
        id: c1.id,
        nom: c1.nom,
        sous: (c1.competences_2 ?? []).map((c2) => ({
          competence: { id: c2.id, nom: c2.nom, masque: !!c2.masque },
          evals: evaluations.filter((e) => e.id_competence === c2.id && (matiereId === undefined || e.id_matiere === matiereId)),
        })),
      }));
    const ids = new Set((ens.competences_1 ?? []).flatMap((c1) => (c1.competences_2 ?? []).map((c2) => c2.id)));
    const matieres = ens.id === ENSEIGNEMENT_LANGUES ? [...new Set(evaluations.filter((e) => ids.has(e.id_competence)).map((e) => e.id_matiere))] : [];
    if (matieres.length === 0) blocs.push({ key: String(ens.id), titre: ens.nom, competences: build() });
    else
      for (const m of matieres.sort((a, b) => (matiereNames.get(a) ?? a).localeCompare(matiereNames.get(b) ?? b)))
        blocs.push({ key: `${ens.id}-${m}`, titre: `${ens.nom} — ${matiereNames.get(m) ?? m}`, competences: build(m) });
  }
  return blocs;
}

export interface ProportionSlice {
  /** Niveau (-1 = non évalué). */
  value: number;
  /** Nombre d'évaluations distinctes (devoir + compétence) à ce niveau. */
  count: number;
  percent: number;
}

/**
 * `proportion-suivi-competence` (élève) : part de chaque niveau parmi les évaluations d'une compétence. Les doublons
 * (même note rencontrée par deux chemins du suivi) ne comptent qu'une fois. Les parts vides sont omises.
 */
export function proportions(evals: Array<Pick<CompetenceEvaluation, 'evaluation' | 'id_devoir' | 'id_competence' | 'id_competences_notes'>>): ProportionSlice[] {
  const seen = new Set<number>();
  const unique = evals.filter((e) => {
    if (!e.id_competences_notes) return true;
    if (seen.has(e.id_competences_notes)) return false;
    seen.add(e.id_competences_notes);
    return true;
  });
  if (unique.length === 0) return [];
  const values = [...new Set(unique.map((e) => e.evaluation))].sort((a, b) => a - b);
  return values.map((value) => {
    const at = unique.filter((e) => e.evaluation === value);
    return { value, count: new Set(at.map((e) => `${e.id_devoir}:${e.id_competence}`)).size, percent: (at.length / unique.length) * 100 };
  });
}

export interface EvolutionPoint {
  date: string;
  label: string;
  value: number;
  formative: boolean;
}

/** Points du graphique d'évolution d'une compétence : les évaluations notées, de la plus ancienne à la plus récente. */
export function evolutionPoints(evals: Array<Pick<CompetenceEvaluation, 'evaluation' | 'evaluation_date' | 'evaluation_libelle' | 'formative'>>): EvolutionPoint[] {
  return evals
    .filter((e) => e.evaluation > -1)
    .map((e) => ({ date: e.evaluation_date, label: e.evaluation_libelle, value: e.evaluation, formative: !!e.formative }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
