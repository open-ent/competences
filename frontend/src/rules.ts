/**
 * Règles de visibilité et de filtrage de l'espace enseignant, portées À LA LETTRE depuis l'IHM
 * AngularJS (`utils/filters/isValidDevoir.ts`, `utils/functions/isValidClasse.ts`,
 * `models/teacher/Utils.ts`, `filters/customClassPeriodeFilter.ts`, `filters/customSearch.ts`,
 * `utils/filters/getMatiereClasse.ts`). Elles décident de ce qu'un enseignant voit et peut
 * ouvrir : les différences entre elles sont voulues, même quand elles surprennent.
 */

import type { Classe, Devoir, Matiere, Service, TypePeriode, UserDetails } from './types';

/** Qui regarde, et avec quels pouvoirs. */
export interface Viewer {
  userId: string;
  /** Droit `viescolaire.adminChefEtab` : personnel de direction. */
  isAdmin: boolean;
  /** Type ENT `PERSEDUCNAT` (personnel d'éducation : CPE…). */
  isPersEducNat: boolean;
  /** Classes dont il est professeur principal (identifiants externes). */
  details: UserDetails;
  /** Aujourd'hui, au format `YYYY-MM-DD` (injecté pour les tests). */
  today: string;
}

// ── Profils ──────────────────────────────────────────────────────────────────

export function isHeadTeacher(classe: Pick<Classe, 'externalId'>, viewer: Viewer): boolean {
  if (!classe.externalId) return false;
  const head = [...(viewer.details.headTeacher ?? []), ...(viewer.details.headTeacherManual ?? [])];
  return head.includes(classe.externalId);
}

/** Sans classe : seul le droit d'administration compte (`Utils.isChefEtabOrHeadTeacher`). */
export function isChefEtabOrHeadTeacher(viewer: Viewer, classe?: Classe | null): boolean {
  if (!classe) return viewer.isAdmin;
  return viewer.isAdmin || isHeadTeacher(classe, viewer);
}

// ── Services ─────────────────────────────────────────────────────────────────

/** Bornes INCLUSES, à la journée — `moment().isBetween(start, end, 'days', '[]')`. */
export function isSubstitutionActive(start: string | undefined, end: string | undefined, today: string): boolean {
  if (!start || !end) return false;
  return start.slice(0, 10) <= today && today <= end.slice(0, 10);
}

/**
 * L'usager intervient-il dans ce service, en titulaire, co-enseignant ou remplaçant à date ?
 * Avec une matière, chacun des trois doit porter sur elle.
 */
function teachesIn(service: Service, viewer: Viewer, idMatiere?: string): boolean {
  const me = viewer.userId;
  const substitute = (service.substituteTeachers ?? []).find((s) => s.second_teacher_id === me);
  let substituting = !!substitute && isSubstitutionActive(substitute.start_date, substitute.entered_end_date, viewer.today);
  let coTeaching = (service.coTeachers ?? []).some((c) => c.second_teacher_id === me);
  let main = service.id_enseignant === me;
  if (idMatiere) {
    substituting = substituting && substitute!.subject_id === idMatiere;
    coTeaching = (service.coTeachers ?? []).some((c) => c.second_teacher_id === me && c.subject_id === idMatiere);
    main = main && service.id_matiere === idMatiere;
  }
  return coTeaching || substituting || main;
}

/** `Utils.userHasService` : comme {@link teachesIn}, mais sur un service ÉVALUABLE. */
export function userHasService(classe: Classe | undefined, viewer: Viewer, idMatiere?: string): boolean {
  return (classe?.services ?? []).some((s) => s.evaluable && teachesIn(s, viewer, idMatiere));
}

/**
 * `isValidClasse` : la classe fait-elle partie de celles où l'usager évalue ?
 * Direction, professeur principal et personnel d'éducation : dès qu'un service y est évaluable.
 */
export function isValidClasse(idClasse: string, idMatiere: string | undefined, classes: Classe[], viewer: Viewer): boolean {
  const classe = classes.find((c) => c.id === idClasse);
  if (!classe?.services) return false;
  if (isChefEtabOrHeadTeacher(viewer, classe) || viewer.isPersEducNat) {
    return classe.services.some((s) => s.evaluable);
  }
  return userHasService(classe, viewer, idMatiere);
}

/**
 * `isValidDevoir` : l'évaluation est-elle à montrer ? ⚠ Contrairement à {@link isValidClasse},
 * le service n'a PAS à être évaluable, et le personnel d'éducation n'a pas de passe-droit :
 * c'est l'écart de l'AngularJS, repris tel quel.
 */
export function isValidDevoir(devoir: Pick<Devoir, 'id_groupe' | 'id_matiere'>, classes: Classe[], viewer: Viewer): boolean {
  const classe = classes.find((c) => c.id === devoir.id_groupe);
  if (!classe?.services) return false;
  if (isChefEtabOrHeadTeacher(viewer, classe)) return true;
  return classe.services.some((s) => teachesIn(s, viewer, devoir.id_matiere || undefined));
}

/** Rattache à chaque classe les services qui la concernent (`Structure.classes.sync`). */
export function attachServices(classes: Omit<Classe, 'services'>[], services: Service[]): Classe[] {
  return classes.map((classe) => {
    const own = services.filter((s) => (s.id_groups ? s.id_groups.includes(classe.id) : s.id_groupe === classe.id));
    return { ...classe, services: own.length > 0 ? own : null };
  });
}

// ── Matières d'une classe (`getMatiereClasse`) ───────────────────────────────

function evaluablesFor(classe: Classe, matiere: Matiere, viewer: Viewer): Service[] {
  if (isChefEtabOrHeadTeacher(viewer)) {
    return (classe.services ?? []).filter((s) => s.id_matiere === matiere.id && s.evaluable);
  }
  const me = viewer.userId;
  return (classe.services ?? []).filter((service) => {
    const substitute = (service.substituteTeachers ?? []).find(
      (s) => s.second_teacher_id === me && s.subject_id === matiere.id,
    );
    const substituting = !!substitute && isSubstitutionActive(substitute.start_date, substitute.entered_end_date, viewer.today);
    const coTeaching = (service.coTeachers ?? []).some((c) => c.second_teacher_id === me && c.subject_id === matiere.id);
    let main = service.id_enseignant === me && service.id_matiere === matiere.id;
    if (matiere.libelleClasses && matiere.libelleClasses.length > 0 && classe.externalId) {
      main = main && matiere.libelleClasses.includes(classe.externalId);
    }
    return service.evaluable && (coTeaching || substituting || main);
  });
}

/**
 * Matières que l'usager évalue dans une classe ; sans classe, dans l'une quelconque de ses classes.
 * Une matière sans nom ou sans identifiant externe n'est jamais proposée.
 */
export function matieresForClasse(matieres: Matiere[], idClasse: string | null, classes: Classe[], viewer: Viewer): Matiere[] {
  const usable = (m: Matiere) => m.name != null && m.externalId != null;
  const classe = idClasse ? classes.find((c) => c.id === idClasse) : undefined;
  if (classe) {
    return matieres.filter((m) => usable(m) && !!classe.services && evaluablesFor(classe, m, viewer).length > 0);
  }
  return matieres.filter((m) => usable(m) && classes.some((c) => evaluablesFor(c, m, viewer).length > 0));
}

/** `isValidClasseMatiere` : la ligne d'une évaluation ouvre-t-elle sa saisie ? */
export function canOpenDevoir(idClasse: string, matieres: Matiere[], classes: Classe[], viewer: Viewer): boolean {
  return classes.some((c) => c.id === idClasse) && matieresForClasse(matieres, idClasse, classes, viewer).length > 0;
}

// ── Filtres de liste ─────────────────────────────────────────────────────────

/** Critères de la liste des évaluations ; `null` = pas de filtre. */
export interface DevoirSearch {
  classe: string | null;
  matiere: string | null;
  sousmatiere: number | null;
  type: number | null;
  /** Type de période ; l'entrée « Année » (`null`) ne filtre pas. */
  periode: number | null;
  name: string;
  enseignant: string | null;
}

export const EMPTY_SEARCH: DevoirSearch = {
  classe: null,
  matiere: null,
  sousmatiere: null,
  type: null,
  periode: null,
  name: '',
  enseignant: null,
};

/**
 * `customSearchFilters`. Une seule différence avec l'AngularJS : le nom est cherché comme TEXTE,
 * et non compilé en expression régulière — « Contrôle (bis » y levait une exception qui vidait
 * la liste.
 */
export function filterDevoirs<T extends Devoir>(devoirs: T[], search: DevoirSearch): T[] {
  const name = search.name.trim().toUpperCase();
  return devoirs.filter(
    (d) =>
      (search.classe === null || d.id_groupe === search.classe) &&
      (search.matiere === null || d.id_matiere === search.matiere) &&
      (search.sousmatiere === null || d.id_sousmatiere === search.sousmatiere) &&
      (search.type === null || d.id_type === search.type) &&
      (search.periode === null || d.id_periode === search.periode) &&
      (name === '' || d.name.toUpperCase().includes(name)) &&
      (search.enseignant === null || d.owner === search.enseignant),
  );
}

/** Ordre de l'AngularJS : la plus récente d'abord, puis par nom de classe. */
export function sortDevoirs<T extends Devoir & { nameClass?: string }>(devoirs: T[]): T[] {
  return [...devoirs].sort(
    (a, b) => b.date.localeCompare(a.date) || (a.nameClass ?? '').localeCompare(b.nameClass ?? '', 'fr'),
  );
}

/** `customClassFilters` : les classes qui ont au moins une évaluation que l'usager y évalue. */
export function classesWithDevoirs(classes: Classe[], devoirs: Devoir[], viewer: Viewer): Classe[] {
  const evaluated = new Set(
    devoirs.filter((d) => isValidClasse(d.id_groupe, d.id_matiere, classes, viewer)).map((d) => d.id_groupe),
  );
  return classes.filter((c) => evaluated.has(c.id));
}

/**
 * `customPeriodeFilters` : on garde un type de période dès qu'une période DU MÊME GENRE porte une
 * évaluation (un devoir au 1er trimestre fait proposer les trois trimestres), plus « Année ».
 * Trié comme l'AngularJS (`orderBy:'-type'`) : année en dernier.
 */
export function periodesWithDevoirs(periodes: TypePeriode[], devoirs: Devoir[], classe: string | null): TypePeriode[] {
  const scoped = classe === null ? devoirs : devoirs.filter((d) => d.id_groupe === classe);
  const usedKinds = new Set(
    periodes.filter((p) => p.id !== null && scoped.some((d) => d.id_periode === p.id)).map((p) => p.type),
  );
  return periodes.filter((p) => p.id === null || usedKinds.has(p.type)).sort((a, b) => b.type - a.type);
}

/**
 * « Évaluations non terminées » de l'accueil. ⚠ `percent < 100` à la manière de JavaScript : une
 * valeur `null` y vaut 0 (évaluation retenue), une valeur ABSENTE ne l'est pas — c'était le
 * comportement de l'AngularJS et l'écran en dépendait.
 */
export function isNotDone(devoir: Pick<Devoir, 'percent'>): boolean {
  if (devoir.percent === undefined) return false;
  return (devoir.percent ?? 0) < 100;
}

// ── Affichage ────────────────────────────────────────────────────────────────

/** `getFormatedDate(date, 'DD/MM/YYYY')`, sans dépendre du fuseau pour une date seule. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (day) return `${day[3]}/${day[2]}/${day[1]}`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('fr-FR');
}

/** Libellé du genre de groupe, utilisé pour regrouper les classes dans les listes. */
export function typeGroupeKey(type: number): 'classe' | 'groupe' | 'manuel' {
  return type === 1 ? 'groupe' : type === 2 ? 'manuel' : 'classe';
}

/** Classes groupées par genre puis triées par nom (`orderBy:['type_groupe_libelle','name']`). */
export function sortClasses(classes: Classe[]): Classe[] {
  return [...classes].sort((a, b) => a.type_groupe - b.type_groupe || a.name.localeCompare(b.name, 'fr'));
}
