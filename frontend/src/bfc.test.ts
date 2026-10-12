import { describe, expect, it } from 'vitest';

import { bfcAction, bfcLignes, isVisible } from './bfc';

const table = [
  { valmin: 1, valmax: 1.5, libelle: 'Insuffisante', ordre: 1, couleur: 'red', bareme_brevet: 10 },
  { valmin: 1.5, valmax: 2.5, libelle: 'Fragile', ordre: 2, couleur: 'orange', bareme_brevet: 25 },
  { valmin: 2.5, valmax: 3.5, libelle: 'Satisfaisante', ordre: 3, couleur: 'yellow', bareme_brevet: 40 },
  { valmin: 3.5, valmax: 4, libelle: 'Très bonne', ordre: 4, couleur: 'green', bareme_brevet: 50 },
];
const ev = (id_competence: number, id_domaine: number, evaluation: number, id_matiere = 'm') => ({
  id_competence,
  id_domaine,
  id_competences_notes: id_competence * 10 + evaluation,
  evaluation,
  owner: 't',
  id_matiere,
  id_devoir: 1,
  evaluation_libelle: '',
  evaluation_date: '',
  created: '2026-10-01',
  formative: false,
  niveau_final: null,
  niveau_final_annuel: null,
  eval_lib_historise: false,
});
const comp = (id: number, id_domaine: number) => ({ id, nom: `C${id}`, id_domaine, masque: false });
const dom = (id: number, codification: string, evaluated: boolean, competences: ReturnType<typeof comp>[] = [], domaines: unknown[] = []) =>
  ({ id, niveau: 1, codification, libelle: codification, evaluated, competences, domaines }) as never;

describe('bilan de fin de cycle', () => {
  const domaines = [
    dom(1, 'D1', false, [], [dom(2, 'D1.1', true, [comp(10, 2), comp(11, 2)]), dom(3, 'D1.2', true, [comp(12, 3)])]),
    dom(6, 'D2', true, [comp(20, 6)], [dom(7, 'D2.1', true, [comp(21, 7)])]),
  ];
  const evaluations = [ev(10, 2, 3), ev(11, 2, 1), ev(20, 6, 3), ev(21, 7, 2)];

  it('une ligne par domaine évalué sans parent évalué, moyenne sur le domaine et ses sous-domaines', () => {
    const lignes = bfcLignes({ domaines, evaluations, table, average: false, fixes: [] });
    expect(lignes.map((l) => l.domaine.codification)).toEqual(['D1.1', 'D1.2', 'D2']);
    // D1.1 : niveaux 4 et 2 → 3 ; D1.2 : rien ; D2 : 4 et 3 (sous-domaine D2.1) → 3,5.
    expect(lignes.map((l) => [l.moyenne, l.calcule])).toEqual([
      [3, 3],
      [-1, -1],
      [3.5, 4],
    ]);
  });

  it('le niveau fixé par la direction prime sur le calculé', () => {
    const fixe = { id: 1, id_domaine: 2, id_eleve: 'e', id_etablissement: 's', owner: 'd', valeur: 4 };
    const [d11] = bfcLignes({ domaines, evaluations, table, average: false, fixes: [fixe] });
    expect(d11.retenu).toBe(4);
    expect(bfcAction(d11, 3)).toEqual({ kind: 'delete' });
    expect(bfcAction(d11, 2)).toEqual({ kind: 'save', valeur: 2 });
    expect(bfcAction(d11, 4)).toEqual({ kind: 'none' });
  });

  it('sans niveau fixé, revenir au calculé ne fait rien', () => {
    const [d11] = bfcLignes({ domaines, evaluations, table, average: false, fixes: [] });
    expect(bfcAction(d11, 3)).toEqual({ kind: 'none' });
    expect(bfcAction(d11, 1)).toEqual({ kind: 'save', valeur: 1 });
  });

  it('visibilité : 1 = direction et professeur principal, 2 = tous', () => {
    expect(isVisible(1, false)).toBe(false);
    expect(isVisible(1, true)).toBe(true);
    expect(isVisible(2, false)).toBe(true);
    expect(isVisible(undefined, true)).toBe(false);
  });
});

import { choisirEnseignement, choisirLangue } from './bfc';

describe('enseignement de complément', () => {
  const niveaux = [
    { id: 1, libelle: 'Objectif atteint', niveau: 1, bareme_brevet: 10 },
    { id: 2, libelle: 'Objectif dépassé', niveau: 2, bareme_brevet: 20 },
    { id: 3, libelle: 'aucun', niveau: 0, bareme_brevet: 0 },
  ];
  const langues = [
    { id: 1, libelle: 'Aucun', code: 'AUC' },
    { id: 3, libelle: 'Breton', code: 'BRE' },
  ];

  it('« Aucun » remet le niveau à aucun, sans langue', () => {
    expect(choisirEnseignement({ id: 1, libelle: 'Aucun', code: 'AUC' }, niveaux, langues)).toEqual({ id_enscpl: 1, id_niveau: 3, id_langue: null, niveau_lcr: 0 });
  });

  it('un enseignement part de l’objectif atteint ; la langue régionale, de la première langue', () => {
    expect(choisirEnseignement({ id: 2, libelle: 'LCA', code: 'LCA' }, niveaux, langues)).toEqual({ id_enscpl: 2, id_niveau: 1, id_langue: null, niveau_lcr: 0 });
    expect(choisirEnseignement({ id: 3, libelle: 'LCR', code: 'LCR' }, niveaux, langues)).toMatchObject({ id_langue: 1, niveau_lcr: 0 });
  });

  it('choisir une langue fixe son niveau au premier, « Aucun » l’efface', () => {
    const base = { id_enscpl: 3, id_niveau: 1, id_langue: 1, niveau_lcr: 0 };
    expect(choisirLangue(base, langues[1])).toMatchObject({ id_langue: 3, niveau_lcr: 1 });
    expect(choisirLangue({ ...base, niveau_lcr: 2 }, langues[0])).toMatchObject({ id_langue: 1, niveau_lcr: 0 });
  });
});
