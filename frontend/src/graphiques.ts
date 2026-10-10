/**
 * Conseil de classe, onglet « Graphiques » (`display_graphiques.html`), porté depuis
 * `models/common/Graph.ts` (`configCharts`, `moyenneNiveau`) : par matière ou par domaine, le
 * niveau moyen de l'élève et de la classe, la répartition des niveaux de l'élève, et pour les
 * matières, les moyennes de l'élève et de la classe avec le minimum et le maximum.
 */

/** Une évaluation de compétence telle que la renvoient les routes `datas/graph`. */
export interface GraphCompetence {
  evaluation: number;
  niveau_final: number | null;
  /** Niveau retenu pour la répartition (0 à 3). */
  evaluationGraph?: number;
}

/** Une matière (`GET …/datas/graph`) ou un domaine (`GET …/datas/graph/domaine`). */
export interface GraphEntry {
  id?: string | number;
  name?: string;
  codification?: string;
  competencesNotes?: GraphCompetence[] | null;
  competencesNotesEleve?: GraphCompetence[] | null;
  studentAverage?: number | string | null;
  classAverage?: number | string | null;
  classMin?: number | null;
  classMax?: number | null;
}

export interface GraphRow {
  label: string;
  /** Niveau moyen sur 4 (1 = maîtrise insuffisante … 4 = très bonne maîtrise), 0 sans évaluation. */
  niveauEleve: number;
  niveauClasse: number;
  /** Part des évaluations de l'élève à chaque niveau (0 à 3), en pourcentage. */
  repartition: number[];
  moyenneEleve: number | null;
  moyenneClasse: number | null;
  min: number | null;
  max: number | null;
}

const tenth = (n: number) => Math.round(n * 10) / 10;

/** `moyenneNiveau` : moyenne des niveaux (finaux s'ils existent) ramenés de 0-3 à 1-4. */
export function moyenneNiveau(notes: GraphCompetence[] | null | undefined): number {
  const list = notes ?? [];
  if (list.length === 0) return 0;
  return tenth(list.reduce((sum, c) => sum + ((c.niveau_final ?? c.evaluation) + 1), 0) / list.length);
}

/**
 * Répartition des niveaux de l'élève. ⚠ L'AngularJS voulait écarter les compétences non évaluées
 * du dénominateur mais son test était inversé (`(!liste) ? liste.length : 0`) : il les comptait.
 * Elles sont écartées ici, comme il en avait l'intention.
 */
export function repartition(notes: GraphCompetence[] | null | undefined): number[] {
  const evaluated = (notes ?? []).filter((c) => c.evaluation > -1);
  if (evaluated.length === 0) return [0, 0, 0, 0];
  return [0, 1, 2, 3].map((level) => tenth((evaluated.filter((c) => c.evaluationGraph === level).length * 100) / evaluated.length));
}

const num = (v: number | string | null | undefined) => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

/** Les lignes des graphiques, dans l'ordre du serveur ; les entrées sans identifiant sont écartées. */
export function graphRows(entries: GraphEntry[]): GraphRow[] {
  return entries
    .filter((e) => e.id !== undefined && e.id !== null)
    .map((e) => ({
      label: e.name ?? e.codification ?? '',
      niveauEleve: moyenneNiveau(e.competencesNotesEleve),
      niveauClasse: moyenneNiveau(e.competencesNotes),
      repartition: repartition(e.competencesNotesEleve),
      moyenneEleve: num(e.studentAverage),
      moyenneClasse: num(e.classAverage),
      min: num(e.classMin),
      max: num(e.classMax),
    }));
}
