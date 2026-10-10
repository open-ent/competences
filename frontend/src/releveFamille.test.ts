import { describe, expect, it } from 'vitest';

import type { FamilyDevoir } from './family';
import { moyenne, moyenneClasse, releveLignes, sousMatiereMoyennes, sumAndCoeff } from './releveFamille';

let seq = 0;
const d = (extra: Partial<FamilyDevoir>): FamilyDevoir => ({
  id: ++seq,
  name: `Devoir ${seq}`,
  owner: 't1',
  date: '2026-10-01',
  id_matiere: 'm1',
  id_periode: 1,
  is_evaluated: true,
  coefficient: '1',
  diviseur: 20,
  ramener_sur: false,
  competences: [],
  ...extra,
});

describe('moyenne d’une matière', () => {
  it('pondère par coefficient, sur 20, et arrondit au dixième', () => {
    expect(moyenne([d({ note: '12' }), d({ note: '15', coefficient: '2' })])).toBe(14);
  });

  it('une note sur 10 non ramenée pèse moitié ; ramenée sur 20, elle pèse son coefficient', () => {
    // (8 + 16) / (0,5 + 1) = 16
    expect(moyenne([d({ note: '8', diviseur: 10 }), d({ note: '16' })])).toBe(16);
    // (16 + 16) / 2 = 16 : la note sur 10 est ramenée à 16/20
    expect(moyenne([d({ note: '8', diviseur: 10, ramener_sur: true }), d({ note: '16' })])).toBe(16);
  });

  it('les évaluations formatives et les devoirs sans note ne comptent pas', () => {
    expect(moyenne([d({ note: '5', formative: true }), d({ note: '15' }), d({})])).toBe(15);
    expect(moyenne([d({ annotation: { id: 1, libelle: 'Absent', libelle_court: 'ABS' } })])).toBe('NN');
    expect(sumAndCoeff([])).toBeNull();
  });

  it('moyenne de la classe au devoir', () => {
    expect(moyenneClasse({ sum_notes: '29', nbr_eleves: 2 })).toBe(14.5);
    expect(moyenneClasse({ sum_notes: null, nbr_eleves: null })).toBe('NN');
  });
});

describe('sous-matières', () => {
  const sous = [
    { id_type_sousmatiere: 1, libelle: 'Écrit' },
    { id_type_sousmatiere: 2, libelle: 'Oral' },
    { id_type_sousmatiere: 3, libelle: 'Compréhension' },
  ];

  it('moyenne par sous-matière, puis moyenne pondérée par les coefficients de l’enseignant', () => {
    const devoirs = [d({ note: '10', id_sousmatiere: 1 }), d({ note: '16', id_sousmatiere: 2 })];
    const subTopics = [{ id_teacher: 't1', id_group: 'c', id_topic: 'm1', id_subtopic: 2, coefficient: 3 }];
    const r = sousMatiereMoyennes('m1', sous, devoirs, subTopics, [], 'c');
    expect(r.lignes.map((l) => l.moyenne)).toEqual([10, 16, '']);
    // (10 × 1 + 16 × 3) / 4 = 14,5
    expect(r.moyenne).toBe(14.5);
  });

  it('un co-enseignant reprend le coefficient fixé par le titulaire', () => {
    const devoirs = [d({ note: '10', id_sousmatiere: 1, owner: 'co' }), d({ note: '20', id_sousmatiere: 2 })];
    const subTopics = [{ id_teacher: 't1', id_group: 'c', id_topic: 'm1', id_subtopic: 1, coefficient: 3 }];
    const services = [
      { id_enseignant: 't1', id_matiere: 'm1', evaluable: true, coTeachers: [{ second_teacher_id: 'co', subject_id: 'm1', group_id: 'c', main_teacher_id: 't1' }] },
    ];
    // (10 × 3 + 20 × 1) / 4 = 12,5
    expect(sousMatiereMoyennes('m1', sous, devoirs, subTopics, services, 'c').moyenne).toBe(12.5);
  });
});

describe('lignes du relevé', () => {
  const matieres = [
    { id: 'm2', name: 'Histoire' },
    { id: 'm1', name: 'Anglais' },
    { id: 'm3', name: 'Musique' },
  ];

  it('matières notées, triées, avec la moyenne posée par l’enseignant en priorité', () => {
    const lignes = releveLignes({
      devoirs: [d({ note: '12' }), d({ id_matiere: 'm2', note: '18' }), d({ id_matiere: 'm3', annotation: { id: 1, libelle: 'Absent', libelle_court: 'ABS' } })],
      matieres,
      finales: [{ id_matiere: 'm2', moyenne: '17' }],
      subTopics: [],
      services: [],
      classeId: 'c',
      enseignantsOf: () => [],
    });
    expect(lignes.map((l) => [l.name, l.moyenne])).toEqual([
      ['Anglais', 12],
      ['Histoire', '17'],
    ]);
  });

  it('une moyenne effacée par l’enseignant s’affiche « NN »', () => {
    const lignes = releveLignes({
      devoirs: [d({ note: '12' })],
      matieres,
      finales: [{ id_matiere: 'm1', moyenne: null }],
      subTopics: [],
      services: [],
      classeId: 'c',
      enseignantsOf: () => [],
    });
    expect(lignes[0].moyenne).toBe('NN');
  });
});
