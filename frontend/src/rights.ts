/**
 * Droits de workflow de l'espace enseignant — mêmes clés que l'IHM AngularJS
 * (`public/ts/behaviours.ts`), pour que les deux interfaces accordent les mêmes permissions.
 */
export const WORKFLOW = {
  /** Créer une évaluation : garde l'accueil et la liste des évaluations. */
  canCreateEval: 'fr.openent.competences.controllers.DevoirController|createDevoir',
  accessReleve: 'fr.openent.competences.controllers.NoteController|getNoteElevePeriode',
  accessSuiviEleve: 'fr.openent.competences.controllers.CompetenceNoteController|getCompetenceNoteEleve',
  accessSuiviClasse: 'fr.openent.competences.controllers.CompetenceNoteController|getCompetenceNoteClasse',
  accessProjets: 'fr.openent.competences.controllers.ElementBilanPeriodiqueController|createAppreciationSaisieProjet',
  accessConseil: 'fr.openent.competences.controllers.BilanPeriodiqueController|getSuiviDesAcquisEleve',
  exportLSU: 'fr.openent.competences.controllers.LSUController|getXML',
  exportBulletins: 'fr.openent.competences.controllers.ExportPDFController|exportBulletins',
  /** Poser le niveau final d'une compétence dans le suivi d'un élève. */
  saveCompetenceNiveauFinal: 'fr.openent.competences.controllers.CompetenceNoteController|saveCompetenceNiveauFinal',
  /** Droit `viescolaire.adminChefEtab` : personnel de direction (`Utils.isChefEtabOrHeadTeacher`). */
  adminChefEtab: 'fr.openent.DisplayController|view',
} as const;

export type WorkflowKey = keyof typeof WORKFLOW;

/**
 * Liste FIGÉE passée à `useHasWorkflow` : le hook relance sa lecture à chaque changement
 * d'identité de son argument, un tableau construit pendant le rendu le ferait boucler.
 */
export const ALL_WORKFLOWS: string[] = Object.values(WORKFLOW);

/** Entrées du menu de l'enseignant, dans l'ordre de l'AngularJS (`menu_teacher.html`). */
export const TEACHER_MENU: Array<{ path: string; label: string; right: WorkflowKey }> = [
  { path: '/devoirs/list', label: 'evaluations.test.list', right: 'canCreateEval' },
  { path: '/releve', label: 'evaluations.releve.title', right: 'accessReleve' },
  { path: '/competences/eleve', label: 'evaluations.suivi.eleve.title', right: 'accessSuiviEleve' },
  { path: '/competences/classe', label: 'evaluations.suivi.classe.title', right: 'accessSuiviClasse' },
  { path: '/projets', label: 'evaluations.saisie.projets.title', right: 'accessProjets' },
  { path: '/conseil/de/classe', label: 'evaluations.conseil.de.classe', right: 'accessConseil' },
  { path: '/export', label: 'evaluations.exports', right: 'exportLSU' },
  { path: '/bulletin', label: 'evaluations.generate.bulletin', right: 'exportBulletins' },
];
