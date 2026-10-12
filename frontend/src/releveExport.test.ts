import { describe, expect, it } from 'vitest';

import { csvOnly, defaultReleveExportOptions, releveCsv, releveExportBody } from './releveExport';

const t = (k: string) => ({ students: 'Élèves', 'average.auto': 'Moyenne auto', 'average.final': 'Moyenne finale', average: 'Moyenne', 'average.class': 'Moyenne de classe', 'evaluations.releve.positionnement': 'Positionnement', 'viescolaire.utils.appreciations': 'Appréciations', 'evaluations.releve.appreciation.classe': 'Appréciation de la classe', 'viescolaire.periode.3': 'Trimestre' })[k] ?? k;

describe('export du relevé périodique', () => {
  it('corps du PDF : colonnes comptées comme l’AngularJS', () => {
    const o = defaultReleveExportOptions([1]);
    const body = releveExportBody(o, { idMatiere: 'm', idClasse: 'c', idEtablissement: 's', idPeriode: 1, typeClasse: 0, classeName: '4A', matiere: 'Maths' });
    // 6 options cochées + 1 moyenne et 1 positionnement de sous-matière, moins un.
    expect(body.colspan).toBe(7);
    // positionnement de sous-matière + positionnement final + appréciation.
    expect(body.moyspan).toBe(3);
    expect(body).toMatchObject({ fileType: 'pdf', classeName: '4A', matiere: 'Maths' });
  });

  it('notes et périodes précédentes n’existent qu’en CSV', () => {
    expect(csvOnly(defaultReleveExportOptions([]))).toBe(false);
    expect(csvOnly({ ...defaultReleveExportOptions([]), withNotes: true })).toBe(true);
  });

  it('CSV : notes et annotations, moyenne « NN », appréciation sur une ligne, moyenne et appréciation de classe', () => {
    const o = { ...defaultReleveExportOptions([]), fileType: 'csv' as const, withNotes: true, positionnementFinal: false, previousAverages: true };
    const csv = releveCsv(
      o,
      {
        eleves: [
          { id: 'e1', displayName: 'Baron Inès', moyenne: 15, moyenneFinale: 16, appreciation_matiere_periode: `Bien${String.fromCharCode(10)}lancée`, averages: [{ id_periode: 3, moyenne: 14 }] },
          { id: 'e2', displayName: 'Bernard Léa', moyenne: 12, moyenneFinale: null },
        ],
        notes: [
          { id_devoir: 1, id_eleve: 'e1', valeur: '15', annotation: null },
          { id_devoir: 1, id_eleve: 'e2', valeur: null, annotation: 1 },
        ],
        _moyenne_classe: { null: { moyenne: 13.5 }, nullFinal: { moyenne: 14 } },
        appreciation_classe: { appreciation: 'Classe sérieuse' },
      },
      { t, devoirs: [{ id: 1, name: 'Contrôle' }], annotationOf: () => 'ABS', sousMatieres: [], previous: [{ id_type: 3, type: 3, ordre: 1 }] },
    );
    const [header, l1, l2, classe, apprec] = csv.replace('﻿', '').split('\r\n');
    expect(header).toBe('Élèves; Contrôle; Moyenne auto; Moyenne finale; Moyenne; Appréciations; MoyenneT1');
    expect(l1).toBe('Baron Inès;15;15;16;16;Bien lancée;14');
    expect(l2).toBe('Bernard Léa;ABS;12;NN;NN; ;');
    expect(classe).toBe('Moyenne de classe;13.5;14');
    expect(apprec).toBe('Appréciation de la classe;Classe sérieuse');
  });
});
