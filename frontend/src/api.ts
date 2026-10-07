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

// ── Arbre de compétences (référentiel par domaines) ──────────────────────────────
/** Une classe/groupe de la structure (pour le sélecteur du référentiel). */
export interface Classe {
  id: string;
  name: string;
}

/** Un domaine du référentiel (arbre récursif : chaque domaine porte ses sous-domaines). */
export interface DomaineNode {
  id: number;
  libelle: string;
  codification?: string;
  evaluated?: boolean;
  niveau?: number;
  domaines?: DomaineNode[];
}

/** Classes de la structure (via viescolaire), triées par nom. */
export const getClasses = async (structureId: string): Promise<Classe[]> =>
  json<Array<{ id: string; name: string }>>(await fetch(`/viescolaire/classes?idEtablissement=${structureId}`, base))
    .then((arr) => (arr ?? []).map((c) => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })))
    .catch(() => []);

/** Arbre des domaines de compétences pour une classe (GET /competences/domaines). */
export const getArbreDomaines = async (structureId: string, classId: string): Promise<DomaineNode[]> =>
  json<DomaineNode[]>(await fetch(`/competences/domaines?idStructure=${structureId}&idClasse=${classId}`, base)).catch(() => []);

// ── Relevé de notes (par classe / matière / période) ─────────────────────────────
/** Une période (trimestre/semestre) de la structure. */
export interface Periode {
  id: number;
  type: number;
  ordre?: number;
  libelle?: string;
}

/** Un élève dans le relevé, avec ses moyennes. */
export interface ReleveEleve {
  id: string;
  displayName: string;
  moyenne?: string;
  moyenneFinale?: string;
  classeName?: string;
}

/** Relevé d'une classe/matière/période. */
export interface Releve {
  eleves: ReleveEleve[];
  appreciationClasse: string;
}

/** Périodes de la structure (via viescolaire). */
export const getPeriodes = async (structureId: string): Promise<Periode[]> =>
  json<Array<{ id: number; type: number; ordre?: number }>>(await fetch(`/viescolaire/periodes?idEtablissement=${structureId}`, base))
    .then((arr) => (arr ?? []).map((p) => ({ id: p.id, type: p.type, ordre: p.ordre })))
    .catch(() => []);

/**
 * Relevé de notes (GET /competences/releve). Renvoie null si l'accès est refusé (401 :
 * l'utilisateur n'enseigne pas la matière et n'est pas administrateur).
 */
export const getReleve = async (structureId: string, classId: string, matiereId: string, periodeId: number): Promise<Releve | null> => {
  const url = `/competences/releve?idClasse=${classId}&idMatiere=${matiereId}&idEtablissement=${structureId}&idPeriode=${periodeId}&typeClasse=0`;
  const res = await fetch(url, base);
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(String(res.status));
  const data = (await res.json()) as { eleves?: ReleveEleve[]; appreciation_classe?: { appreciation?: string } };
  return {
    eleves: (data.eleves ?? []).map((e) => ({ id: e.id, displayName: e.displayName, moyenne: e.moyenne, moyenneFinale: e.moyenneFinale, classeName: e.classeName })),
    appreciationClasse: (data.appreciation_classe?.appreciation ?? '').trim(),
  };
};

export const api = {
  getMaitriseLevels, getModalites, getMatieres, getDevoirs, getClassStudents, getDevoirNotes, saveNote,
  getClasses, getArbreDomaines,
  getPeriodes, getReleve,
};
