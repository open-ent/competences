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
  /** Cycle de la classe (`notes.rel_groupe_cycle`) : il choisit l'échelle de maîtrise. */
  id_cycle?: number | null;
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
  default_type?: boolean;
  /** Évaluation formative : sans effet sur la moyenne, coefficient 0 par défaut. */
  formative?: boolean;
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

// ── Saisie d'une évaluation ──────────────────────────────────────────────────

/** Annotation de l'établissement : ABS, DISP, NN, NR (`GET /competences/annotations`). */
export interface Annotation {
  id: number;
  libelle: string;
  libelle_court: string;
}

/** Niveau de maîtrise, défaut du cycle et personnalisation de l'établissement mêlés. */
export interface MaitriseLevel {
  id_cycle: number;
  /** Libellé du cycle (« Cycle 4 »). */
  cycle?: string;
  ordre: number;
  /** Personnalisation (nulle si l'établissement garde le défaut). */
  libelle: string | null;
  couleur: string | null;
  lettre: string | null;
  default_lib: string | null;
  /** Couleur par défaut, sous forme de NOM (`red`, `orange`…). */
  default: string | null;
}

/** Une ligne de `GET /competences/devoir/:id/notes` : note, annotation et appréciation d'un élève. */
export interface NoteDevoir {
  id_eleve: string;
  /** Identifiant de la note (nul si l'élève n'a qu'une annotation ou une appréciation). */
  id: number | null;
  /** En CHAÎNE (« 14.5 »). */
  valeur: string | null;
  id_annotation: number | null;
  id_appreciation: number | null;
  appreciation: string | null;
}

/** Une compétence évaluée par le devoir (`GET /competences/competences/devoir/:id`). */
export interface CompetenceDevoir {
  id_competence: number;
  nom: string;
  code_domaine: string | null;
  index: number;
}

/** Niveau atteint par un élève sur une compétence du devoir ; −1 = non évaluée. */
export interface CompetenceNote {
  id: number;
  id_eleve: string;
  id_competence: number;
  evaluation: number;
}

/** Élève d'une classe ou d'un groupe. */
export interface EleveDevoir {
  id: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  deleteDate?: string | null;
}

/** Période d'une classe (`GET /viescolaire/periodes?idGroupe=`). */
export interface PeriodeClasse {
  id: number | null;
  id_type: number;
  type: number;
  ordre: number;
  timestamp_dt: string;
  timestamp_fn: string;
  date_fin_saisie: string | null;
}

/** Statistiques d'un devoir (`GET /competences/devoir/:id/moyenne`) — vide sans note. */
export interface DevoirStats {
  moyenne?: number;
  noteMin?: number;
  noteMax?: number;
}

// ── Création d'une évaluation ────────────────────────────────────────────────

/** Compétence du référentiel, telle que `GET /competences/enseignements` la renvoie. */
export interface CompetenceRef {
  id: number;
  nom: string;
  code_domaine: string | null;
  masque?: boolean;
  id_cycle: number;
  /** Sous-compétences (seulement au premier niveau). */
  competences_2?: CompetenceRef[];
}

/** Un enseignement et ses compétences, pour le cycle de la classe. */
export interface Enseignement {
  id: number;
  nom: string;
  competences_1?: CompetenceRef[];
}

// ── Relevé périodique ────────────────────────────────────────────────────────

/** Note ou annotation d'un élève sur un devoir, dans `GET /competences/releve`. */
export interface ReleveNoteRow {
  id_devoir: number;
  id_eleve: string;
  id: number | null;
  valeur: string | null;
  /** Annotation posée (ABS, DISP…), par son identifiant. */
  annotation: number | null;
}

/** Un élève du relevé, avec ce que le serveur a calculé pour lui. */
export interface ReleveEleve {
  id: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  deleteDate?: string | null;
  /** Moyenne calculée (absente faute de note). */
  moyenne?: number | null;
  /** Moyenne saisie par l'enseignant : absente si aucune, `null` pour « NN », sinon une chaîne. */
  moyenneFinale?: string | null;
  appreciation_matiere_periode?: string | null;
  /** Moyennes par matière puis par sous-matière (`null` = la matière entière). */
  _moyenne?: Record<string, Record<string, { moyenne?: number | null } | undefined> | undefined>;
}

export interface ReleveStats {
  min: number | string | null;
  max: number | string | null;
  moyenne: number | string | null;
}

export interface Releve {
  eleves: ReleveEleve[];
  notes: ReleveNoteRow[];
  devoirs: Array<{ id: number; moyenne?: number; noteMin?: number; noteMax?: number }>;
  _moyenne_classe?: { null?: ReleveStats; nullFinal?: ReleveStats } & Record<string, ReleveStats | undefined>;
  appreciation_classe?: { appreciation?: string | null };
  elementProgramme?: { texte?: string | null };
}

export interface ReleveAnnee {
  moyennes: Array<{ id_eleve: string; id_periode: number | null; moyenne: number | string | null }>;
  moyennes_finales: Array<{ id_eleve: string; id_periode: number | null; moyenne: number | string | null }>;
}
