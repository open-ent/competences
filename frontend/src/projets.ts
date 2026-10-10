/**
 * Saisie des projets (`#/projets`) : appréciations des élèves et de la classe sur les EPI,
 * l'accompagnement personnalisé et les parcours, portées depuis `display_epi_ap_parcours.html`
 * et `BilanPeriodique` (syncElements, syncAppreciations, saveAppreciation).
 */

/** Un élément du bilan périodique (`GET /competences/elementsBilanPeriodique`). */
export interface ProjetElement {
  id: number;
  /** 1 = EPI, 2 = accompagnement personnalisé, 3 = parcours. */
  type: 1 | 2 | 3;
  libelle?: string;
  description?: string;
  theme?: { id: number; libelle: string; code: string };
}

export interface ProjetAppreciation {
  id_elt_bilan_periodique: number;
  id_periode: number;
  /** Absent pour l'appréciation de la classe. */
  id_eleve?: string;
  commentaire: string;
}

/** Les trois onglets ; chaque élément tombe dans celui de son type (`filterElements`). */
export type ProjetKind = 'EPI' | 'AP' | 'parcours';
export const KIND_TYPE: Record<ProjetKind, ProjetElement['type']> = { EPI: 1, AP: 2, parcours: 3 };

/** Titre d'un élément : sa thématique pour un parcours, son libellé sinon. */
export const elementTitle = (e: ProjetElement) => (e.type === 3 ? (e.theme?.libelle ?? '') : (e.libelle ?? ''));

/** Longueur maximale d'une appréciation de projet (`MAX_LENGTH_600`). */
export const MAX_PROJET_APPRECIATION = 600;

/** Appréciations rangées par élément : celle de la classe, et celle de chaque élève. */
export function appreciationsByElement(list: ProjetAppreciation[]) {
  const map = new Map<number, { classe: string; eleves: Map<string, string> }>();
  for (const a of list) {
    const entry = map.get(a.id_elt_bilan_periodique) ?? { classe: '', eleves: new Map<string, string>() };
    if (a.id_eleve) entry.eleves.set(a.id_eleve, a.commentaire ?? '');
    else entry.classe = a.commentaire ?? '';
    map.set(a.id_elt_bilan_periodique, entry);
  }
  return map;
}
