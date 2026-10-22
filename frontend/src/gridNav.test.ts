import { describe, expect, it } from 'vitest';

import { navTarget } from './gridNav';

const btn = { text: false, atStart: true, atEnd: true };
const text = (atStart: boolean, atEnd: boolean) => ({ text: true, atStart, atEnd });

describe('navigation au clavier de la grille', () => {
  // 3 lignes : 3 cases, 3 cases, 1 case (ligne d'élève sans niveaux).
  const rows = [3, 3, 1];
  it('droite et gauche changent de case, puis de ligne aux bords', () => {
    expect(navTarget(rows, 0, 0, 'right', btn)).toEqual({ row: 0, col: 1 });
    expect(navTarget(rows, 0, 2, 'right', btn)).toEqual({ row: 1, col: 0 });
    expect(navTarget(rows, 1, 0, 'left', btn)).toEqual({ row: 0, col: 2 });
    expect(navTarget(rows, 0, 0, 'left', btn)).toBeNull();
    expect(navTarget(rows, 2, 0, 'right', btn)).toBeNull();
  });
  it('dans un texte, on ne quitte la case qu’aux extrémités du texte', () => {
    expect(navTarget(rows, 0, 1, 'right', text(false, false))).toBeNull();
    expect(navTarget(rows, 0, 1, 'right', text(false, true))).toEqual({ row: 0, col: 2 });
    expect(navTarget(rows, 0, 1, 'left', text(false, true))).toBeNull();
    expect(navTarget(rows, 0, 1, 'left', text(true, false))).toEqual({ row: 0, col: 0 });
  });
  it('entrée et flèches verticales gardent la colonne, sinon la première case', () => {
    expect(navTarget(rows, 0, 2, 'down', btn)).toEqual({ row: 1, col: 2 });
    expect(navTarget(rows, 1, 1, 'enter', btn)).toEqual({ row: 2, col: 0 });
    expect(navTarget(rows, 1, 1, 'up', btn)).toEqual({ row: 0, col: 1 });
    expect(navTarget(rows, 2, 0, 'down', btn)).toBeNull();
  });
  it('un chiffre de niveau avance à la case suivante', () => {
    expect(navTarget(rows, 1, 0, 'digit', btn)).toEqual({ row: 1, col: 1 });
    expect(navTarget(rows, 1, 2, 'digit', btn)).toEqual({ row: 2, col: 0 });
  });
  it('les lignes sans case sont sautées', () => {
    expect(navTarget([2, 0, 2], 0, 1, 'down', btn)).toEqual({ row: 2, col: 1 });
    expect(navTarget([2, 0, 2], 2, 0, 'up', btn)).toEqual({ row: 0, col: 0 });
  });
});
