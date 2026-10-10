import { describe, expect, it } from 'vitest';

import { currentPeriode, filterDevoirs, matieresOf, mergeDevoirs, resultOf, selfChild, StudentAnnotation, StudentCompetence, StudentDevoir } from './family';
import type { PeriodeClasse } from './types';

const base = { owner: 't1', date: '2026-10-09 00:00:00+0200', id_matiere: 'm1', id_periode: 1, name: 'Contrôle' };
const devoir = (id: number, extra: Partial<StudentDevoir> = {}): StudentDevoir => ({ id, ...base, ...extra });
const competence = (id_devoir: number, id_competence: number, evaluation: number): StudentCompetence => ({
  ...base,
  id_devoir,
  id_competence,
  id_domaine: 5,
  id_competences_notes: id_devoir * 100 + id_competence,
  evaluation,
  owner_name: 'Martin Amélie',
});
const annotation = (id_devoir: number, extra: Partial<StudentAnnotation> = {}): StudentAnnotation => ({
  ...base,
  id_devoir,
  id: 1,
  libelle: 'Absent',
  libelle_court: 'ABS',
  lib: 'Description',
  ...extra,
});

describe('devoirs de l’élève', () => {
  it('rattache compétences et annotation aux devoirs notés, et ajoute les devoirs sans note', () => {
    const merged = mergeDevoirs([devoir(6, { note: '14' })], [competence(6, 7, 2), competence(8, 3, 1)], [annotation(1)]);
    expect(merged.map((d) => d.id)).toEqual([6, 8, 1]);
    expect(merged[0].competences).toHaveLength(1);
    expect(merged[1]).toMatchObject({ id: 8, teacher: 'Martin Amélie', competences: [{ id_competence: 3 }] });
    expect(merged[2]).toMatchObject({ id: 1, libelle: 'Description', annotation: { libelle_court: 'ABS' }, competences: [] });
  });

  it('une annotation sur un devoir noté le marque sans le dupliquer', () => {
    const merged = mergeDevoirs([devoir(1, { note: '12' })], [], [annotation(1)]);
    expect(merged).toHaveLength(1);
    expect(resultOf(merged[0])).toBe('ABS');
  });

  it('résultat : note sur diviseur, à la française, sinon rien', () => {
    expect(resultOf({ note: '14.5', diviseur: 20 })).toBe('14,5 / 20');
    expect(resultOf({ diviseur: 20 })).toBe('');
  });

  it('filtre par période, matière, enseignant et nom sans casse', () => {
    const all = mergeDevoirs(
      [devoir(1), devoir(2, { id_periode: 2 }), devoir(3, { id_matiere: 'm2', name: 'Dictée' }), devoir(4, { owner: 't2' })],
      [],
      [],
    );
    expect(filterDevoirs(all, { periode: 1, matiere: null }).map((d) => d.id)).toEqual([1, 3, 4]);
    expect(filterDevoirs(all, { periode: null, matiere: 'm2' }).map((d) => d.id)).toEqual([3]);
    expect(filterDevoirs(all, { periode: null, matiere: null, enseignant: 't2' }).map((d) => d.id)).toEqual([4]);
    expect(filterDevoirs(all, { periode: null, matiere: null, name: 'dict' }).map((d) => d.id)).toEqual([3]);
  });

  it('matières des devoirs, nommées et triées', () => {
    const all = mergeDevoirs([devoir(1, { id_matiere: 'b' }), devoir(2, { id_matiere: 'a' }), devoir(3, { id_matiere: 'b' })], [], []);
    expect(matieresOf(all, new Map([['a', 'Anglais'], ['b', 'Histoire']]))).toEqual([
      { id: 'a', name: 'Anglais' },
      { id: 'b', name: 'Histoire' },
    ]);
  });
});

describe('période et enfant', () => {
  const periodes: PeriodeClasse[] = [
    { id: 28, id_type: 1, type: 2, ordre: 1, timestamp_dt: '2026-08-31T00:00:00', timestamp_fn: '2026-12-31T00:00:00', date_fin_saisie: null },
    { id: 52, id_type: 2, type: 2, ordre: 2, timestamp_dt: '2027-01-01T00:00:00', timestamp_fn: '2027-07-02T00:00:00', date_fin_saisie: null },
  ];

  it('la période qui contient le jour, sinon l’année', () => {
    expect(currentPeriode(periodes, '2026-10-10')).toBe(1);
    expect(currentPeriode(periodes, '2027-01-01')).toBe(2);
    expect(currentPeriode(periodes, '2027-08-15')).toBeNull();
  });

  it('l’élève connecté devient son propre « enfant », première classe et premier établissement', () => {
    expect(selfChild({ userId: 'u', firstName: 'Léa', lastName: 'Bernard', classes: ['c1', 'c2'], structures: ['s1'] })).toMatchObject({
      id: 'u',
      idClasse: 'c1',
      idStructure: 's1',
    });
    expect(selfChild({ userId: 'u', firstName: 'Léa', lastName: 'Bernard', classes: [], structures: ['s1'] })).toBeNull();
  });
});
