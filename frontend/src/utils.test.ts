import { describe, expect, it } from 'vitest';

import type { MaitriseLevel } from './api';
import { byName, byRank, levelColor, levelLabel, noteIsValid, sortLevels } from './utils';

describe('byRank', () => {
  it('trie par rank croissant', () => {
    const arr = [{ rank: 2 }, { rank: 0 }, { rank: 1 }];
    expect([...arr].sort(byRank).map((x) => x.rank)).toEqual([0, 1, 2]);
  });
  it('traite rank absent comme 0', () => {
    expect(byRank({}, { rank: 1 }) < 0).toBe(true);
  });
});

describe('byName', () => {
  it('trie insensible casse/accents', () => {
    const arr = [{ name: 'Éveil' }, { name: 'anglais' }, { name: 'Biologie' }];
    expect([...arr].sort(byName).map((x) => x.name)).toEqual(['anglais', 'Biologie', 'Éveil']);
  });
});

describe('levelLabel', () => {
  it('préfère le libellé perso', () => {
    expect(levelLabel({ libelle: 'Maîtrise satisfaisante', default_lib: 'MS' })).toBe('Maîtrise satisfaisante');
  });
  it('retombe sur le libellé par défaut puis la lettre', () => {
    expect(levelLabel({ libelle: null, default_lib: 'MS' } as MaitriseLevel)).toBe('MS');
    expect(levelLabel({ lettre: 'A', ordre: 1 } as MaitriseLevel)).toBe('A');
    expect(levelLabel({ ordre: 3 } as MaitriseLevel)).toBe('Niveau 3');
  });
});

describe('levelColor', () => {
  it('préfère la couleur perso et normalise le #', () => {
    expect(levelColor({ couleur: 'ff0000', default: '00ff00' } as MaitriseLevel)).toBe('#ff0000');
    expect(levelColor({ default: '#00ff00' } as MaitriseLevel)).toBe('#00ff00');
    expect(levelColor({} as MaitriseLevel)).toBe('');
  });
});

describe('sortLevels', () => {
  it('trie par ordre croissant sans muter', () => {
    const src: MaitriseLevel[] = [{ ordre: 2 }, { ordre: 1 }, { ordre: 3 }];
    const out = sortLevels(src);
    expect(out.map((l) => l.ordre)).toEqual([1, 2, 3]);
    expect(src.map((l) => l.ordre)).toEqual([2, 1, 3]);
  });
});

describe('noteIsValid', () => {
  it('accepte une note dans le barème', () => {
    expect(noteIsValid('14', 20)).toBe(true);
    expect(noteIsValid('0', 20)).toBe(true);
    expect(noteIsValid('20', 20)).toBe(true);
    expect(noteIsValid('12.5', 20)).toBe(true);
  });
  it('refuse hors barème, vide ou non numérique', () => {
    expect(noteIsValid('21', 20)).toBe(false);
    expect(noteIsValid('-1', 20)).toBe(false);
    expect(noteIsValid('', 20)).toBe(false);
    expect(noteIsValid('abc', 20)).toBe(false);
  });
})
