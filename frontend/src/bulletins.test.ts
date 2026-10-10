import { describe, expect, it } from 'vitest';

import { bulletinBody, bulletinPeriodes, orientationDefaultKey, otherTeacherName } from './bulletins';
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
