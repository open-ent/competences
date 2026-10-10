/**
 * Espace des élèves et des parents, porté depuis `eval_parent_mdl.ts` (sync des devoirs),
 * `eval_parent_ctl.ts` (enfant, période courante), `eval_parent_devoirs.ts` (liste, fiche) et le
 * filtre `customSearchFilters`.
 */

import type { CompetenceEvaluation } from './suivi';
import type { PeriodeClasse } from './types';

/** Un enfant suivi : l'élève lui-même, ou chacun des enfants d'un parent (`/competences/enfants`). */
export interface FamilyChild {
  id: string;
  displayName?: string;
  firstName: string;
  lastName: string;
  idClasse: string;
  idStructure: string;
}

/** Un devoir de l'élève (`GET /competences/devoirs?forStudentReleve=true`). */
export interface StudentDevoir {
  id: number;
  name: string;
  libelle?: string | null;
  owner: string;
  teacher?: string;
  date: string;
  id_matiere: string;
  id_sousmatiere?: number | null;
  id_periode: number;
  id_groupe?: string;
  id_type?: number;
  _type_libelle?: string;
  diviseur?: number | string;
  coefficient?: string | number;
  is_evaluated?: boolean;
  ramener_sur?: boolean;
  apprec_visible?: boolean;
  formative?: boolean;
  note?: string;
  sum_notes?: string | null;
  nbr_eleves?: number | null;
}

/** Un niveau de compétence de l'élève (`GET /viescolaire/competences/eleve`). */
export interface StudentCompetence extends Omit<StudentDevoir, 'id' | 'note'> {
  id_devoir: number;
  id_competence: number;
  id_domaine: number;
  id_competences_notes: number;
  evaluation: number;
  owner_name?: string;
}

/** Une annotation de l'élève (`GET /viescolaire/annotations/eleve`), avec son devoir. */
export interface StudentAnnotation extends Omit<StudentDevoir, 'id' | 'note' | 'libelle'> {
  id_devoir: number;
  id: number;
  libelle: string;
  libelle_court: string;
  /** Description du devoir (`libelle` y est pris par l'annotation). */
  lib?: string | null;
}

export interface FamilyDevoir extends StudentDevoir {
  competences: StudentCompetence[];
  annotation?: { id: number; libelle: string; libelle_court: string };
}

const fromRow = (row: StudentCompetence | StudentAnnotation): Omit<FamilyDevoir, 'competences'> => ({
  id: row.id_devoir,
  name: row.name,
  owner: row.owner,
  teacher: 'owner_name' in row ? row.owner_name : undefined,
  date: row.date,
  id_matiere: row.id_matiere,
  id_sousmatiere: row.id_sousmatiere,
  id_groupe: row.id_groupe,
  id_periode: row.id_periode,
  id_type: row.id_type,
  _type_libelle: row._type_libelle,
  diviseur: row.diviseur,
  coefficient: row.coefficient,
  is_evaluated: row.is_evaluated,
  apprec_visible: row.apprec_visible,
  formative: row.formative,
  sum_notes: row.sum_notes,
  nbr_eleves: row.nbr_eleves,
  libelle: 'lib' in row ? row.lib : (row as StudentCompetence).libelle,
});

/**
 * Les devoirs de l'élève tels que l'AngularJS les composait : ceux qui portent une note, complétés
 * des devoirs connus seulement par un niveau de compétence ou par une annotation (absent, dispensé…).
 */
export function mergeDevoirs(devoirs: StudentDevoir[], competences: StudentCompetence[], annotations: StudentAnnotation[]): FamilyDevoir[] {
  const byId = new Map<number, FamilyDevoir>(devoirs.map((d) => [d.id, { ...d, competences: [] }]));
  for (const c of competences) {
    const devoir = byId.get(c.id_devoir) ?? { ...fromRow(c), competences: [] };
    devoir.competences.push(c);
    byId.set(c.id_devoir, devoir);
  }
  for (const a of annotations) {
    const devoir = byId.get(a.id_devoir) ?? { ...fromRow(a), competences: [] };
    devoir.annotation = { id: a.id, libelle: a.libelle, libelle_court: a.libelle_court };
    byId.set(a.id_devoir, devoir);
  }
  return [...byId.values()];
}

/** Ordre de l'AngularJS : le plus récent d'abord. */
export const byDateDesc = (a: FamilyDevoir, b: FamilyDevoir) => b.date.localeCompare(a.date) || b.id - a.id;

export interface FamilySearch {
  /** Type de période ; `null` = l'année entière. */
  periode: number | null;
  matiere: string | null;
  enseignant?: string | null;
  name?: string;
}

/** `customSearchFilters` : période, matière, enseignant et nom (sans casse). */
export function filterDevoirs(devoirs: FamilyDevoir[], s: FamilySearch): FamilyDevoir[] {
  const name = s.name?.trim().toUpperCase();
  return devoirs.filter(
    (d) =>
      (s.periode === null || d.id_periode === s.periode) &&
      (!s.matiere || d.id_matiere === s.matiere) &&
      (!s.enseignant || d.owner === s.enseignant) &&
      (!name || d.name.toUpperCase().includes(name)),
  );
}

/** Résultat affiché : annotation courte, sinon « note / diviseur », sinon rien. */
export function resultOf(d: Pick<FamilyDevoir, 'annotation' | 'note' | 'diviseur'>): string {
  if (d.annotation) return d.annotation.libelle_court;
  if (d.note === undefined || d.note === null || d.note === '') return '';
  return `${formatNumber(d.note)} / ${formatNumber(d.diviseur ?? '')}`;
}

const formatNumber = (v: string | number) => {
  const n = Number(v);
  return Number.isFinite(n) && String(v) !== '' ? String(n).replace('.', ',') : String(v);
};

/** Période en cours (`setCurrentPeriode`), comparée en dates locales ; sinon l'année (`null`). */
export function currentPeriode(periodes: PeriodeClasse[], today: string): number | null {
  const found = periodes.find((p) => p.id !== null && p.timestamp_dt.slice(0, 10) <= today && today <= p.timestamp_fn.slice(0, 10));
  return found ? found.id_type : null;
}

/** Matières des devoirs, sans doublon, dans l'ordre alphabétique. */
export function matieresOf(devoirs: FamilyDevoir[], names: Map<string, string>): Array<{ id: string; name: string }> {
  const ids = [...new Set(devoirs.map((d) => d.id_matiere).filter(Boolean))];
  return ids.map((id) => ({ id, name: names.get(id) ?? id })).sort((a, b) => a.name.localeCompare(b.name));
}

/** L'élève connecté, d'après sa session (`model.me` : première classe, premier établissement). */
export function selfChild(user: {
  userId: string;
  firstName: string;
  lastName: string;
  username?: string;
  classes?: string[];
  structures?: string[];
}): FamilyChild | null {
  if (!user.classes?.[0] || !user.structures?.[0]) return null;
  return {
    id: user.userId,
    displayName: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    idClasse: user.classes[0],
    idStructure: user.structures[0],
  };
}

/**
 * Une évaluation de compétence du devoir, à la forme de celles du suivi : l'arbre des domaines
 * du suivi la sait afficher telle quelle.
 */
export const asSuiviEvaluation = (c: StudentCompetence): CompetenceEvaluation => ({
  id_competence: c.id_competence,
  id_domaine: c.id_domaine,
  id_competences_notes: c.id_competences_notes,
  evaluation: c.evaluation,
  owner: c.owner,
  owner_name: c.owner_name,
  id_matiere: c.id_matiere,
  id_devoir: c.id_devoir,
  evaluation_libelle: c.name,
  evaluation_date: c.date,
  created: c.date,
  formative: !!c.formative,
  niveau_final: null,
  niveau_final_annuel: null,
  eval_lib_historise: false,
});
