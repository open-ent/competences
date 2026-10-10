import { describe, expect, it } from 'vitest';

import {
  formatMoyenne,
  isNoteLocked,
  isReleveLocked,
  moyenneFinale,
  noteOf,
  parseMoyenneFinale,
  sousMatiereMoyenne,
  yearRow,
} from './releve';
import { noteWrite } from './saisie';
import type { PeriodeClasse } from './types';

const periode: PeriodeClasse = {
  id: 28,
  id_type: 1,
  type: 2,
  ordre: 1,
  timestamp_dt: '2026-08-31T00:00:00.000',
  timestamp_fn: '2026-12-31T00:00:00.000',
  date_fin_saisie: '2026-12-30T00:00:00.000',
};

describe('moyennes', () => {
  it('affiche à la française, « NN » à défaut', () => {
    expect(formatMoyenne(16.25)).toBe('16,25');
    expect(formatMoyenne('16,3')).toBe('16,3');
    expect(formatMoyenne(null)).toBe('NN');
    expect(formatMoyenne(undefined)).toBe('NN');
  });

  it('moyenne finale : saisie si elle existe, « NN » posé à la main, sinon la calculée', () => {
    expect(moyenneFinale({ moyenne: 17 })).toEqual({ value: '17', isSet: false });
    expect(moyenneFinale({ moyenne: 17, moyenneFinale: '16.5' })).toEqual({ value: '16,5', isSet: true });
    expect(moyenneFinale({ moyenne: 17, moyenneFinale: null })).toEqual({ value: 'NN', isSet: true });
    expect(moyenneFinale({ moyenne: null, moyenneFinale: null })).toEqual({ value: 'NN', isSet: false });
  });

  it('saisie d’une moyenne finale', () => {
    expect(parseMoyenneFinale('15,5', 17)).toEqual({ kind: 'set', moyenne: 15.5 });
    expect(parseMoyenneFinale('nn', 17)).toEqual({ kind: 'nn' });
    expect(parseMoyenneFinale('', 17)).toEqual({ kind: 'reset' });
    expect(parseMoyenneFinale('17', 17)).toEqual({ kind: 'reset' });
    expect(parseMoyenneFinale('21', 17)).toEqual({ kind: 'invalid' });
    expect(parseMoyenneFinale('12.345', 17)).toEqual({ kind: 'invalid' });
  });

  it('moyenne d’une sous-matière', () => {
    const eleve = { _moyenne: { m: { null: { moyenne: 14 }, '2': { moyenne: 12.5 } } } };
    expect(sousMatiereMoyenne(eleve, 'm', 2)).toBe('12,5');
    expect(sousMatiereMoyenne(eleve, 'm', 3)).toBe('NN');
  });
});

describe('verrous', () => {
  it('le relevé se ferme le lendemain de la fin de saisie, sauf direction et professeur principal', () => {
    expect(isReleveLocked(periode, '2026-12-30', false)).toBe(false);
    expect(isReleveLocked(periode, '2026-12-31', false)).toBe(true);
    expect(isReleveLocked(periode, '2026-12-31', true)).toBe(false);
  });

  it('l’année n’est jamais saisissable', () => {
    expect(isReleveLocked({ ...periode, id: null }, '2026-10-01', true)).toBe(true);
    expect(isReleveLocked(undefined, '2026-10-01', true)).toBe(true);
  });

  it('une note suit la période de SON évaluation', () => {
    expect(isNoteLocked(periode, '2026-12-31', false)).toBe(true);
    expect(isNoteLocked(undefined, '2030-01-01', false)).toBe(false);
  });
});

describe('notes du relevé', () => {
  const notes = [
    { id_devoir: 1, id_eleve: 'a', id: 9, valeur: '17', annotation: null },
    { id_devoir: 1, id_eleve: 'b', id: null, valeur: null, annotation: 1 },
  ];

  it('retrouve la note ou l’annotation d’un élève', () => {
    expect(noteOf(notes, 'a', 1)).toEqual({ id: 9, id_annotation: null, valeur: '17' });
    expect(noteOf(notes, 'b', 1)?.id_annotation).toBe(1);
    expect(noteOf(notes, 'c', 1)).toBeUndefined();
  });

  it('écritures : effacer, remplacer une annotation, poser une annotation', () => {
    const abs = { id: 1, libelle: 'Absent', libelle_court: 'ABS' };
    expect(noteWrite({ kind: 'empty' }, { id: 9, id_annotation: null })).toEqual({ kind: 'deleteNote', noteId: 9 });
    expect(noteWrite({ kind: 'empty' }, { id: null, id_annotation: 1 })).toEqual({ kind: 'deleteAnnotation' });
    expect(noteWrite({ kind: 'empty' }, undefined)).toEqual({ kind: 'nothing' });
    expect(noteWrite({ kind: 'note', valeur: 12 }, { id: null, id_annotation: 1 })).toEqual({
      kind: 'note',
      valeur: 12,
      replacesAnnotation: true,
    });
    expect(noteWrite({ kind: 'annotation', annotation: abs }, { id: null, id_annotation: 1 })).toEqual({ kind: 'nothing' });
    expect(noteWrite({ kind: 'annotation', annotation: abs }, { id: 9, id_annotation: null })).toEqual({ kind: 'annotation', annotationId: 1 });
  });
});

describe('vue « Année »', () => {
  const moyennes = [
    { id_eleve: 'a', id_periode: null, moyenne: 15 },
    { id_eleve: 'a', id_periode: 1, moyenne: 14 },
    { id_eleve: 'a', id_periode: 2, moyenne: 16 },
    { id_eleve: 'b', id_periode: null, moyenne: 12 },
    { id_eleve: 'b', id_periode: 1, moyenne: 12 },
  ];

  it('sans moyenne finale, le serveur fait foi pour l’année', () => {
    const { byPeriode } = yearRow('b', moyennes, []);
    expect(byPeriode.get(1)).toEqual({ value: '12', isSet: false });
    expect(byPeriode.get(null)).toEqual({ value: '12', isSet: false });
  });

  it('une moyenne finale remplace celle de sa période et fait recalculer l’année', () => {
    const { byPeriode } = yearRow('a', moyennes, [{ id_eleve: 'a', id_periode: 1, moyenne: '18' }]);
    expect(byPeriode.get(1)).toEqual({ value: '18', isSet: true });
    expect(byPeriode.get(2)).toEqual({ value: '16', isSet: false });
    expect(byPeriode.get(null)).toEqual({ value: '17', isSet: true });
  });
});
