/**
 * Règles de la saisie d'une évaluation (`#/devoir/:id`), portées depuis l'IHM AngularJS :
 * `saveNoteDevoirEleve` (eval_teacher_ctl.ts), les directives `cSkillNoteDevoir` et
 * `cSkillsColorPage`, et les modèles `Devoir`, `Evaluation`, `CompetenceNote`.
 */

import type {
  Annotation,
  CompetenceDevoir,
  CompetenceNote,
  EleveDevoir,
  MaitriseLevel,
  NoteDevoir,
  PeriodeClasse,
} from './types';

// ── Annotations ──────────────────────────────────────────────────────────────

/** Libellé court reconnu en dur par le module (`constants/ShortTermAnnotation.ts`). */
export const NN = 'NN';
/** Annotations qui retirent l'élève de l'évaluation par compétences. */
const EXCLUDING = ['ABS', 'DISP', 'NR'];

/** Une note : nombre positif, au plus deux décimales (`/^[0-9]+(\.[0-9]{1,2})?$/`). */
const NOTE = /^[0-9]+(\.[0-9]{1,2})?$/;

export type Saisie =
  | { kind: 'empty' }
  | { kind: 'annotation'; annotation: Annotation }
  | { kind: 'note'; valeur: number }
  | { kind: 'outOfRange' }
  | { kind: 'invalid' };

/**
 * Ce que l'enseignant a tapé dans la case « Note ». Une annotation se tape par son libellé court,
 * sans souci de casse (« abs » vaut ABS) ; la virgule décimale est acceptée. Sur une évaluation
 * SANS note (`is_evaluated` faux), seules les annotations ont un sens.
 */
export function parseSaisie(raw: string, annotations: Annotation[], diviseur: number, isEvaluated: boolean): Saisie {
  const value = raw.trim();
  if (value === '') return { kind: 'empty' };
  const annotation = annotations.find((a) => a.libelle_court.toUpperCase() === value.toUpperCase());
  if (annotation) return { kind: 'annotation', annotation };
  if (!isEvaluated) return { kind: 'invalid' };
  const normalized = value.replace(',', '.');
  if (!NOTE.test(normalized)) return { kind: 'invalid' };
  const valeur = parseFloat(normalized);
  if (valeur < 0 || valeur > diviseur) return { kind: 'outOfRange' };
  return { kind: 'note', valeur };
}

/** Ce que la case « Note » affiche : la note, ou le libellé court de l'annotation posée. */
export function saisieDisplay(note: NoteDevoir | undefined, annotations: Annotation[]): string {
  if (!note) return '';
  if (note.id_annotation != null) {
    return annotations.find((a) => a.id === note.id_annotation)?.libelle_court ?? '';
  }
  return note.valeur == null ? '' : String(note.valeur);
}

/**
 * L'élève est-il évalué sur les compétences (`showCompetences`) ? Une absence, une dispense ou
 * un devoir non rendu l'en retirent ; « non noté » NON — l'élève n'a pas de note mais peut avoir
 * des niveaux.
 */
export function evaluatesCompetences(note: NoteDevoir | undefined, annotations: Annotation[]): boolean {
  if (!note || note.id_annotation == null) return true;
  const court = annotations.find((a) => a.id === note.id_annotation)?.libelle_court;
  return !court || !EXCLUDING.includes(court);
}

/**
 * Le serveur efface les niveaux de compétence de l'élève quand on pose une annotation, sauf
 * « non noté » sur une évaluation notée (`DefaultAnnotationService#createAnnotationDevoir`).
 */
export function annotationClearsCompetences(annotation: Annotation, isEvaluated: boolean): boolean {
  return !(annotation.libelle_court === NN && isEvaluated);
}

// ── Échelle de maîtrise ──────────────────────────────────────────────────────

/** Couleurs nommées de la base (`Defaultcolors` de l'AngularJS). */
const NAMED_COLORS: Record<string, string> = {
  blue: '#97BBCD',
  red: '#e13a3a',
  green: '#46bfaf',
  yellow: '#ecbe30',
  grey: '#5f5f5f',
  orange: '#FF8500',
};
/** Une compétence non évaluée (`Defaultcolors.unevaluated`). */
export const UNEVALUATED_COLOR = '#5f5f5f';

/** Un niveau prêt à afficher : `value` est la valeur ENREGISTRÉE (ordre − 1). */
export interface Level {
  value: number;
  ordre: number;
  libelle: string;
  couleur: string;
  lettre: string;
}

/**
 * L'échelle du cycle de la classe, du niveau le plus haut au plus bas — l'AngularJS la triait
 * ainsi (`niveauCompetencesArray` inversé), et c'est son premier élément qui donne le niveau
 * maximal. La personnalisation de l'établissement (libellé, couleur, lettre) prime sur le défaut ;
 * sans cycle connu, on prend le premier cycle rencontré, comme l'AngularJS.
 */
export function levelsForCycle(levels: MaitriseLevel[], idCycle: number | null | undefined): Level[] {
  const cycles = [...new Set(levels.map((l) => l.id_cycle))];
  const cycle = idCycle != null && cycles.includes(idCycle) ? idCycle : cycles[0];
  return levels
    .filter((l) => l.id_cycle === cycle)
    .map((l) => {
      const raw = l.couleur ?? l.default ?? '';
      return {
        value: l.ordre - 1,
        ordre: l.ordre,
        libelle: l.libelle ?? l.default_lib ?? '',
        couleur: NAMED_COLORS[raw] ?? (raw || UNEVALUATED_COLOR),
        lettre: (l.lettre ?? '').trim(),
      };
    })
    .sort((a, b) => b.ordre - a.ordre);
}

/**
 * Clic sur une pastille (`switchColor`) : non évaluée → niveau le plus haut → … → le plus bas →
 * non évaluée.
 */
export function nextLevel(current: number, maxValue: number): number {
  return current === -1 ? maxValue : current - 1;
}

/** Touches 0 à 4, rangée du haut ou pavé numérique (`keyColor`) : 0 efface, 1 à 4 = niveaux. */
export function levelForKey(key: string): number | null {
  const digit = Number(key);
  if (!/^[0-4]$/.test(key) || Number.isNaN(digit)) return null;
  return digit - 1;
}

// ── Élèves ───────────────────────────────────────────────────────────────────

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Tri par nom puis prénom, sans tenir compte des accents (`sortByLastnameWithAccentIgnored`). */
export function sortEleves<T extends Pick<EleveDevoir, 'lastName' | 'firstName'>>(eleves: T[]): T[] {
  return [...eleves].sort(
    (a, b) =>
      fold(a.lastName ?? '').localeCompare(fold(b.lastName ?? '')) ||
      fold(a.firstName ?? '').localeCompare(fold(b.firstName ?? '')),
  );
}

/**
 * Un élève parti en cours d'année n'est évalué que sur les périodes qu'il a commencées
 * (`Eleve.isEvaluable`) : son départ doit tomber dans la période ou après elle.
 */
export function isEvaluable(eleve: Pick<EleveDevoir, 'deleteDate'>, periode: PeriodeClasse | undefined): boolean {
  if (!eleve.deleteDate || !periode || periode.id == null) return true;
  const left = new Date(eleve.deleteDate).getTime();
  const start = new Date(periode.timestamp_dt).getTime();
  const end = new Date(periode.timestamp_fn).getTime();
  return (left > start && left < end) || left > end;
}

/**
 * La saisie est-elle close (`checkEndSaisieSeul`) ? Le lendemain de la date de fin de saisie de
 * la période, sauf pour le professeur principal de la classe. La direction garde la main
 * ailleurs : c'est `isLocked` qui l'en exempte.
 */
export function isEndSaisie(periode: PeriodeClasse | undefined, today: string, isHeadTeacherOfClasse: boolean): boolean {
  if (!periode?.date_fin_saisie || isHeadTeacherOfClasse) return false;
  return today > periode.date_fin_saisie.slice(0, 10);
}

// ── Compétences ──────────────────────────────────────────────────────────────

/** « D1.4 - Libellé », ou le libellé seul sans domaine (`buildCompetenceNom`). */
export function competenceLabel(c: Pick<CompetenceDevoir, 'code_domaine' | 'nom'>): string {
  return c.code_domaine ? `${c.code_domaine} - ${c.nom.trim()}` : c.nom.trim();
}

/** Grille élève × compétence : le niveau enregistré, ou −1. */
export function levelGrid(notes: CompetenceNote[]): Map<string, CompetenceNote> {
  return new Map(notes.map((n) => [`${n.id_eleve}|${n.id_competence}`, n]));
}

/**
 * Coloriage en masse (`cSkillsColorPage#selectColor`) : les élèves choisis (tous sinon), sur les
 * compétences choisies (toutes sinon), en sautant les élèves retirés par une annotation.
 */
export function bulkTargets(
  eleveIds: string[],
  selectedEleves: string[],
  competenceIds: number[],
  selectedCompetences: number[],
  isExcluded: (eleveId: string) => boolean,
): Array<{ id_eleve: string; id_competence: number }> {
  const eleves = selectedEleves.length > 0 ? selectedEleves : eleveIds;
  const competences = selectedCompetences.length > 0 ? selectedCompetences : competenceIds;
  return eleves
    .filter((e) => !isExcluded(e))
    .flatMap((id_eleve) => competences.map((id_competence) => ({ id_eleve, id_competence })));
}

/**
 * Texte de confirmation du coloriage en masse, selon la sélection. L'AngularJS annonçait « les
 * compétences choisies » quand AUCUNE ne l'était, et laissait le cas inverse sans texte propre :
 * chaque libellé est ici rendu à son cas.
 */
export function bulkMessageKey(nbEleves: number, nbCompetences: number): string {
  if (nbEleves > 0 && nbCompetences > 0) return 'evaluation.action.evaluate.students.for.skills';
  if (nbEleves > 0) return 'evaluation.action.evaluate.students.for.all.skills';
  if (nbCompetences > 0) return 'evaluation.action.evaluate.all.students.for.skills';
  return 'evaluation.action.confirme.initialise.skills';
}
