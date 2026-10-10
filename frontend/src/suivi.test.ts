import { describe, expect, it } from 'vitest';

import {
  CompetenceEvaluation,
  competenceLevels,
  convert,
  finalMatieres,
  isShown,
  myTeachers,
  nextFinal,
  niveauOf,
} from './suivi';
import type { Classe } from './types';

// Échelle par défaut de scripts/ops/competences/03 : arrondi au niveau le plus proche.
const table = [
  { valmin: 3.5, valmax: 4, ordre: 4, libelle: 'TB' },
  { valmin: 2.5, valmax: 3.5, ordre: 3, libelle: 'S' },
  { valmin: 1.5, valmax: 2.5, ordre: 2, libelle: 'F' },
  { valmin: 1, valmax: 1.5, ordre: 1, libelle: 'I' },
];

const ev = (patch: Partial<CompetenceEvaluation> = {}): CompetenceEvaluation => ({
  id_competence: 7,
  id_domaine: 5,
  id_competences_notes: 1,
  evaluation: 2,
  owner: 'me',
  id_matiere: 'maths',
  id_devoir: 1,
  evaluation_libelle: 'Contrôle',
  evaluation_date: '2026-10-08',
  created: '2026-10-08T10:00:00',
  formative: false,
  niveau_final: null,
  niveau_final_annuel: null,
  eval_lib_historise: false,
  ...patch,
});

const mine = [{ id_enseignant: 'me', id_matiere: 'maths' }];
const max = { average: false, isYear: false };

describe('conversion', () => {
  it('borne haute exclue, sauf pour le dernier niveau', () => {
    expect(convert(1, table)).toBe(1);
    expect(convert(1.5, table)).toBe(2);
    expect(convert(3.49, table)).toBe(3);
    expect(convert(4, table)).toBe(4);
    expect(convert(0.5, table)).toBe(-1);
    expect(convert(3, [])).toBe(-1);
  });
});

describe('niveau d’une liste d’évaluations', () => {
  it('niveau atteint : le meilleur, sans conversion', () => {
    expect(niveauOf([ev({ evaluation: 1 }), ev({ evaluation: 3 })], table, { ...max, onlyNote: true })).toBe(3);
  });

  it('niveau final : meilleur par matière, puis moyenne des matières convertie', () => {
    const evals = [ev({ evaluation: 3 }), ev({ evaluation: 0 }), ev({ id_matiere: 'fr', evaluation: 1 })];
    // maths : 3, français : 1 → moyenne 2 → ordre 3 (2 + 1) → valeur 2
    expect(niveauOf(evals, table, { ...max, onlyNote: false })).toBe(2);
  });

  it('un niveau final posé par l’enseignant prime pour sa matière, l’annuel sur l’année', () => {
    const evals = [ev({ evaluation: 0, niveau_final: 3, niveau_final_annuel: 1 })];
    expect(niveauOf(evals, table, { ...max, onlyNote: false })).toBe(3);
    expect(niveauOf(evals, table, { average: false, isYear: true, onlyNote: false })).toBe(1);
  });

  it('option « moyenne » de l’établissement', () => {
    expect(niveauOf([ev({ evaluation: 3 }), ev({ evaluation: 0 })], table, { average: true, isYear: false, onlyNote: true })).toBe(2);
  });

  it('sans évaluation notée : non évalué', () => {
    expect(niveauOf([ev({ evaluation: -1 })], table, { ...max, onlyNote: false })).toBe(-1);
    expect(niveauOf([], table, { ...max, onlyNote: true })).toBe(-1);
  });
});

describe('niveaux d’une compétence', () => {
  it('les évaluations formatives ne comptent pas', () => {
    expect(competenceLevels([ev({ evaluation: 3, formative: true })], mine, table, max)).toEqual({});
  });

  it('distingue toutes les évaluations et les miennes', () => {
    const levels = competenceLevels([ev({ evaluation: 1 }), ev({ owner: 'other', evaluation: 3 })], mine, table, max);
    // Même matière : sur toutes les évaluations, le meilleur niveau (3) l'emporte.
    expect(levels).toEqual({ all: 3, atteint: 1, final: 1 });
  });

  it('sans évaluation de l’année, la plus récente des années passées, convertie', () => {
    const old = [
      ev({ evaluation: 1, eval_lib_historise: true, created: '2024-01-01T00:00:00' }),
      ev({ evaluation: 3, eval_lib_historise: true, created: '2025-01-01T00:00:00' }),
    ];
    expect(competenceLevels(old, [], table, max).all).toBe(3);
  });
});

describe('mes évaluations', () => {
  const classe: Classe = {
    id: 'c1',
    name: '4A',
    type_groupe: 0,
    services: [
      {
        id_enseignant: 'titulaire',
        id_matiere: 'maths',
        evaluable: true,
        coTeachers: [{ second_teacher_id: 'co', subject_id: 'maths' }],
        substituteTeachers: [{ second_teacher_id: 'me', subject_id: 'maths', start_date: '2026-09-01', entered_end_date: '2026-12-31' }],
      },
      { id_enseignant: 'autre', id_matiere: 'fr', evaluable: true },
    ],
  };

  it('un remplaçant à date revendique les évaluations du titulaire et des co-enseignants', () => {
    expect(myTeachers('me', classe, '2026-10-09')).toEqual([
      { id_enseignant: 'titulaire', id_matiere: 'maths' },
      { id_enseignant: 'co', id_matiere: 'maths' },
      { id_enseignant: 'me', id_matiere: 'maths' },
    ]);
    expect(myTeachers('me', classe, '2027-02-01')).toEqual([]);
  });
});

describe('affichage et niveau final', () => {
  it('compétences évaluées seulement', () => {
    expect(isShown([], false, true, false, mine)).toBe(false);
    expect(isShown([], false, false, false, mine)).toBe(true);
    expect(isShown([ev({ evaluation: -1 })], false, true, false, mine)).toBe(false);
    expect(isShown([ev({ owner: 'other' })], false, true, true, mine)).toBe(false);
    expect(isShown([ev()], false, true, true, mine)).toBe(true);
  });

  it('une compétence masquée n’apparaît que si elle est évaluée', () => {
    expect(isShown([], true, false, false, mine)).toBe(false);
  });

  it('le niveau final fait le tour de l’échelle, sans « non évalué »', () => {
    expect(nextFinal(0, 4)).toBe(1);
    expect(nextFinal(3, 4)).toBe(0);
    expect(nextFinal(undefined, 4)).toBe(0);
  });

  it('matières concernées par le niveau final : les miennes, hors formatives', () => {
    expect(finalMatieres([ev(), ev({ id_matiere: 'fr' }), ev({ owner: 'other', id_matiere: 'svt' }), ev({ formative: true, id_matiere: 'eps' })], [
      ...mine,
      { id_enseignant: 'me', id_matiere: 'fr' },
    ])).toEqual(['maths', 'fr']);
  });
});
