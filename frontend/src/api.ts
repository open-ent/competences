// Client REST du module Compétences — session ENT, même origine.

import type {
  Annotation,
  Classe,
  CompetenceDevoir,
  CompetenceNote,
  Devoir,
  DevoirStats,
  EleveDevoir,
  MaitriseLevel,
  NoteDevoir,
  PeriodeClasse,
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
