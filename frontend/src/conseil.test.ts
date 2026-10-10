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

import { avisOfType, avisSynthesePeriode, conseilRights, evenementsHistorique } from './conseil';

describe('avis et synthèses', () => {
  const avis = [
    { id: 1, libelle: 'Félicitations', type_avis: 1, active: true, id_etablissement: null },
    { id: 2, libelle: 'Ancien', type_avis: 1, active: false, id_etablissement: null },
    { id: 5, libelle: 'Admis en 2nde', type_avis: 2, active: true, id_etablissement: null },
  ];

  it('avis actifs par type', () => {
    expect(avisOfType(avis, 1).map((a) => a.id)).toEqual([1]);
    expect(avisOfType(avis, 2).map((a) => a.id)).toEqual([5]);
  });

  it('synthèse et avis de la période, vides à défaut', () => {
    const data = {
      libelleAvis: avis,
      syntheses: [{ id_typeperiode: 1, synthese: 'Bon trimestre' }],
      avisConseil: [{ id_periode: 1, id_avis_conseil_bilan: 1 }],
      avisOrientation: [{ id_periode: 2, id_avis_conseil_bilan: 5 }],
    };
    expect(avisSynthesePeriode(data, 1)).toEqual({ synthese: 'Bon trimestre', avisConseil: 1, avisOrientation: null });
    expect(avisSynthesePeriode(data, 2)).toEqual({ synthese: '', avisConseil: null, avisOrientation: 5 });
  });
});

describe('vie scolaire', () => {
  it('une ligne par période, des zéros à défaut, puis le total de l’année', () => {
    const lignes = evenementsHistorique([{ id_periode: 1, retard: 2, abs_just: 1 }, { id_periode: 9, retard: 7 }], [1, 2]);
    expect(lignes).toEqual([
      { id_periode: 1, retard: 2, abs_just: 1, abs_non_just: 0, abs_totale_heure: 0 },
      { id_periode: 2, retard: 0, abs_just: 0, abs_non_just: 0, abs_totale_heure: 0 },
      { id_periode: null, retard: 2, abs_just: 1, abs_non_just: 0, abs_totale_heure: 0 },
    ]);
  });
});

describe('droits du conseil', () => {
  const none = {
    canSaveAppMatierePosiBilanPeriodique: false,
    canSaisiSyntheseBilanPeriodique: false,
    canUpdateAvisConseilOrientation: false,
    canUpdateAppreciations: false,
    canSaisiAppreciationCPE: false,
    canUpdateRetardAndAbsence: false,
  };
  const all = Object.fromEntries(Object.keys(none).map((k) => [k, true])) as typeof none;

  it('la direction saisit sans droit dédié, sauf vie scolaire et appréciation du CPE', () => {
    expect(conseilRights({ published: false, chefOrHeadTeacher: true, hasService: false, workflow: none })).toEqual({
      suiviAcquis: true,
      synthese: true,
      avis: true,
      appreciationsProjets: true,
      appreciationCPE: false,
      vieScolaire: false,
    });
  });

  it('le suivi des acquis exige aussi un service évaluable dans la classe', () => {
    expect(conseilRights({ published: false, chefOrHeadTeacher: false, hasService: false, workflow: all }).suiviAcquis).toBe(false);
    expect(conseilRights({ published: false, chefOrHeadTeacher: false, hasService: true, workflow: all }).suiviAcquis).toBe(true);
  });

  it('tout est figé une fois les bulletins publiés', () => {
    expect(Object.values(conseilRights({ published: true, chefOrHeadTeacher: true, hasService: true, workflow: all })).some(Boolean)).toBe(false);
  });
});
