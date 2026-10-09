// Client REST du module Compétences — session ENT, même origine.

import type {
  Classe,
  Devoir,
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

export const getMatieres = async (structureId: string): Promise<Matiere[]> =>
  (await getJson<Matiere[]>(`/viescolaire/matieres/services-filter?idEtablissement=${structureId}`)) ?? [];

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
