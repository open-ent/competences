// Client REST du module Compétences (competences) — session ENT, même origine.
// Incrément 1 : lecture seule des référentiels d'évaluation par compétences.

/** Niveau de l'échelle de maîtrise (référentiel central de l'évaluation par compétences). */
export interface MaitriseLevel {
  id?: number | null;
  id_niveau?: number;
  libelle?: string | null;
  default_lib?: string;
  ordre?: number;
  couleur?: string | null;
  default?: string;
  lettre?: string | null;
  cycle?: string;
}

/** Modalité d'enseignement (référentiel système). */
export interface Modalite {
  id: string;
  libelle: string;
}

/** Matière évaluable (issue d'un modèle de matières de la structure). */
export interface Matiere {
  id: string;
  name: string;
  libelle?: string;
  rank?: number;
}

interface MatiereModel {
  title: string;
  subjects: Array<{ id: string; name: string; libelle?: string; rank?: number }>;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(String(res.status));
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

const base = { credentials: 'include' as const };

// ── Référentiels (lecture seule) ────────────────────────────────────────────────
/** Échelle de maîtrise de l'établissement (peut être vide si non configurée). */
export const getMaitriseLevels = async (structureId: string): Promise<MaitriseLevel[]> =>
  json<MaitriseLevel[]>(await fetch(`/competences/maitrise/level/${structureId}`, base));

/** Modalités d'enseignement (Tronc commun, Option…). */
export const getModalites = async (structureId: string): Promise<Modalite[]> =>
  json<Modalite[]>(await fetch(`/competences/modalites?idEtablissement=${structureId}`, base));

/** Matières évaluables : matières du 1er modèle de matières de la structure. */
export const getMatieres = async (structureId: string): Promise<Matiere[]> => {
  const models = await json<MatiereModel[]>(await fetch(`/competences/matieres/models/${structureId}`, base));
  const first = models?.[0];
  if (!first) return [];
  return first.subjects.map((s) => ({ id: s.id, name: s.name, libelle: s.libelle, rank: s.rank }));
};

/** Un devoir/évaluation (côté liste). */
export interface Devoir {
  id: number;
  name?: string;
  date?: string;
  matiere?: string;
  id_matiere?: string;
  libelle_matiere?: string;
  id_groupe?: string;
  diviseur?: number;
  is_evaluated?: boolean;
}

/** Liste des devoirs/évaluations de l'établissement. */
export const getDevoirs = async (structureId: string): Promise<Devoir[]> =>
  json<Devoir[]>(await fetch(`/competences/devoirs?idEtablissement=${structureId}`, base)).catch(() => []);

// ── Saisie de notes (par devoir / par élève) ─────────────────────────────────────
/** Élève d'une classe (annuaire directory). */
export interface Eleve {
  id: string;
  displayName: string;
}

/** Note d'un élève à un devoir. */
export interface Note {
  id?: number;
  id_eleve: string;
  id_devoir?: number;
  valeur?: string | number;
}

/** Élèves d'une classe (annuaire), triés par nom. */
export const getClassStudents = async (classId: string): Promise<Eleve[]> =>
  json<Array<{ id: string; firstName?: string; lastName?: string; displayName?: string }>>(
    await fetch(`/directory/class/${classId}/users?type=Student`, base),
  ).then((arr) =>
    (arr ?? [])
      .map((u) => ({ id: u.id, displayName: u.displayName ?? (`${u.lastName ?? ''} ${u.firstName ?? ''}`.trim() || u.id) }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr', { sensitivity: 'base' })),
  );

/** Notes déjà saisies pour un devoir. */
export const getDevoirNotes = async (devoirId: number): Promise<Note[]> =>
  json<Note[]>(await fetch(`/competences/devoir/${devoirId}/notes`, base)).catch(() => []);

function xsrfHeader(): Record<string, string> {
  const m = typeof document !== 'undefined' ? document.cookie.match(/XSRF-TOKEN=([^;]+)/) : null;
  return m ? { 'X-XSRF-TOKEN': decodeURIComponent(m[1]) } : {};
}
const mutHeaders = () => ({ 'Content-Type': 'application/json', ...xsrfHeader() });

/** Crée une note (POST) ou la met à jour (PUT si `id` fourni). */
export const saveNote = async (note: Note): Promise<void> => {
  const isUpdate = note.id != null;
  const res = await fetch(`/competences/note`, {
    ...base,
    method: isUpdate ? 'PUT' : 'POST',
    headers: mutHeaders(),
    body: JSON.stringify({
      ...(isUpdate ? { id: note.id } : {}),
      id_eleve: note.id_eleve,
      id_devoir: note.id_devoir,
      valeur: Number(note.valeur),
    }),
  });
  if (!res.ok) throw new Error(String(res.status));
};

export const api = { getMaitriseLevels, getModalites, getMatieres, getDevoirs, getClassStudents, getDevoirNotes, saveNote };
