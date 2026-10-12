/**
 * Bilan de fin de cycle (`content_vue_bilan_fin_cycle.html`), porté depuis
 * `Utils.getMaxEvaluationsDomaines`, `Utils.setSliderOptions`, `hasValueInConversionTable` et
 * `SuiviCompetence` : une ligne par composante du socle, son niveau calculé sur le cycle, et le
 * niveau que la direction peut fixer à la place.
 */

import type { DomaineSuivi } from './api';
import { CompetenceEvaluation, competenceLevels, Conversion, convert } from './suivi';

/** Niveau fixé par la direction pour un domaine (`GET /competences/bfc/eleve/:id`). */
export interface BfcValeur {
  id: number;
  id_domaine: number;
  id_eleve: string;
  id_etablissement: string;
  owner: string;
  /** Ordre du niveau de la table de conversion (1 à 4). */
  valeur: number;
}

export interface BfcLigne {
  domaine: DomaineSuivi & { dispense_eleve?: boolean | null };
  /** Moyenne des niveaux (1 à 4) des compétences du domaine et de ses sous-domaines ; −1 sans évaluation. */
  moyenne: number;
  /** Niveau issu de la moyenne, en ordre de la table de conversion ; −1 sans évaluation. */
  calcule: number;
  /** Niveau fixé par la direction, s'il existe. */
  fixe: BfcValeur | undefined;
  /** Niveau retenu : celui fixé, sinon le calculé. */
  retenu: number;
}

type Domaine = DomaineSuivi & { dispense_eleve?: boolean | null };

/** Niveaux (1 à 4) des compétences évaluées d'un domaine et de tous ses sous-domaines. */
function niveauxDuDomaine(
  domaine: Domaine,
  evaluations: CompetenceEvaluation[],
  table: Conversion[],
  average: boolean,
): number[] {
  const own = (domaine.competences ?? []).map((c) => {
    const evals = evaluations.filter((e) => e.id_competence === c.id && e.id_domaine === c.id_domaine);
    const all = competenceLevels(evals, [], table, { average, isYear: false }).all;
    return all === undefined ? 0 : all + 1;
  });
  return [...own, ...(domaine.domaines ?? []).flatMap((d) => niveauxDuDomaine(d, evaluations, table, average))].filter((v) => v > 0);
}

/**
 * Les composantes du bilan : les domaines évalués dont le parent ne l'est pas (D1.1 à D1.4, D2,
 * D3…). Leur moyenne porte sur leurs compétences et celles de leurs sous-domaines.
 */
export function bfcLignes(p: {
  domaines: Domaine[];
  evaluations: CompetenceEvaluation[];
  table: Conversion[];
  average: boolean;
  fixes: BfcValeur[];
}): BfcLigne[] {
  const lignes: BfcLigne[] = [];
  const walk = (d: Domaine, parentEvaluated: boolean) => {
    if (d.evaluated && !parentEvaluated) {
      const niveaux = niveauxDuDomaine(d, p.evaluations, p.table, p.average);
      const moyenne = niveaux.length > 0 ? niveaux.reduce((a, b) => a + b, 0) / niveaux.length : -1;
      const calcule = moyenne === -1 ? -1 : convert(moyenne, p.table);
      const fixe = p.fixes.find((f) => f.id_domaine === d.id);
      lignes.push({ domaine: d, moyenne, calcule, fixe, retenu: fixe ? fixe.valeur : calcule });
    }
    for (const child of d.domaines ?? []) walk(child, !!d.evaluated);
  };
  for (const d of p.domaines) walk(d, false);
  return lignes;
}

/**
 * Enregistrer un niveau : choisir le niveau calculé retire le niveau fixé (`myChangeSliderListener`),
 * tout autre niveau crée ou met à jour le niveau fixé.
 */
export function bfcAction(ligne: BfcLigne, niveau: number): { kind: 'delete' } | { kind: 'save'; valeur: number } | { kind: 'none' } {
  if (niveau === ligne.calcule) return ligne.fixe ? { kind: 'delete' } : { kind: 'none' };
  if (ligne.fixe?.valeur === niveau) return { kind: 'none' };
  return { kind: 'save', valeur: niveau };
}

/** Visibilité d'une information du bilan (`bfc/visibility`) : 1 = direction seulement, 2 = tous. */
export const isVisible = (visible: number | undefined, chefOrHeadTeacher: boolean) => visible === 2 || (visible === 1 && chefOrHeadTeacher);

// ── Enseignement de complément (`left_side_ens_cplt.html`) ──────────────────

export interface EnsCpl {
  id: number;
  libelle: string;
  code: string;
}
export interface NiveauEnsCpl {
  id: number;
  libelle: string;
  /** 0 = aucun, 1 = objectif atteint, 2 = objectif dépassé. */
  niveau: number;
  bareme_brevet: number;
}
/** Choix de l'élève (`GET /competences/GetNiveauEnsCpl`). */
export interface EleveEnsCpl {
  id?: number;
  id_enscpl?: number;
  id_niveau?: number;
  id_langue?: number | null;
  niveau_lcr?: number | null;
}

/** Niveaux d'une langue et culture régionale (en dur dans l'AngularJS : `NiveauLangueCultRegs`). */
export const NIVEAUX_LCR = [
  { niveau: 1, libelle: 'Objectif atteint' },
  { niveau: 2, libelle: 'Objectif dépassé' },
];

/**
 * `onChangeEns` : « Aucun » remet le niveau à « aucun » ; un autre enseignement part du premier
 * niveau, et la langue régionale (LCR) de la première langue de la liste (« Aucun »).
 */
export function choisirEnseignement(ens: EnsCpl, niveaux: NiveauEnsCpl[], langues: EnsCpl[]): EleveEnsCpl {
  if (ens.code === 'AUC') return { id_enscpl: ens.id, id_niveau: niveaux.find((n) => n.niveau === 0)?.id, id_langue: null, niveau_lcr: 0 };
  return {
    id_enscpl: ens.id,
    id_niveau: niveaux.find((n) => n.niveau === 1)?.id,
    id_langue: ens.code === 'LCR' ? (langues[0]?.id ?? null) : null,
    niveau_lcr: 0,
  };
}

/** `oncChangeLangue` : « Aucun » efface le niveau de langue, une langue part du premier niveau. */
export const choisirLangue = (current: EleveEnsCpl, langue: EnsCpl): EleveEnsCpl => ({
  ...current,
  id_langue: langue.id,
  niveau_lcr: langue.code === 'AUC' ? 0 : 1,
});
