import { describe, expect, it } from 'vitest';

import { bulletinBody, bulletinPeriodes, orientationDefaultKey, otherTeacherName, bulletinConflicts, reportModelTitleTaken, renamedModelBody } from './bulletins';
import type { PeriodeClasse } from './types';

const p = (id_type: number, patch: Partial<PeriodeClasse> = {}): PeriodeClasse => ({
  id: id_type,
  id_type,
  type: 3,
  ordre: id_type,
  timestamp_dt: '',
  timestamp_fn: '',
  date_fin_saisie: null,
  ...patch,
});

describe('bulletins', () => {
  it('regroupe les périodes des classes choisies par type', () => {
    const periodes = bulletinPeriodes(new Map([
      ['a', [p(3), p(4)]],
      ['b', [p(3)]],
    ]));
    expect(periodes.map((x) => [x.id_type, x.classes])).toEqual([[3, ['a', 'b']], [4, ['a']]]);
  });

  it('avis d’orientation de fin d’année pour la dernière période', () => {
    expect(orientationDefaultKey(5)).toBe('orientation.avis.LastTrimester');
    expect(orientationDefaultKey(2)).toBe('orientation.avis.LastTrimester');
    expect(orientationDefaultKey(3)).toBe('orientation.avis.FirstSecondTrimester');
  });

  it('corps d’une classe : options booléennes, modèle, sous-matières seulement avec une colonne', () => {
    const base = {
      structureId: 's',
      classeId: 'c',
      classeName: '4A',
      periode: { id_type: 3, type: 3, ordre: 1, classes: ['c'] },
      studentIds: ['e1'],
      mentionOpinion: 'm',
      orientationOpinion: 'o',
      images: {},
    };
    const body = bulletinBody({ moyenneEleve: true, moyenneEleveSousMat: true, useModel: true, idModel: 7 }, base);
    expect(body).toMatchObject({ moyenneEleve: true, moyenneClasse: false, printSousMatieres: true, idModel: 7, idPeriode: 3, typePeriode: 3 });
    expect(bulletinBody({ moyenneEleveSousMat: true }, base).printSousMatieres).toBe(false);
    expect(bulletinBody({}, base).idModel).toBeUndefined();
  });

  it('nom de l’intervenant ajouté', () => {
    expect(otherTeacherName({ civility: 'M.', firstName: 'Jean', lastName: 'Dupont' })).toBe(' : M. J. Dupont');
    expect(otherTeacherName(undefined)).toBe('');
  });
});

describe('bilan par domaine', () => {
  const ctx = {
    structureId: 's',
    classeId: 'c',
    classeName: '4A',
    periode: { id_type: 1, type: 2, ordre: 1, classes: ['c'] },
    studentIds: ['e1'],
    mentionOpinion: '',
    orientationOpinion: '',
    images: {},
  };

  it('les images déposées accompagnent la demande, et leurs identifiants à supprimer ensuite', () => {
    const body = bulletinBody({ showBilanPerDomaines: true }, { ...ctx, graphImages: { e1: 'img1' } });
    expect(body).toMatchObject({ showBilanPerDomaines: true, images: { e1: 'img1' }, idImagesFiles: ['img1'] });
  });

  it('pas de bilan par domaine sur le bulletin de lycée, ni sans image', () => {
    expect(bulletinBody({ showBilanPerDomaines: true, simple: true }, { ...ctx, graphImages: { e1: 'img1' } }).showBilanPerDomaines).toBe(false);
    expect(bulletinBody({ showBilanPerDomaines: true }, ctx).showBilanPerDomaines).toBe(false);
  });
});

import { applyModel, modelPreferences } from './bulletins';

describe('modèles d’options', () => {
  it('appliquer un modèle coche ses options et décoche les autres, reprend ses textes', () => {
    const print = applyModel({ coefficient: false, studentRank: true }, {
      _id: 'm', userId: 'u', structureId: 's', title: 'T', preferencesCheckbox: ['coefficient'], preferencesText: { nameCE: 'M. Dupont', imgSignature: null },
    });
    expect(print).toMatchObject({ coefficient: true, studentRank: false, nameCE: 'M. Dupont' });
    expect('imgSignature' in print).toBe(false);
  });

  it('enregistrer : toutes les cases connues, et les libellés de mention et d’avis', () => {
    const p = modelPreferences({ coefficient: true }, { mentionClass: 'Mention', orientationOpinion: 'Avis' });
    expect(p.preferencesCheckbox).toMatchObject({ coefficient: true, studentRank: false });
    expect(p.preferencesText).toMatchObject({ mentionClass: 'Mention', orientationOpinion: 'Avis' });
  });
});

describe('bulletinConflicts', () => {
  it('dédoublonne par élève, ignore ceux sans conflit, détaille matières et enseignants', () => {
    const out = bulletinConflicts([
      { idEleve: 'e1', lastName: 'Durand', firstName: 'Léa', classeOf: '6e', classeNameToShow: 'A', has_conflict_coefficient: true, conflict_coefficient: [{ libelleMatiere: 'Maths', coefficient: 2, teachers: [{ firstName: 'Alice', name: 'Martin' }] }, { libelleMatiere: 'Maths', coefficient: 3, teachers: [{ firstName: 'Bob', name: 'Roux' }] }] },
      { idEleve: 'e1', lastName: 'Durand', firstName: 'Léa', has_conflict_coefficient: true, conflict_coefficient: [] },
      { idEleve: 'e2', lastName: 'Petit', firstName: 'Tom', has_conflict_coefficient: false },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ idEleve: 'e1', nom: 'Durand Léa', classe: '6e A' });
    expect(out[0].subjects.map((s) => [s.libelle, s.coefficient, s.teachers])).toEqual([['Maths', '2', ['A.Martin']], ['Maths', '3', ['B.Roux']]]);
  });
});

describe('reportModelTitleTaken', () => {
  const models = [{ _id: 'a', title: 'Collège' }, { _id: 'b', title: 'Lycée ' }];
  it('détecte un titre déjà pris, sans casse ni espaces de bord', () => {
    expect(reportModelTitleTaken(models, ' collège')).toBe(true);
    expect(reportModelTitleTaken(models, 'Lycée')).toBe(true);
    expect(reportModelTitleTaken(models, 'Neutre')).toBe(false);
  });
  it('le modèle renommé peut garder son propre titre', () => {
    expect(reportModelTitleTaken(models, 'Collège', 'a')).toBe(false);
    expect(reportModelTitleTaken(models, 'Lycée', 'a')).toBe(true);
  });
});

describe('renamedModelBody', () => {
  it('garde les options du modèle avec le nouveau titre', () => {
    const body = renamedModelBody({ _id: 'a', userId: 'u', structureId: 's', title: 'Ancien', preferencesCheckbox: ['moyenneClasse'], preferencesText: { mentionClass: 'Bien' } }, '  Nouveau ');
    expect(body.title).toBe('Nouveau');
    expect(body.preferencesText).toEqual({ mentionClass: 'Bien' });
    expect(body.preferencesCheckbox.moyenneClasse).toBe(true);
    expect(Object.values(body.preferencesCheckbox).filter(Boolean)).toHaveLength(1);
  });
});
