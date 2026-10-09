/**
 * Formes des données servies par competences et viescolaire, telles que l'IHM AngularJS les
 * consommait. Seuls les champs lus par la nouvelle IHM sont déclarés.
 */

/** Enseignant secondaire d'un service : co-enseignant ou remplaçant. */
export interface SecondTeacher {
  second_teacher_id: string;
  subject_id?: string;
  /** Remplaçant seulement : bornes de la suppléance (date ISO). */
  start_date?: string;
  entered_end_date?: string;
}

/** Service d'enseignement : un enseignant, une matière, une classe ou un groupe. */
export interface Service {
  id_enseignant: string;
  id_matiere: string;
  /** Un service porte soit un seul groupe, soit plusieurs. */
  id_groupe?: string;
  id_groups?: string[];
  evaluable: boolean;
  coTeachers?: SecondTeacher[];
  substituteTeachers?: SecondTeacher[];
}

/** 0 = classe, 1 = groupe d'enseignement, 2 = groupe manuel (`Classe.type` de l'AngularJS). */
export type TypeGroupe = 0 | 1 | 2;

export interface Classe {
  id: string;
  name: string;
  externalId?: string;
  type_groupe: TypeGroupe;
  /** Services de la classe, rattachés côté client comme le faisait `Structure.classes.sync`. */
  services: Service[] | null;
}

export interface SousMatiere {
  id_type_sousmatiere: number | string;
  libelle: string;
}

export interface Matiere {
  id: string;
  name: string;
  externalId?: string | null;
  sousMatieres?: SousMatiere[];
  /** Restriction de la matière à certaines classes (identifiants externes). */
  libelleClasses?: string[];
}

export interface TypeDevoir {
  id: number;
  nom: string;
}

/** Type de période (trimestre, semestre), avec l'entrée « Année » d'identifiant `null`. */
export interface TypePeriode {
  id: number | null;
  /** 0 = année, 2 = semestre, 3 = trimestre (cf. `viescolaire.periode.N`). */
  type: number;
  ordre?: number;
}

export interface TypeSousMatiere {
  id: number;
  libelle: string;
}

export interface Enseignant {
  id: string;
  displayName: string;
}

export interface Eleve {
  id: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  idClasse: string;
  deleteDate?: string | null;
}

/** Une évaluation, ligne de `GET /competences/devoirs`. */
export interface Devoir {
  id: number;
  name: string;
  owner: string;
  libelle?: string | null;
  id_groupe: string;
  type_groupe?: number;
  is_evaluated: boolean;
  id_sousmatiere: number | null;
  /** Identifiant du TYPE de période (`TypePeriode.id`), et non d'une période de classe. */
  id_periode: number | null;
  id_type: number;
  id_etablissement: string;
  diviseur: number;
  id_matiere: string;
  coefficient: number | string;
  ramener_sur: boolean;
  /** Avancement de la saisie, en pourcentage ; absent tant que rien n'a été calculé. */
  percent?: number | null;
  date: string;
  date_publication?: string;
  apprec_visible?: boolean;
  _type_libelle?: string;
  _sousmatiere_libelle?: string | null;
  nbcompetences: number | string;
  /** Identifiant de connexion du propriétaire (affiché aux chefs d'établissement). */
  teacher?: string;
}

/** Ce que `GET /directory/user/:id?manual-groups=true` dit des classes dont on est professeur principal. */
export interface UserDetails {
  headTeacher?: string[];
  headTeacherManual?: string[];
}

/** Établissement de l'usager où les évaluations sont activées. */
export interface Structure {
  id: string;
  name: string;
}

/** Préférence usager `competencesUi` : choix d'interface et état des bandeaux. */
export interface UiPreference {
  ui?: 'react' | 'angular';
  invitationDismissed?: boolean;
  invitationShown?: number;
  returnDismissed?: boolean;
  returnShown?: number;
  feedback?: string;
  feedbackAt?: string;
}
