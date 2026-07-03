/** Fonctions pures du module Compétences, testables. */

import type { MaitriseLevel } from './api';

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
