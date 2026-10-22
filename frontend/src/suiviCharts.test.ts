import { describe, expect, it } from 'vitest';

import { evolutionPoints, proportions } from './suivi';

const ev = (id: number, evaluation: number, patch: Record<string, unknown> = {}) => ({ id_competences_notes: id, evaluation, id_devoir: id, id_competence: 1, ...patch });

describe('proportions de niveaux', () => {
  it('rien sans évaluation', () => {
    expect(proportions([])).toEqual([]);
  });
  it('part de chaque niveau, triée, parts vides omises', () => {
    const r = proportions([ev(1, 3), ev(2, 3), ev(3, 1), ev(4, -1)]);
    expect(r.map((s) => [s.value, s.count, Math.round(s.percent)])).toEqual([[-1, 1, 25], [1, 1, 25], [3, 2, 50]]);
  });
  it('une même note rencontrée deux fois ne compte qu’une fois', () => {
    const r = proportions([ev(1, 2), ev(1, 2), ev(2, 0)]);
    expect(r.map((s) => [s.value, Math.round(s.percent)])).toEqual([[0, 50], [2, 50]]);
  });
  it('compte une fois un même couple devoir/compétence', () => {
    const r = proportions([ev(1, 2, { id_devoir: 9 }), ev(2, 2, { id_devoir: 9 })]);
    expect(r[0]).toMatchObject({ value: 2, count: 1, percent: 100 });
  });
});

describe('points du graphique d’évolution', () => {
  it('écarte les non évalués et trie par date', () => {
    const r = evolutionPoints([
      { evaluation: 2, evaluation_date: '2026-03-01', evaluation_libelle: 'B', formative: false },
      { evaluation: -1, evaluation_date: '2026-01-01', evaluation_libelle: 'X', formative: false },
      { evaluation: 1, evaluation_date: '2026-02-01', evaluation_libelle: 'A', formative: true },
    ]);
    expect(r.map((p) => p.label)).toEqual(['A', 'B']);
    expect(r[0].formative).toBe(true);
  });
});
