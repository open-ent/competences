import { describe, expect, it } from 'vitest';

import { appreciationsByElement, elementTitle } from './projets';

describe('projets', () => {
  it('range les appréciations : classe d’un côté, élèves de l’autre', () => {
    const map = appreciationsByElement([
      { id_elt_bilan_periodique: 1, id_periode: 1, commentaire: 'Bon groupe' },
      { id_elt_bilan_periodique: 1, id_periode: 1, id_eleve: 'a', commentaire: 'Très investie' },
      { id_elt_bilan_periodique: 2, id_periode: 1, id_eleve: 'b', commentaire: 'Assidu' },
    ]);
    expect(map.get(1)?.classe).toBe('Bon groupe');
    expect(map.get(1)?.eleves.get('a')).toBe('Très investie');
    expect(map.get(2)?.classe).toBe('');
  });

  it('un parcours se titre par sa thématique, un EPI par son libellé', () => {
    expect(elementTitle({ id: 2, type: 3, theme: { id: 3, libelle: 'Parcours citoyen', code: 'PAR_CIT' } })).toBe('Parcours citoyen');
    expect(elementTitle({ id: 1, type: 1, libelle: 'Robotique', theme: { id: 13, libelle: 'STS', code: 'EPI_STS' } })).toBe('Robotique');
  });
});
