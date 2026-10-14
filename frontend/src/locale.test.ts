import { afterEach, describe, expect, it } from 'vitest';

import { dateLocale, dayLabels, dayShort, DEFAULT_LOCALE, setLanguage } from './locale';
import { formatMoyenne } from './releve';
import { formatDate } from './rules';

afterEach(() => setLanguage('fr'));

describe('setLanguage', () => {
  it('traduit un code de langue ENT en locale complète', () => {
    setLanguage('en');
    expect(dateLocale()).toBe('en-GB');
    setLanguage('fr');
    expect(dateLocale()).toBe(DEFAULT_LOCALE);
  });

  it('reprend tel quel un code déjà régionalisé', () => {
    setLanguage('pt-BR');
    expect(dateLocale()).toBe('pt-BR');
  });

  it('ignore une langue vide : la session n’est pas encore chargée', () => {
    setLanguage('en');
    setLanguage(undefined);
    setLanguage('');
    expect(dateLocale()).toBe('en-GB');
  });
});

describe('jours de la semaine', () => {
  it('rend le français inchangé, initiale en capitale et sans point', () => {
    setLanguage('fr');
    expect(dayLabels()).toEqual([
      'Lundi',
      'Mardi',
      'Mercredi',
      'Jeudi',
      'Vendredi',
      'Samedi',
      'Dimanche',
    ]);
    expect(dayShort()).toEqual(['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']);
  });

  it('suit la langue de la session', () => {
    setLanguage('en');
    expect(dayLabels()[0]).toBe('Monday');
    expect(dayShort()).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  });
});

describe('formatage du module', () => {
  it('formate les dates dans la langue de la session', () => {
    setLanguage('fr');
    expect(formatDate('2026-10-01')).toBe('01/10/2026');
    setLanguage('en-US');
    expect(formatDate('2026-10-01')).toBe('10/01/2026');
  });

  it('formate les moyennes avec le séparateur décimal de la langue', () => {
    setLanguage('fr');
    expect(formatMoyenne(16.25)).toBe('16,25');
    setLanguage('en');
    expect(formatMoyenne(16.25)).toBe('16.25');
  });
});
