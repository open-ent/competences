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
