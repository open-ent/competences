import { describe, expect, it } from 'vitest';

import { graphRows, moyenneNiveau, repartition } from './graphiques';

const c = (evaluation: number, niveau_final: number | null = null, evaluationGraph = evaluation) => ({ evaluation, niveau_final, evaluationGraph });

describe('graphiques du conseil', () => {
  it('niveau moyen sur 4, le niveau final primant', () => {
    expect(moyenneNiveau([c(1), c(3)])).toBe(3);
    expect(moyenneNiveau([c(0, 3)])).toBe(4);
    expect(moyenneNiveau([])).toBe(0);
  });

  it('répartition des niveaux de l’élève, sans les compétences non évaluées', () => {
    expect(repartition([c(0), c(2), c(2), c(-1)])).toEqual([33.3, 0, 66.7, 0]);
    expect(repartition(null)).toEqual([0, 0, 0, 0]);
  });

  it('lignes : matières avec moyennes, domaines sans, entrées anonymes écartées', () => {
    const rows = graphRows([
      { id: 'm1', name: 'Mathématiques', competencesNotesEleve: [c(2)], competencesNotes: [c(2), c(1)], studentAverage: 16.5, classAverage: '16', classMin: 15.5, classMax: 16.5 },
      { name: 'null', competencesNotes: null },
      { id: 5, codification: 'D1.4', competencesNotesEleve: [c(3)] },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ label: 'Mathématiques', niveauEleve: 3, niveauClasse: 2.5, moyenneEleve: 16.5, moyenneClasse: 16, min: 15.5, max: 16.5 });
    expect(rows[1]).toMatchObject({ label: 'D1.4', niveauEleve: 4, moyenneEleve: null, repartition: [0, 0, 0, 100] });
  });
});

import { comparisonSeries } from './graphiques';

describe('comparaison entre périodes', () => {
  it('une série par période, sur l’union des matières', () => {
    const row = (label: string, niveauEleve: number) => ({ label, niveauEleve, niveauClasse: 0, repartition: [0, 0, 0, 0], moyenneEleve: null, moyenneClasse: null, min: null, max: null });
    const r = comparisonSeries(
      [
        { label: 'T1', rows: [row('Maths', 3)] },
        { label: 'T2', rows: [row('Maths', 4), row('Anglais', 2)] },
      ],
      (x) => x.niveauEleve,
    );
    expect(r.categories).toEqual(['Maths', 'Anglais']);
    expect(r.series).toEqual([
      { label: 'T1', values: [3, null] },
      { label: 'T2', values: [4, 2] },
    ]);
  });
});
