import { describe, expect, it } from 'vitest';

import { acquisRow, AcquisRaw, isEmptyRow, moyenneGenerale } from './conseil';

const table = [
  { valmin: 3.5, valmax: 4, ordre: 4, libelle: 'TB' },
  { valmin: 2.5, valmax: 3.5, ordre: 3, libelle: 'S' },
  { valmin: 1.5, valmax: 2.5, ordre: 2, libelle: 'F' },
  { valmin: 1, valmax: 1.5, ordre: 1, libelle: 'I' },
];

const raw = (patch: Partial<AcquisRaw> = {}): AcquisRaw => ({
  id_matiere: 'maths',
  libelleMatiere: 'Mathématiques',
  idClasse: 'c1',
  teachers: [{ firstName: 'Amélie', name: 'Martin', id: 't' }],
  appreciations: [{ id_periode: 1, appreciationByClasse: [{ idClasse: 'c1', appreciation: 'Bon trimestre' }] }],
  moyennesFinales: [{ id_periode: 1, moyenneFinale: 16.5 }],
  moyennes: [{ id: 1, moyenne: 17 }, { id: null, moyenne: 17 }],
  moyennesClasse: [{ id: 1, moyenne: 14.3 }],
  positionnements_auto: [{ id_periode: 1, moyenne: 3 }],
  positionnementsFinaux: [],
  ...patch,
});

describe('suivi des acquis', () => {
  it('extrait la période choisie : moyenne finale d’abord, positionnement converti', () => {
    expect(acquisRow(raw(), 1, table)).toMatchObject({
      teachers: ['A. Martin'],
      appreciation: 'Bon trimestre',
      moyenneEleve: 16.5,
      moyenneClasse: 14.3,
      positionnementAuto: 3,
      positionnement: 3,
    });
  });

  it('sans moyenne finale, la calculée ; sans rien, « NN »', () => {
    expect(acquisRow(raw({ moyennesFinales: [] }), 1, table).moyenneEleve).toBe(17);
    expect(acquisRow(raw({ moyennesFinales: [], moyennes: [] }), 1, table).moyenneEleve).toBe('NN');
  });

  it('le positionnement posé par l’enseignant prime ; sans conversion, NN (0)', () => {
    expect(acquisRow(raw({ positionnementsFinaux: [{ id_periode: 1, positionnementFinal: 2 }] }), 1, table).positionnement).toBe(2);
    expect(acquisRow(raw(), 1, []).positionnementAuto).toBe(0);
  });

  it('une matière vide pour la période est écartée', () => {
    const empty = raw({ appreciations: [], moyennesFinales: [], moyennes: [], positionnements_auto: [] });
    expect(isEmptyRow(acquisRow(empty, 1, table), empty, 1)).toBe(true);
    expect(isEmptyRow(acquisRow(raw(), 1, table), raw(), 1)).toBe(false);
  });

  it('moyenne générale à deux décimales, « NN » sans moyenne', () => {
    expect(moyenneGenerale([16.5, 'NN', '12'])).toBe('14.25');
    expect(moyenneGenerale(['NN'])).toBe('NN');
  });
});
