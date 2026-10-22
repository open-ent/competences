import type { KeyboardEvent } from 'react';

/**
 * Navigation au clavier dans une grille de saisie (`c-navigable-competences` / `c-naviga-table`) : les flèches, Entrée et
 * les chiffres de niveau déplacent le focus de case en case, comme dans un tableur. Les lignes sans case sont sautées.
 */
export type NavKey = 'left' | 'right' | 'up' | 'down' | 'enter' | 'digit';

export interface NavContext {
  /** La case est un champ de texte : gauche/droite ne déplacent qu'aux extrémités du texte. */
  text: boolean;
  atStart: boolean;
  atEnd: boolean;
}

export interface NavPosition {
  row: number;
  col: number;
}

/** Case visée depuis (row, col) — `null` pour laisser le clavier faire son travail (curseur dans le texte, bord de grille). */
export function navTarget(rows: number[], row: number, col: number, key: NavKey, ctx: NavContext): NavPosition | null {
  const step = (from: number, dir: 1 | -1) => {
    for (let r = from + dir; r >= 0 && r < rows.length; r += dir) if (rows[r] > 0) return r;
    return -1;
  };
  switch (key) {
    case 'left': {
      if (ctx.text && !ctx.atStart) return null;
      if (col > 0) return { row, col: col - 1 };
      const r = step(row, -1);
      return r < 0 ? null : { row: r, col: rows[r] - 1 };
    }
    case 'right':
    case 'digit': {
      if (key === 'right' && ctx.text && !ctx.atEnd) return null;
      if (col + 1 < rows[row]) return { row, col: col + 1 };
      const r = step(row, 1);
      return r < 0 ? null : { row: r, col: 0 };
    }
    case 'up':
    case 'down':
    case 'enter': {
      const r = step(row, key === 'up' ? -1 : 1);
      if (r < 0) return null;
      // Une ligne qui n'a pas le même nombre de cases : on se place sur la première.
      return { row: r, col: rows[r] === rows[row] ? col : 0 };
    }
  }
}

const KEYS: Record<string, NavKey> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Enter: 'enter' };

/**
 * Gestionnaire à poser sur le conteneur de la grille : les lignes portent `data-nav-row`, les champs ou boutons
 * `data-nav-cell`. Les chiffres 0 à 4 (niveau de compétence, déjà appliqué par le bouton) avancent à la case suivante.
 */
export function gridKeyDown(e: KeyboardEvent<HTMLElement>): void {
  const cell = e.target as HTMLElement;
  if (!cell.matches?.('[data-nav-cell]') || e.altKey || e.ctrlKey || e.metaKey) return;
  const isButton = cell.tagName === 'BUTTON';
  const isTextarea = cell.tagName === 'TEXTAREA';
  let key: NavKey | undefined = KEYS[e.key];
  if (!key && isButton && /^[0-4]$/.test(e.key)) key = 'digit';
  if (!key) return;
  // Dans une zone de texte multiligne, Entrée et les flèches verticales restent à la saisie.
  if (isTextarea && (key === 'enter' || key === 'up' || key === 'down')) return;
  const rows = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-nav-row]')).map((tr) => Array.from(tr.querySelectorAll<HTMLElement>('[data-nav-cell]')));
  const row = rows.findIndex((cells) => cells.includes(cell));
  if (row < 0) return;
  const input = cell as HTMLInputElement;
  const to = navTarget(
    rows.map((cells) => cells.length),
    row,
    rows[row].indexOf(cell),
    key,
    { text: !isButton, atStart: input.selectionStart === 0, atEnd: input.selectionStart === input.value?.length },
  );
  // Entrée sur un bouton le « cliquerait » : on la prend toujours, même au bord de la grille.
  if (!to) {
    if (key === 'enter' && isButton) e.preventDefault();
    return;
  }
  e.preventDefault();
  const next = rows[to.row][to.col];
  next.focus();
  if (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement) next.select();
}
