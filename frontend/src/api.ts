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

export const api = { getMaitriseLevels, getModalites, getMatieres };
