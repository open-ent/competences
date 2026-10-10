// Client REST du module Compétences — session ENT, même origine.
import type { NoteWrite } from './saisie';
import type { AcquisRaw, AvisSyntheses, Evenement } from './conseil';
import { parseLsuErrors } from './lsu';
import type { ArchiveYears, LsuErrors, StsFile, UnheededStudent } from './lsu';
import { mergeDevoirs } from './family';
import type { FamilyChild, FamilyDevoir, StudentAnnotation, StudentCompetence, StudentDevoir } from './family';
import type { ProjetAppreciation, ProjetElement } from './projets';
import type { MoyenneFinale, SubTopicService } from './releveFamille';
import type { GraphEntry } from './graphiques';
import type { ClasseEvaluation, CompetenceEvaluation, Conversion } from './suivi';

import type {
  Annotation,
  Classe,
  CompetenceDevoir,
  CompetenceNote,
  Devoir,
  DevoirStats,
  EleveDevoir,
  Enseignement,
  MaitriseLevel,
  NoteDevoir,
  PeriodeClasse,
  Releve,
  ReleveAnnee,
  Eleve,
  Enseignant,
  Matiere,
  Service,
  TypeDevoir,
  TypePeriode,
  TypeSousMatiere,
  UiPreference,
  UserDetails,
} from './types';

/**
 * Lecture JSON défensive. Une session expirée ne répond pas 401 mais **200 avec la page de
 * connexion** en HTML : `res.ok` est vrai et c'est `JSON.parse` qui exploserait, loin de la cause.
 * On vérifie donc le type de contenu avant de lire.
 */
async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('json')) throw new Error(`réponse non JSON (session expirée ?) ${url}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

function xsrfHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
  if (match) headers['X-XSRF-TOKEN'] = decodeURIComponent(match[1]);
  return headers;
}

// ── Établissements ────────────────────────────────────────────────────────────

/** Établissements où le module « notes » est activé — l'AngularJS n'en montrait pas d'autres. */
export const getActiveStructureIds = async (): Promise<string[]> =>
  (
    (await getJson<Array<{ id_etablissement: string }>>(
      '/viescolaire/user/structures/actives?module=notes',
    )) ?? []
  ).map((s) => s.id_etablissement);

// ── Référentiels d'un établissement ──────────────────────────────────────────

export const getClasses = async (structureId: string): Promise<Omit<Classe, 'services'>[]> =>
  (await getJson<Omit<Classe, 'services'>[]>(`/viescolaire/classes?idEtablissement=${structureId}`)) ?? [];

export const getServices = async (structureId: string): Promise<Service[]> =>
  (await getJson<Service[]>(`/viescolaire/services?idEtablissement=${structureId}`)) ?? [];

/** Le serveur nomme les sous-matières `sous_matieres` ; l'AngularJS les renommait au chargement. */
export const getMatieres = async (structureId: string): Promise<Matiere[]> =>
  (
    (await getJson<Array<Matiere & { sous_matieres?: Matiere['sousMatieres'] }>>(
      `/viescolaire/matieres/services-filter?idEtablissement=${structureId}`,
    )) ?? []
  ).map(({ sous_matieres, ...matiere }) => ({ ...matiere, sousMatieres: matiere.sousMatieres ?? sous_matieres ?? [] }));

export const getTypes = async (structureId: string): Promise<TypeDevoir[]> =>
  (await getJson<TypeDevoir[]>(`/competences/types?idEtablissement=${structureId}`)) ?? [];

/** Types de période, complétés de l'entrée « Année » (`id: null`) comme le faisait l'AngularJS. */
export const getTypePeriodes = async (): Promise<TypePeriode[]> => [
  ...((await getJson<TypePeriode[]>('/viescolaire/periodes/types')) ?? []),
  { id: null, type: 0 },
];

export const getTypeSousMatieres = async (structureId: string): Promise<TypeSousMatiere[]> => {
  const data = await getJson<TypeSousMatiere[] | { error: unknown }>(
    `/viescolaire/types/sousmatieres?idStructure=${structureId}`,
  );
  return Array.isArray(data) ? data : [];
};

export const getEnseignants = async (structureId: string): Promise<Enseignant[]> =>
  (await getJson<Enseignant[]>(`/competences/user/list?profile=Teacher&structureId=${structureId}`)) ?? [];

/** Classes dont l'usager est professeur principal (identifiants EXTERNES des classes). */
export const getUserDetails = async (userId: string): Promise<UserDetails> =>
  (await getJson<UserDetails>(`/directory/user/${userId}?manual-groups=true`)) ?? {};

/**
 * Élèves de l'établissement. Un enseignant ne voit que ceux de ses classes : l'AngularJS passait
 * alors chaque classe en paramètre ; un personnel de direction reçoit tout l'établissement.
 */
export const getEleves = async (structureId: string, classIds?: string[]): Promise<Eleve[]> => {
  const params = new URLSearchParams({ idEtablissement: structureId });
  classIds?.forEach((id) => params.append('idClasse', id));
  return (await getJson<Eleve[]>(`/viescolaire/classe/eleves?${params}`)) ?? [];
};

// ── Évaluations ──────────────────────────────────────────────────────────────

export const getDevoirs = async (structureId: string): Promise<Devoir[]> =>
  (await getJson<Devoir[]>(`/competences/devoirs?idEtablissement=${structureId}`)) ?? [];

// ── Préférence d'interface ───────────────────────────────────────────────────

const UI_PREFERENCE_URL = '/userbook/preference/competencesUi';

/** L'enveloppe est `{ preference: "<json>" }` — une CHAÎNE, pas un objet. */
export async function getUiPreference(): Promise<UiPreference> {
  try {
    const body = await getJson<{ preference?: string | null }>(UI_PREFERENCE_URL);
    if (!body?.preference) return {};
    return (JSON.parse(body.preference) as UiPreference) ?? {};
  } catch {
    return {};
  }
}

export async function setUiPreference(preference: UiPreference): Promise<void> {
  await fetch(UI_PREFERENCE_URL, {
    credentials: 'include',
    method: 'PUT',
    headers: xsrfHeaders(),
    body: JSON.stringify(preference),
  });
}

// ── Saisie d'une évaluation ──────────────────────────────────────────────────

/**
 * Écriture. Le corps de réponse est lu s'il est en JSON (`{ id }` à la création, `{}` sinon) ;
 * toute réponse en erreur lève une exception, que l'écran présente à l'enseignant.
 */
async function send<T = unknown>(method: 'POST' | 'PUT' | 'DELETE', url: string, body?: unknown): Promise<T | null> {
  const res = await fetch(url, {
    credentials: 'include',
    method,
    headers: xsrfHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${method} ${url}`);
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('json')) return null;
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export const getAnnotations = async (structureId: string): Promise<Annotation[]> =>
  (await getJson<Annotation[]>(`/competences/annotations?idEtablissement=${structureId}`)) ?? [];

export const getMaitriseLevels = async (structureId: string): Promise<MaitriseLevel[]> =>
  (await getJson<MaitriseLevel[]>(`/competences/maitrise/level/${structureId}`)) ?? [];

/** Élèves d'une classe, ou d'un groupe (route différente, comme `Classe.eleves.sync`). */
export const getElevesDevoir = async (classe: Pick<Classe, 'id' | 'type_groupe'>): Promise<EleveDevoir[]> =>
  (await getJson<EleveDevoir[]>(
    classe.type_groupe === 0
      ? `/viescolaire/classes/${classe.id}/users`
      : `/viescolaire/groupe/enseignement/users/${classe.id}?type=Student`,
  )) ?? [];

export const getPeriodesClasse = async (classId: string): Promise<PeriodeClasse[]> => {
  try {
    return (await getJson<PeriodeClasse[]>(`/viescolaire/periodes?idGroupe=${classId}`)) ?? [];
  } catch {
    // L'AngularJS chargeait une liste vide en cas d'erreur : la saisie reste ouverte.
    return [];
  }
};

export const getNotesDevoir = async (devoirId: number): Promise<NoteDevoir[]> =>
  (await getJson<NoteDevoir[]>(`/competences/devoir/${devoirId}/notes`)) ?? [];

export const getCompetencesDevoir = async (devoirId: number): Promise<CompetenceDevoir[]> =>
  (await getJson<CompetenceDevoir[]>(`/competences/competences/devoir/${devoirId}`)) ?? [];

export const getCompetenceNotes = async (devoirId: number): Promise<CompetenceNote[]> =>
  (await getJson<CompetenceNote[]>(`/competences/competence/notes/devoir/${devoirId}`)) ?? [];

export const getDevoirStats = async (devoirId: number, structureId: string): Promise<DevoirStats> =>
  (await getJson<DevoirStats>(`/competences/devoir/${devoirId}/moyenne?structureId=${structureId}`)) ?? {};

/** Recalcule ET enregistre l'avancement du devoir côté serveur, puis le renvoie. */
export const refreshPercent = async (devoirId: number, structureId: string, nbStudents: number): Promise<number> =>
  (
    await getJson<{ percent?: number }>(
      `/competences/devoirs/done?structureId=${structureId}&idDevoir=${devoirId}&nbStudents=${nbStudents}`,
    )
  )?.percent ?? 0;

/** Note d'un élève : le serveur met à jour la note existante (une seule par élève et par devoir). */
export const saveNote = (devoirId: number, eleveId: string, valeur: number) =>
  send('POST', '/competences/note', { id_devoir: devoirId, id_eleve: eleveId, valeur });

export const deleteNote = (noteId: number) => send('DELETE', `/competences/note?idNote=${noteId}`);

/** Annotation : le serveur efface la note, et les niveaux sauf pour « non noté » sur un devoir noté. */
export const saveAnnotation = (devoirId: number, eleveId: string, annotationId: number) =>
  send('POST', '/competences/annotation', { id_devoir: devoirId, id_annotation: annotationId, id_eleve: eleveId });

export const deleteAnnotation = (devoirId: number, eleveId: string) =>
  send('DELETE', `/competences/annotation?idDevoir=${devoirId}&idEleve=${eleveId}`);

export const createAppreciation = (devoirId: number, eleveId: string, valeur: string) =>
  send<{ id?: number }>('POST', '/competences/appreciation', { id_devoir: devoirId, id_eleve: eleveId, valeur });

export const updateAppreciation = (id: number, devoirId: number, eleveId: string, valeur: string) =>
  send('PUT', `/competences/appreciation?idAppreciation=${id}`, { id, id_devoir: devoirId, id_eleve: eleveId, valeur });

export const deleteAppreciation = (id: number) => send('DELETE', `/competences/appreciation?idAppreciation=${id}`);

/** Niveau d'un élève sur une compétence (mise à jour s'il existe déjà). */
export const saveCompetenceNote = (devoirId: number, eleveId: string, competenceId: number, evaluation: number) =>
  send('POST', '/competences/competence/note', {
    id_devoir: devoirId,
    id_competence: competenceId,
    evaluation,
    id_eleve: eleveId,
  });

export const deleteCompetenceNote = (id: number) => send('DELETE', `/competences/competence/note?id=${id}`);

/** Coloriage en masse : création ou mise à jour groupée. */
export const saveCompetenceNotes = (
  data: Array<{ id_devoir: number; id_competence: number; id_eleve: string; evaluation: number }>,
) => send('POST', '/competences/competence/notes', { data });

export const deleteCompetenceNotes = (ids: number[]) =>
  send('DELETE', `/competences/competence/notes?${ids.map((id) => `id=${id}`).join('&')}`);

export const switchApprecVisibility = (devoirId: number) => send('PUT', `/competences/devoirs/${devoirId}/visibility`);

/** « Marquer l'évaluation comme terminée » : l'avancement passe à 100 %. */
export const finishDevoir = (devoirId: number) => send('PUT', `/competences/devoir/finish?idDevoir=${devoirId}`);

// ── Création et modification d'une évaluation ────────────────────────────────

/** Référentiel du cycle de la classe : enseignements → compétences → sous-compétences. */
export const getEnseignements = async (classId: string): Promise<Enseignement[]> =>
  (await getJson<Enseignement[]>(`/competences/enseignements?idClasse=${classId}`)) ?? [];

/** Ce qui est déjà saisi sur une évaluation : `TypeEvalSkill` (id = compétence) et `TypeEvalNum`. */
export const getEvaluationInformation = async (devoirId: number): Promise<Array<{ id: string; typeeval: string }>> =>
  (await getJson<Array<{ id: string; typeeval: string }>>(`/competences/devoirs/evaluations/information?idDevoir=${devoirId}`)) ?? [];

/** Compétences de la dernière évaluation créée par l'usager. */
export const getLastDevoirCompetences = async (): Promise<CompetenceDevoir[]> =>
  (await getJson<CompetenceDevoir[]>('/competences/competences/last/devoir/')) ?? [];

/** ⚠ Le serveur lit `owner`, absent de son schéma JSON : sans lui, 400. */
export const createDevoir = (body: Record<string, unknown>) => send<{ id: number }>('POST', '/competences/devoir', body);

export const updateDevoir = (devoirId: number, body: Record<string, unknown>) =>
  send('PUT', `/competences/devoir?idDevoir=${devoirId}`, body);

/** Applique une écriture de note décidée par `noteWrite` (saisie et relevé). */
export async function applyNoteWrite(devoirId: number, eleveId: string, write: NoteWrite): Promise<void> {
  switch (write.kind) {
    case 'deleteAnnotation':
      await deleteAnnotation(devoirId, eleveId);
      return;
    case 'deleteNote':
      await deleteNote(write.noteId);
      return;
    case 'annotation':
      await saveAnnotation(devoirId, eleveId, write.annotationId);
      return;
    case 'note':
      if (write.replacesAnnotation) await deleteAnnotation(devoirId, eleveId);
      await saveNote(devoirId, eleveId, write.valeur);
      return;
    default:
  }
}

// ── Relevé périodique ────────────────────────────────────────────────────────

interface ReleveKey {
  structureId: string;
  classe: Pick<Classe, 'id' | 'type_groupe'>;
  matiereId: string;
  /** Type de période ; `null` = l'année. */
  periode: number | null;
}

const releveQuery = (k: ReleveKey) =>
  `idEtablissement=${k.structureId}&idClasse=${k.classe.id}&idMatiere=${k.matiereId}&typeClasse=${k.classe.type_groupe}`;

export const getReleve = async (k: ReleveKey): Promise<Releve> =>
  getJson<Releve>(`/competences/releve?${releveQuery(k)}${k.periode !== null ? `&idPeriode=${k.periode}` : ''}`);

export const getReleveAnnee = async (k: ReleveKey): Promise<ReleveAnnee> =>
  (await getJson<ReleveAnnee>(`/competences/releve/annee/classe?${releveQuery(k)}`)) ?? { moyennes: [], moyennes_finales: [] };

const releveBody = (k: ReleveKey) => ({
  idMatiere: k.matiereId,
  idClasse: k.classe.id,
  idEtablissement: k.structureId,
  idPeriode: k.periode,
});

/**
 * Moyenne finale d'un élève. `moyenne: null` pose « NN » ; `remove` rend la main au calcul
 * (`delete` du serveur).
 */
export const saveMoyenneFinale = (k: ReleveKey, eleveId: string, moyenne: number | null, remove: boolean) =>
  send('POST', '/competences/releve/periodique', { ...releveBody(k), idEleve: eleveId, colonne: 'moyenne', moyenne, delete: remove });

/** Appréciation de matière d'un élève sur la période : création, mise à jour ou effacement. */
export const saveAppreciationMatiere = (k: ReleveKey, eleveId: string, appreciation: string, mode: 'POST' | 'PUT' | 'DELETE') =>
  send(mode, '/competences/appreciation-subject-period', {
    ...releveBody(k),
    idEleve: eleveId,
    appreciation_matiere_periode: appreciation,
    delete: mode === 'DELETE',
  });

export const saveAppreciationClasse = (k: ReleveKey, appreciation: string) =>
  send('POST', '/competences/appreciation/classe', {
    appreciation,
    id_classe: k.classe.id,
    id_periode: k.periode,
    id_matiere: k.matiereId,
    idEtablissement: k.structureId,
  });

export const saveElementProgramme = (k: ReleveKey, texte: string) =>
  send('POST', '/competences/releve/element/programme', { ...releveBody(k), texte });

// ── Suivi d'un élève ─────────────────────────────────────────────────────────

/** Domaine du socle, avec ses sous-domaines et les compétences qui s'y rattachent. */
export interface DomaineSuivi {
  id: number;
  niveau: number;
  codification: string;
  libelle: string;
  evaluated: boolean;
  domaines?: DomaineSuivi[];
  competences?: Array<{ id: number; nom: string; id_domaine: number; masque: boolean }>;
}

export const getDomainesEleve = async (classId: string, eleveId: string, idCycle: number): Promise<DomaineSuivi[]> =>
  (await getJson<DomaineSuivi[]>(`/competences/domaines?idClasse=${classId}&idEleve=${eleveId}&idCycle=${idCycle}`)) ?? [];

/** Évaluations de compétences d'un élève ; sans période, toute l'année. */
export const getCompetenceNotesEleve = async (
  eleveId: string,
  idCycle: number,
  periode: number | null,
  isCycle = false,
): Promise<CompetenceEvaluation[]> =>
  (await getJson<CompetenceEvaluation[]>(
    `/competences/competence/notes/eleve/${eleveId}?idCycle=${idCycle}${periode !== null ? `&idPeriode=${periode}` : ''}&isCycle=${isCycle}`,
  )) ?? [];

export const getConversionTable = async (structureId: string, classId: string): Promise<Conversion[]> =>
  (await getJson<Conversion[]>(`/competences/competence/notes/bilan/conversion?idEtab=${structureId}&idClasse=${classId}`)) ?? [];

/** Option de l'établissement : niveau d'une compétence par MOYENNE plutôt que par maximum. */
export const getSkillAverageOption = async (structureId: string): Promise<boolean> => {
  try {
    return !!(await getJson<{ is_average_skills?: boolean }>(`/competences/structure/${structureId}/options/isSkillAverage`))
      ?.is_average_skills;
  } catch {
    return false;
  }
};

/** Niveau final d'une compétence pour l'élève, sur une période (`null` = l'année). */
export const saveNiveauFinal = (body: {
  id_periode: number | null;
  id_eleve: string;
  niveau_final: number;
  id_competence: number;
  ids_matieres: string[];
}) => send('POST', '/competences/competence/note/niveaufinal', body);

/** Évaluations de compétences de toute la classe ; sans période, toute l'année. */
export const getCompetenceNotesClasse = async (
  classe: Pick<Classe, 'id' | 'type_groupe'>,
  structureId: string,
  periode: number | null,
): Promise<ClasseEvaluation[]> =>
  (await getJson<ClasseEvaluation[]>(
    `/competences/competence/notes/classe/${classe.id}/${classe.type_groupe}?structureId=${structureId}${periode !== null ? `&idPeriode=${periode}` : ''}`,
  )) ?? [];

/** Arbre des domaines de la classe (sans élève). */
export const getDomainesClasse = async (classId: string): Promise<DomaineSuivi[]> =>
  (await getJson<DomaineSuivi[]>(`/competences/domaines?idClasse=${classId}`)) ?? [];

// ── Conseil de classe ────────────────────────────────────────────────────────

/** Suivi des acquis d'un élève : une entrée par matière, toutes périodes confondues. */
export const getAcquis = async (eleveId: string, structureId: string, classeId: string, periode: number): Promise<AcquisRaw[]> =>
  (await getJson<AcquisRaw[]>(`/competences/bilan/periodique/eleve/${eleveId}?idEtablissement=${structureId}&idClasse=${classeId}&idPeriode=${periode}`)) ?? [];

/** Pourcentage de compétences validées par matière ; une panne ne doit pas masquer le reste. */
export const getSkillsValidated = async (structureId: string, eleveId: string, periode: number, classeId: string): Promise<Map<string, number>> => {
  try {
    const body = await getJson<{ achievementsSubjects?: Array<{ subjectId: string; skillsValidatedPercentage: number }> }>(
      `/competences/structures/${structureId}/student/${eleveId}/subjectsSkillsValidatedPercentage?periodId=${periode}&groupId=${classeId}`,
    );
    return new Map((body?.achievementsSubjects ?? []).map((s) => [s.subjectId, s.skillsValidatedPercentage]));
  } catch {
    return new Map();
  }
};

/** Positionnement retenu pour une matière ; `remove` rend la main au calcul. */
export const savePositionnement = (
  k: { structureId: string; classeId: string; matiereId: string; periode: number },
  eleveId: string,
  positionnement: number,
  remove: boolean,
) =>
  send('POST', '/competences/releve/periodique', {
    idEleve: eleveId,
    idMatiere: k.matiereId,
    idEtablissement: k.structureId,
    idPeriode: k.periode,
    idClasse: k.classeId,
    colonne: 'positionnement',
    positionnement,
    delete: remove,
    isBilanPeriodique: true,
  });

// ── Saisie des projets ───────────────────────────────────────────────────────

/** Classes qui portent au moins un élément de projet. */
export const getProjetClasses = async (structureId: string): Promise<Array<Omit<Classe, 'services'>>> =>
  (await getJson<Array<Omit<Classe, 'services'>>>(`/competences/elementsBilanPeriodique/classes?idStructure=${structureId}`)) ?? [];

/** Éléments de la classe sur lesquels l'usager intervient. */
/** Éléments du bilan périodique de la classe ; avec un enseignant, ceux où il intervient seulement. */
export const getProjetElements = async (structureId: string, classeId: string, enseignantId?: string): Promise<ProjetElement[]> =>
  (await getJson<ProjetElement[]>(
    `/competences/elementsBilanPeriodique?idEtablissement=${structureId}&idClasse=${classeId}${enseignantId ? `&idEnseignant=${enseignantId}` : ''}`,
  )) ?? [];

export const getProjetTeachers = async (structureId: string, classeId: string, ids: number[]): Promise<Map<number, string[]>> => {
  if (ids.length === 0) return new Map();
  const rows =
    (await getJson<Array<{ idElement: number; idsEnseignants: string[] }>>(
      `/competences/elementsBilanPeriodique/enseignants?idClasse=${classeId}&idEtablissement=${structureId}${ids.map((id) => `&idElement=${id}`).join('')}`,
    )) ?? [];
  return new Map(rows.map((r) => [r.idElement, r.idsEnseignants]));
};

export const getProjetAppreciations = async (structureId: string, classeId: string, periode: number, ids: number[]): Promise<ProjetAppreciation[]> =>
  ids.length === 0
    ? []
    : ((await getJson<ProjetAppreciation[]>(
        `/competences/elementsAppreciations?idPeriode=${periode}&idClasse=${classeId}&idEtablissement=${structureId}${ids.map((id) => `&idElement=${id}`).join('')}`,
      )) ?? []);

/** Appréciation d'un élève (`eleveId`) ou de la classe sur un élément ; le serveur met à jour l'existante. */
export const saveProjetAppreciation = (
  k: { structureId: string; classe: Pick<Classe, 'id' | 'externalId'>; periode: number; elementId: number },
  appreciation: string,
  eleveId?: string,
) =>
  send('POST', `/competences/elementsAppreciationsSaisieProjet?type=${eleveId ? 'eleve' : 'classe'}`, {
    id_periode: k.periode,
    id_element: k.elementId,
    id_etablissement: k.structureId,
    ...(eleveId ? { id_eleve: eleveId } : {}),
    appreciation,
    id_classe: k.classe.id,
    externalid_classe: k.classe.externalId,
  });

// ── Bulletins ────────────────────────────────────────────────────────────────

/** Modèles de matières de l'établissement (ordre et libellés imprimés sur le bulletin). */
export const getMatiereModels = async (structureId: string): Promise<Array<{ id?: number; title: string }>> =>
  (await getJson<Array<{ id?: number; title: string }>>(`/competences/matieres/models/${structureId}`)) ?? [];

/** Logo, signature et nom du chef d'établissement déjà enregistrés pour les bulletins. */
export const getBulletinStructureInfos = async (structureId: string) =>
  (await getJson<{ imgStructure?: { path?: string }; nameAndBrad?: { name?: string; path?: string } }>(
    `/competences/images/and/infos/bulletins/structure/${structureId}`,
  )) ?? {};

/** 201 : des bulletins existent déjà pour ces élèves sur la période (archivés). */
export async function bulletinsExist(students: Array<{ id: string; idClasse: string }>, idType: number, structureId: string): Promise<boolean> {
  const res = await fetch('/competences/bulletins/exists', {
    credentials: 'include',
    method: 'POST',
    headers: xsrfHeaders(),
    body: JSON.stringify({ students, id_type: idType, idStructure: structureId }),
  });
  if (!res.ok) throw new Error(`${res.status} bulletins/exists`);
  return res.status === 201;
}

/**
 * Génère les bulletins d'une classe et renvoie le PDF. Un conflit de coefficients revient en 400
 * avec la liste des élèves concernés, dans le corps — que l'on rend lisible.
 */
export async function generateBulletins(body: Record<string, unknown>): Promise<{ blob: Blob; filename: string } | { conflict: string[] }> {
  const res = await fetch('/competences/export/bulletins', {
    credentials: 'include',
    method: 'POST',
    headers: xsrfHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    try {
      const data = (await res.json()) as { eleves?: Array<{ lastName?: string; firstName?: string; name?: string }> };
      if (data.eleves) return { conflict: data.eleves.map((e) => `${e.lastName ?? e.name ?? ''} ${e.firstName ?? ''}`.trim()) };
    } catch {
      /* corps illisible : erreur générique */
    }
    throw new Error(`${res.status} export/bulletins`);
  }
  const disposition = res.headers.get('content-disposition') ?? '';
  const filename = (disposition.split('filename=')[1] ?? 'bulletins.pdf').replace(/"/g, '');
  return { blob: await res.blob(), filename };
}

/** Préférence `competences` de l'usager, partagée avec l'AngularJS (`printBulletin` y vit). */
export async function getCompetencesPreference(): Promise<Record<string, unknown>> {
  try {
    const body = await getJson<{ preference?: string | null }>('/userbook/preference/competences');
    return body?.preference ? (JSON.parse(body.preference) as Record<string, unknown>) ?? {} : {};
  } catch {
    return {};
  }
}

export async function setCompetencesPreference(value: Record<string, unknown>): Promise<void> {
  await fetch('/userbook/preference/competences', { credentials: 'include', method: 'PUT', headers: xsrfHeaders(), body: JSON.stringify(value) });
}

// ── Export LSU et archives (#/export) ─────────────────────────────────────────

/** Personnels de direction proposés comme responsables de l'export. */
export const getResponsablesDirection = async (structureId: string): Promise<Array<{ id: string; displayName: string }>> =>
  (await getJson<Array<{ id: string; displayName: string }>>(`/competences/responsablesDirection?idStructure=${structureId}`)) ?? [];

/** Les dix derniers fichiers STS enregistrés pour l'établissement, du plus récent au plus ancien. */
export const getStsFiles = async (structureId: string): Promise<StsFile[]> =>
  (await getJson<StsFile[]>(`/competences/lsu/sts/files/${structureId}`)) ?? [];

export const saveStsFile = (structureId: string, name: string, individus: unknown[]) =>
  send<{ id: number; creation_date: string }>('POST', '/competences/lsu/data/sts', {
    id_structure: structureId,
    name_file: name,
    content: JSON.stringify(individus),
  });

/** Élèves déjà écartés de l'export ; `idPeriodes` à `null` pour la fin de cycle. */
export const getUnheededStudents = async (structureId: string, idClasses: string[], idPeriodes: number[] | null) =>
  (await send<UnheededStudent[]>('POST', '/competences/lsu/unheeded/students', { action: 'get', idStructure: structureId, idClasses, idPeriodes })) ?? [];

export const setUnheededStudent = (ignore: boolean, idEleve: string, idClasse: string, idPeriode: number | null) =>
  send('POST', '/competences/lsu/unheeded/students', { action: ignore ? 'add' : 'rem', idsStudents: [idEleve], idClasse, idPeriode });

/** Le fichier XML, ou les erreurs de l'export (400). */
export async function exportLsu(body: unknown): Promise<{ blob: Blob; filename: string } | { errors: LsuErrors }> {
  const res = await fetch('/competences/exportLSU/lsu', { credentials: 'include', method: 'POST', headers: xsrfHeaders(), body: JSON.stringify(body) });
  if (res.status === 400) {
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* corps illisible */
    }
    if (data && typeof data === 'object') return { errors: parseLsuErrors(data as Record<string, unknown>) };
    throw new Error('400 exportLSU');
  }
  if (!res.ok) throw new Error(`${res.status} exportLSU`);
  const disposition = res.headers.get('content-disposition') ?? '';
  return { blob: await res.blob(), filename: (disposition.split('filename=')[1] ?? 'export-lsu.xml').replace(/"/g, '') };
}

export const getArchiveYears = (structureId: string, type: 'bfc' | 'bulletins') =>
  getJson<ArchiveYears>(`/competences/archive/years?idStructure=${structureId}&type=${type}`);

export const getArchivesBfc = async (structureId: string) =>
  (await getJson<Array<{ id_annee: string; id_cycle: number }>>(`/competences/archive-bfc?idEtablissement=${structureId}`)) ?? [];

export const getArchivesBulletins = async (structureId: string) =>
  (await getJson<Array<{ id_annee: string; id_periode: number }>>(`/competences/archive-bulletin?idEtablissement=${structureId}`)) ?? [];

/** Le zip des archives ; `null` s'il n'y a rien à archiver (204) ou si la génération est en cours (202). */
export async function downloadArchives(structureId: string, type: 'bfc' | 'bulletins', year: string, periodes?: number[]) {
  let url = `/competences/archive/${type}?idStructure=${structureId}&idYear=${year}`;
  if (periodes) url += `&idsPeriode=${periodes.join(',')}`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`${res.status} archive`);
  if (res.status !== 200) return { status: res.status as 202 | 204 };
  const disposition = res.headers.get('content-disposition') ?? '';
  return { status: 200 as const, blob: await res.blob(), filename: (disposition.split('filename=')[1] ?? `archives-${type}.zip`).replace(/"/g, '') };
}

// ── Espace des élèves et des parents ──────────────────────────────────────────

/** Les enfants du parent connecté, avec leur classe et leur établissement. */
export const getEnfants = async (): Promise<FamilyChild[]> => (await getJson<FamilyChild[]>('/competences/enfants')) ?? [];

/**
 * Les devoirs de l'élève sur l'année : notés, évalués par compétences ou annotés — trois lectures
 * fusionnées comme le faisait l'AngularJS (`Evaluations.devoirs.sync`).
 */
export async function getStudentDevoirs(child: FamilyChild): Promise<FamilyDevoir[]> {
  const [devoirs, competences, annotations] = await Promise.all([
    getJson<StudentDevoir[]>(`/competences/devoirs?idEtablissement=${child.idStructure}&forStudentReleve=true&idEleve=${child.id}`),
    getJson<StudentCompetence[]>(`/viescolaire/competences/eleve?idEleve=${child.id}&idClasse=${child.idClasse}`),
    getJson<StudentAnnotation[]>(`/viescolaire/annotations/eleve?idEleve=${child.id}&idClasse=${child.idClasse}`),
  ]);
  return mergeDevoirs(devoirs ?? [], competences ?? [], annotations ?? []);
}

/** Matières de l'établissement de l'élève, avec leurs sous-matières. */
export const getStudentMatieres = async (structureId: string) =>
  (await getJson<Array<{ id: string; name: string; sous_matieres?: Array<{ id_type_sousmatiere: number; libelle: string }> }>>(
    `/viescolaire/matieres/services-filter?idEtablissement=${structureId}`,
  )) ?? [];

/** Enseignants de l'établissement de l'élève : de quoi nommer l'auteur d'un devoir. */
export const getStudentTeachers = async (structureId: string) =>
  (await getJson<Array<{ id: string; displayName: string }>>(`/competences/user/list?profile=Teacher&structureId=${structureId}`)) ?? [];

/** Appréciation de l'enseignant sur le devoir, quand il l'a rendue visible. */
export const getDevoirAppreciation = async (devoirId: number, eleveId: string): Promise<string | null> =>
  (await getJson<Array<{ appreciation?: string }>>(`/viescolaire/appreciation/devoir/${devoirId}/eleve/${eleveId}`))?.[0]?.appreciation ?? null;

/** Cycles qu'a suivis l'élève, le plus récent d'abord comme le renvoie le serveur. */
export const getCyclesEleve = async (eleveId: string) =>
  (await getJson<Array<{ id_cycle: number; libelle: string }>>(`/competences/cycles/eleve/${eleveId}`)) ?? [];

export const studentPictureUrl = (child: FamilyChild) => `/viescolaire/structures/${child.idStructure}/students/${child.id}/picture`;

/** Moyennes posées par les enseignants pour l'élève ; sans période, celles de l'année. */
export const getMoyennesFinales = async (eleveId: string, periode: number | null) =>
  (await getJson<MoyenneFinale[]>(`/competences/eleve/${eleveId}/moyenneFinale${periode !== null ? `?idPeriode=${periode}` : ''}`)) ?? [];

/** Coefficients des sous-matières, par enseignant et par classe. */
export const getSubTopicServices = async (structureId: string) =>
  (await getJson<SubTopicService[]>(`/competences/subtopics/services/${structureId}`)) ?? [];

/** Relevé de notes en PDF, tel que l'imprimait l'AngularJS (`Evaluations.getReleve`). */
export function relevePdfUrl(child: FamilyChild, periode: { id_type: number; type: number; ordre: number } | null) {
  let url = `/competences/releve/pdf?idEtablissement=${child.idStructure}&idEleve=${child.id}`;
  if (periode) url += `&idPeriode=${periode.id_type}&idTypePeriode=${periode.type}&ordrePeriode=${periode.ordre}`;
  return url;
}

/** Bulletin déjà généré pour l'élève sur la période ; `null` s'il n'y en a pas (204) ou s'il est refusé. */
export async function seeBulletin(body: {
  idEleve: string;
  idPeriode: number;
  idStructure: string;
  idClasse: string;
  idParent: string | null;
}): Promise<Blob | null> {
  const res = await fetch('/competences/see/bulletins', { credentials: 'include', method: 'POST', headers: xsrfHeaders(), body: JSON.stringify(body) });
  if (res.status === 204 || [400, 401, 403, 500].includes(res.status)) return null;
  if (!res.ok) throw new Error(`${res.status} see/bulletins`);
  return new Blob([await res.arrayBuffer()], { type: 'application/pdf' });
}

// ── Conseil de classe : synthèse, avis, projets de l'élève, vie scolaire ──────

/** Avis proposés, synthèses et avis de l'élève sur toutes les périodes (une seule lecture). */
export const getAvisSyntheses = async (structureId: string, eleveId: string): Promise<AvisSyntheses> =>
  (await getJson<AvisSyntheses>(`/competences/bilan/periodique/datas/avis/synthses?idEtablissement=${structureId}&idEleve=${eleveId}`)) ?? {
    libelleAvis: [],
    syntheses: [],
    avisConseil: [],
    avisOrientation: [],
  };

export const saveSynthese = (k: { structureId: string; classeId: string; eleveId: string; periode: number }, synthese: string) =>
  send('POST', '/competences/syntheseBilanPeriodique', {
    synthese,
    id_eleve: k.eleveId,
    id_typePeriode: k.periode,
    id_structure: k.structureId,
    id_classe: k.classeId,
  });

/** Avis du conseil (`conseil`) ou d'orientation (`orientation`) ; `null` le retire. */
export const saveAvis = (kind: 'conseil' | 'orientation', k: { structureId: string; eleveId: string; periode: number }, idAvis: number | null) =>
  idAvis === null
    ? send('DELETE', `/competences/avis/${kind}?id_eleve=${k.eleveId}&id_periode=${k.periode}&id_structure=${k.structureId}`)
    : send('POST', `/competences/avis/${kind}`, { id_avis_conseil_bilan: idAvis, id_eleve: k.eleveId, id_periode: k.periode, id_structure: k.structureId });

/** Nouvel avis personnalisé de l'établissement : type 1 = conseil, 2 = orientation. */
export const createAvis = async (structureId: string, type: 1 | 2, libelle: string): Promise<number> =>
  (await send<{ id: number }>('POST', '/competences/avis/bilan/periodique', { libelle, type_avis: type, id_etablissement: structureId }))!.id;

export const getAppreciationCPE = async (structureId: string, eleveId: string, periode: number): Promise<string> =>
  (await getJson<{ appreciation?: string }>(`/competences/appreciation/CPE/bilan/periodique?id_eleve=${eleveId}&id_periode=${periode}&id_etablissement=${structureId}`))
    ?.appreciation ?? '';

export const saveAppreciationCPE = (eleveId: string, periode: number, appreciation: string) =>
  send('POST', '/competences/appreciation/CPE/bilan/periodique', { appreciation, id_eleve: eleveId, id_periode: periode });

/** Retards et absences de l'élève, par période. */
export const getEvenements = async (structureId: string, classeId: string, eleveId: string): Promise<Evenement[]> =>
  (await getJson<Evenement[]>(`/competences/eleve/evenements/${eleveId}?idEtablissement=${structureId}&idClasse=${classeId}`)) ?? [];

export const saveEvenement = (eleveId: string, periode: number, colonne: 'retard' | 'abs_just' | 'abs_non_just' | 'abs_totale_heure', value: number) =>
  send('POST', '/competences/eleve/evenements', { idEleve: eleveId, colonne, idPeriode: periode, value });

/** Appréciation d'un élève sur un projet, saisie depuis le conseil de classe. */
export const saveAppreciationElementConseil = (
  k: { structureId: string; classe: Pick<Classe, 'id' | 'externalId'>; periode: number; elementId: number; eleveId: string },
  appreciation: string,
) =>
  send('POST', '/competences/elementsAppreciationBilanPeriodique?type=eleve-bilanPeriodique', {
    id_periode: k.periode,
    id_element: k.elementId,
    id_etablissement: k.structureId,
    id_eleve: k.eleveId,
    appreciation,
    id_classe: k.classe.id,
    externalid_classe: k.classe.externalId,
  });

/** Données des graphiques du conseil, par matière ou par domaine. */
export const getGraphData = async (
  kind: 'matiere' | 'domaine',
  structureId: string,
  classe: Pick<Classe, 'id' | 'type_groupe'>,
  eleveId: string,
  periode: number,
): Promise<GraphEntry[]> =>
  (await getJson<GraphEntry[]>(
    `/competences/bilan/periodique/datas/graph${kind === 'domaine' ? '/domaine' : ''}?idEtablissement=${structureId}&idClasse=${classe.id}&typeClasse=${classe.type_groupe}&idEleve=${eleveId}&idPeriode=${periode}`,
  )) ?? [];
