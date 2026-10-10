/**
 * Règles du formulaire de création et de modification d'une évaluation, portées depuis l'IHM
 * AngularJS (`display_creation_devoir.html`, `createDevoir`, `controleNewDevoirForm`,
 * `controleDate`, `beforSaveDevoir`, `saveNewDevoir`, filtre `getEnseignantClasse`).
 */

import { isSubstitutionActive, Viewer } from './rules';
import type { Classe, Enseignant, Enseignement, PeriodeClasse, TypeDevoir } from './types';

/** Au-delà, l'AngularJS refusait l'enregistrement (`MAX_NBR_COMPETENCE`). */
export const MAX_COMPETENCES = 12;

/** Une compétence retenue pour l'évaluation, dans l'ordre où elle sera présentée. */
export interface ChosenCompetence {
  id: number;
  nom: string;
  code_domaine: string | null;
}

export interface DevoirForm {
  id_groupe: string | null;
  owner: string | null;
  id_matiere: string | null;
  id_sousmatiere: number | null;
  id_type: number | null;
  name: string;
  libelle: string;
  is_evaluated: boolean;
  diviseur: string;
  ramener_sur: boolean;
  coefficient: string;
  /** Identifiant du TYPE de période (`PeriodeClasse.id_type`). */
  id_periode: number | null;
  /** `YYYY-MM-DD`. */
  date: string;
  date_publication: string;
  apprec_visible: boolean;
  competences: ChosenCompetence[];
}

// ── Périodes et dates ────────────────────────────────────────────────────────

const day = (value: string | null | undefined) => (value ?? '').slice(0, 10);

/** Les périodes de la classe, sans l'entrée « Année » (`notYearPeriodes`). */
export function periodesOf(periodes: PeriodeClasse[]): PeriodeClasse[] {
  return periodes.filter((p) => p.id !== null);
}

/** Période en cours (`getCurrentPeriode`) : celle dont les bornes encadrent la date, incluses. */
export function currentPeriode(periodes: PeriodeClasse[], today: string): PeriodeClasse | undefined {
  return periodesOf(periodes).find((p) => day(p.timestamp_dt) <= today && today <= day(p.timestamp_fn));
}

export interface DateCheck {
  /** La date de publication précède celle de l'évaluation. */
  publicationBeforeDate: boolean;
  /** La date de l'évaluation sort de la période choisie. */
  dateOutOfPeriode: boolean;
  /** La saisie de la période est close : l'évaluation ne peut plus y être créée. */
  endSaisie: boolean;
}

/**
 * `controleDate`. ⚠ La fin de saisie est franchie si la date de l'évaluation OU la date du jour la
 * dépasse ; seule la direction passe outre (`isChefEtabOrHeadTeacher()` appelé sans classe).
 * Sans période connue, le formulaire est invalide, comme dans l'AngularJS.
 */
export function checkDates(form: Pick<DevoirForm, 'date' | 'date_publication'>, periode: PeriodeClasse | undefined, today: string, isAdmin: boolean): DateCheck | null {
  if (!periode) return null;
  const finSaisie = day(periode.date_fin_saisie);
  return {
    publicationBeforeDate: form.date_publication < form.date,
    dateOutOfPeriode: !(day(periode.timestamp_dt) <= form.date && form.date <= day(periode.timestamp_fn)),
    endSaisie: !!finSaisie && (form.date > finSaisie || today > finSaisie) && !isAdmin,
  };
}

// ── Enseignant et matières ───────────────────────────────────────────────────

/**
 * Enseignants proposés à la direction pour une classe (`getEnseignantClasse`) : ceux qui y ont un
 * service évaluable, en titulaire, co-enseignant ou remplaçant à date. Si personne ne répond à ce
 * critère, la liste complète est proposée.
 */
export function teachersForClasse(enseignants: Enseignant[], classe: Classe | undefined, today: string): Enseignant[] {
  if (!classe?.services) return enseignants;
  const services = classe.services;
  const teaching = enseignants.filter((e) =>
    services.some(
      (s) =>
        s.evaluable &&
        (s.id_enseignant === e.id ||
          (s.coTeachers ?? []).some((c) => c.second_teacher_id === e.id) ||
          (s.substituteTeachers ?? []).some(
            (r) => r.second_teacher_id === e.id && isSubstitutionActive(r.start_date, r.entered_end_date, today),
          )),
    ),
  );
  return teaching.length > 0 ? teaching : enseignants;
}

/**
 * Les matières se calculent pour le PROPRIÉTAIRE de l'évaluation (`getMatiereClasse` avec
 * `devoir.owner`). La règle « toute matière évaluable » de la direction ne vaut que si elle crée
 * pour elle-même.
 */
export function viewerAsOwner(viewer: Viewer, owner: string | null): Viewer {
  if (!owner || owner === viewer.userId) return viewer;
  return { ...viewer, userId: owner, isAdmin: false, isPersEducNat: false };
}

/** Coefficient par défaut d'un type (`initCoef`) : 0 pour une évaluation formative, 1 sinon. */
export function defaultCoefficient(type: TypeDevoir | undefined): string {
  return type?.formative ? '0' : '1';
}

// ── Compétences ──────────────────────────────────────────────────────────────

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Une branche de l'arbre, prête à afficher : ses feuilles sélectionnables. */
export interface TreeNode {
  id: number;
  nom: string;
  code_domaine: string | null;
  children: TreeNode[];
}

/**
 * L'arbre proposé, après filtre (`setCSkillsList`) :
 *  - une compétence masquée par l'établissement n'est montrée que si l'évaluation l'utilise déjà
 *    (`hideHiddenCompetence`) ; une compétence-mère reste si l'une de ses filles est visible ;
 *  - la recherche porte sur le libellé, sans souci d'accents, et garde la mère d'une fille trouvée ;
 *  - seuls les enseignements cochés sont présentés (tous si aucun ne l'est).
 */
export function filterTree(
  enseignements: Enseignement[],
  keyword: string,
  selectedEnseignements: Set<number>,
  alreadyUsed: Set<number>,
): Array<{ id: number; nom: string; competences: TreeNode[] }> {
  const needle = fold(keyword.trim());
  const matches = (nom: string) => needle === '' || fold(nom).includes(needle);
  const visible = (c: { id: number; masque?: boolean }) => !c.masque || alreadyUsed.has(c.id);

  return enseignements
    .filter((e) => selectedEnseignements.size === 0 || selectedEnseignements.has(e.id))
    .map((e) => ({
      id: e.id,
      nom: e.nom,
      competences: (e.competences_1 ?? [])
        .map((parent): TreeNode | null => {
          const children = (parent.competences_2 ?? []).filter(visible);
          const shownChildren = matches(parent.nom) ? children : children.filter((c) => matches(c.nom));
          const keepParent =
            (parent.competences_2 ?? []).length > 0
              ? shownChildren.length > 0
              : visible(parent) && matches(parent.nom);
          return keepParent
            ? {
                id: parent.id,
                nom: parent.nom,
                code_domaine: parent.code_domaine,
                children: shownChildren.map((c): TreeNode => ({ id: c.id, nom: c.nom, code_domaine: c.code_domaine, children: [] })),
              }
            : null;
        })
        .filter((n): n is TreeNode => n !== null),
    }))
    .filter((e) => e.competences.length > 0);
}

/** Les compétences ÉVALUABLES d'une branche : ses filles, ou elle-même si elle n'en a pas. */
export function leavesOf(node: TreeNode): ChosenCompetence[] {
  const leaves = node.children.length > 0 ? node.children : [node];
  return leaves.map(({ id, nom, code_domaine }) => ({ id, nom, code_domaine }));
}

/** Ajoute ou retire des compétences, sans doublon (une compétence peut figurer sous deux enseignements). */
export function toggleCompetences(chosen: ChosenCompetence[], items: ChosenCompetence[], select: boolean): ChosenCompetence[] {
  if (!select) {
    const ids = new Set(items.map((i) => i.id));
    return chosen.filter((c) => !ids.has(c.id));
  }
  const present = new Set(chosen.map((c) => c.id));
  return [...chosen, ...items.filter((i) => !present.has(i.id))];
}

export function moveCompetence(chosen: ChosenCompetence[], index: number, delta: -1 | 1): ChosenCompetence[] {
  const target = index + delta;
  if (target < 0 || target >= chosen.length) return chosen;
  const next = [...chosen];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * Ce que la modification envoie (`saveNewDevoir`) : compétences ajoutées et réordonnées
 * `{ id: id de compétence, index }`, compétences retirées par leur id. ⚠ Le serveur efface avec
 * elles les niveaux déjà saisis.
 */
export function competencesDiff(initial: number[], chosen: ChosenCompetence[]) {
  const before = new Set(initial);
  const after = new Set(chosen.map((c) => c.id));
  return {
    competencesAdd: chosen.map((c, index) => ({ id: c.id, index })).filter((c) => !before.has(c.id)),
    competencesUpdate: chosen.map((c, index) => ({ id: c.id, index })).filter((c) => before.has(c.id)),
    competencesRem: initial.filter((id) => !after.has(id)),
  };
}

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Champs manquants ou erronés (`controleNewDevoirForm` et la fenêtre « formulaire incomplet ») —
 * des clés i18n de l'AngularJS, dans son ordre.
 */
export function missingFields(form: DevoirForm, dates: DateCheck | null, needsOwner: boolean): string[] {
  const missing: string[] = [];
  if (form.id_type === null) missing.push('choose.evaluation.type');
  if (form.id_groupe === null) missing.push('viescolaire.utils.class.groupe');
  if (needsOwner && !form.owner) missing.push('viescolaire.utils.teacher');
  if (form.id_matiere === null) missing.push('viescolaire.utils.subject');
  if (form.name.trim() === '') missing.push('evaluations.test.title');
  if (form.id_periode === null) missing.push('viescolaire.utils.periode');
  if (form.date === '') missing.push('evaluations.test.date');
  if (form.is_evaluated) {
    const coefficient = Number(form.coefficient.replace(',', '.'));
    const diviseur = Number(form.diviseur.replace(',', '.'));
    if (form.coefficient.trim() === '' || Number.isNaN(coefficient) || coefficient < 0) {
      missing.push('viescolaire.utils.coefficient');
    }
    if (form.diviseur.trim() === '' || Number.isNaN(diviseur) || diviseur <= 0) missing.push('evaluations.test.grade.on');
  }
  if (dates?.dateOutOfPeriode) missing.push('devoir.errDateDevoir');
  if (dates?.publicationBeforeDate) missing.push('devoir.errDatePubli');
  if (dates?.endSaisie) missing.push('end.saisie');
  if (form.competences.length > MAX_COMPETENCES) missing.push('evaluations.max.competences');
  if (!form.is_evaluated && form.competences.length === 0) missing.push('required.fields.double.asterisk');
  return missing;
}

/**
 * Ce qu'une modification va détruire, à confirmer avant d'enregistrer (`beforSaveDevoir`) :
 * les niveaux déjà saisis sur les compétences retirées, les notes si l'évaluation cesse d'être
 * notée, et toute la saisie si elle change de classe.
 */
export function destructiveChanges(
  initial: { id_groupe: string; is_evaluated: boolean; competences: number[] },
  form: DevoirForm,
  evaluated: Array<{ id: string; typeeval: string }>,
): { removedEvaluated: number[]; dropsNotes: boolean; changesClasse: boolean } {
  const kept = new Set(form.competences.map((c) => c.id));
  return {
    removedEvaluated: initial.competences.filter(
      (id) => !kept.has(id) && evaluated.some((e) => e.typeeval === 'TypeEvalSkill' && e.id === String(id)),
    ),
    dropsNotes: initial.is_evaluated && !form.is_evaluated && evaluated.some((e) => e.typeeval === 'TypeEvalNum'),
    changesClasse: initial.id_groupe !== form.id_groupe,
  };
}

/** Corps commun de création et de modification (`Devoir.toJSON`). */
export function devoirPayload(form: DevoirForm, structureId: string, typeGroupe: number) {
  return {
    name: form.name.trim(),
    owner: form.owner,
    libelle: form.libelle,
    id_groupe: form.id_groupe,
    type_groupe: typeGroupe,
    id_sousmatiere: form.id_sousmatiere,
    id_periode: form.id_periode,
    id_type: form.id_type,
    id_matiere: form.id_matiere,
    id_etat: 1,
    date_publication: form.date_publication,
    id_etablissement: structureId,
    diviseur: Number(form.diviseur.replace(',', '.')) || 20,
    coefficient: Number(form.coefficient.replace(',', '.')) || 0,
    date: form.date,
    ramener_sur: form.ramener_sur,
    is_evaluated: form.is_evaluated,
    apprec_visible: form.apprec_visible,
  };
}
