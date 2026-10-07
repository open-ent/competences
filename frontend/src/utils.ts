/** Fonctions pures du module Compétences, testables. */

import type { DomaineNode, MaitriseLevel } from './api';

/** Nombre total de domaines dans l'arbre (nœud + descendants), récursif. */
export function countDomaines(nodes: DomaineNode[]): number {
  return (nodes ?? []).reduce((acc, n) => acc + 1 + countDomaines(n.domaines ?? []), 0);
}

/** Comparateur par `rank` numérique croissant (fallback 0). */
export function byRank<T extends { rank?: number }>(a: T, b: T): number {
  return (a.rank ?? 0) - (b.rank ?? 0);
}

/** Comparateur alphabétique FR insensible casse/accents. */
export function byName<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
}

/** Libellé affiché d'un niveau de maîtrise (perso sinon défaut sinon lettre). */
export function levelLabel(l: MaitriseLevel): string {
  return l.libelle || l.default_lib || l.lettre || `Niveau ${l.ordre ?? '?'}`;
}

/** Couleur d'un niveau (perso sinon défaut), normalisée en `#rrggbb`. '' si aucune. */
export function levelColor(l: MaitriseLevel): string {
  const c = l.couleur || l.default || '';
  if (!c) return '';
  return c.startsWith('#') ? c : `#${c}`;
}

/** Tri des niveaux de maîtrise par `ordre` croissant. */
export function sortLevels(levels: MaitriseLevel[]): MaitriseLevel[] {
  return [...levels].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
}

/**
 * Valide une note saisie : nombre fini, comprise entre 0 et `diviseur` (barème).
 * Sert de garde avant l'enregistrement d'une note d'élève.
 */
export function noteIsValid(value: string, diviseur: number): boolean {
  if (value == null || value.trim() === '') return false;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= diviseur;
}
