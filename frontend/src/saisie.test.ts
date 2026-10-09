import { describe, expect, it } from 'vitest';

import {
  annotationClearsCompetences,
  bulkMessageKey,
  bulkTargets,
  competenceLabel,
  evaluatesCompetences,
  isEndSaisie,
  isEvaluable,
  levelForKey,
  levelsForCycle,
  nextLevel,
  parseSaisie,
  saisieDisplay,
  sortEleves,
} from './saisie';
import type { Annotation, MaitriseLevel, NoteDevoir, PeriodeClasse } from './types';

const annotations: Annotation[] = [
  { id: 1, libelle: 'Absent', libelle_court: 'ABS' },
  { id: 2, libelle: 'Dispensé', libelle_court: 'DISP' },
  { id: 3, libelle: 'Non noté', libelle_court: 'NN' },
  { id: 4, libelle: 'Non rendu', libelle_court: 'NR' },
];

const note = (patch: Partial<NoteDevoir> = {}): NoteDevoir => ({
  id_eleve: 'e1',
  id: null,
  valeur: null,
  id_annotation: null,
  id_appreciation: null,
  appreciation: null,
  ...patch,
});

describe('parseSaisie', () => {
  it('accepte une note dans le barème, virgule décimale comprise', () => {
    expect(parseSaisie('14,5', annotations, 20, true)).toEqual({ kind: 'note', valeur: 14.5 });
    expect(parseSaisie(' 20 ', annotations, 20, true)).toEqual({ kind: 'note', valeur: 20 });
    expect(parseSaisie('0', annotations, 20, true)).toEqual({ kind: 'note', valeur: 0 });
  });

  it('refuse une note hors barème, ou à plus de deux décimales', () => {
    expect(parseSaisie('21', annotations, 20, true).kind).toBe('outOfRange');
    expect(parseSaisie('12.345', annotations, 20, true).kind).toBe('invalid');
    expect(parseSaisie('-2', annotations, 20, true).kind).toBe('invalid');
    expect(parseSaisie('douze', annotations, 20, true).kind).toBe('invalid');
  });

  it('reconnaît une annotation sans souci de casse', () => {
    expect(parseSaisie('abs', annotations, 20, true)).toEqual({ kind: 'annotation', annotation: annotations[0] });
  });

  it('sur une évaluation non notée, n’accepte que les annotations', () => {
    expect(parseSaisie('12', annotations, 20, false).kind).toBe('invalid');
    expect(parseSaisie('NR', annotations, 20, false).kind).toBe('annotation');
  });

  it('une case vidée efface', () => {
    expect(parseSaisie('  ', annotations, 20, true).kind).toBe('empty');
  });
});

describe('affichage et effets d’une annotation', () => {
  it('affiche le libellé court de l’annotation, sinon la note', () => {
    expect(saisieDisplay(note({ id_annotation: 2 }), annotations)).toBe('DISP');
    expect(saisieDisplay(note({ id: 9, valeur: '14.5' }), annotations)).toBe('14.5');
    expect(saisieDisplay(undefined, annotations)).toBe('');
  });

  it('absent, dispensé ou non rendu retirent l’élève des compétences ; non noté, non', () => {
    expect(evaluatesCompetences(note({ id_annotation: 1 }), annotations)).toBe(false);
    expect(evaluatesCompetences(note({ id_annotation: 4 }), annotations)).toBe(false);
    expect(evaluatesCompetences(note({ id_annotation: 3 }), annotations)).toBe(true);
    expect(evaluatesCompetences(note(), annotations)).toBe(true);
  });

  it('« non noté » ne garde les niveaux que sur une évaluation notée (règle du serveur)', () => {
    expect(annotationClearsCompetences(annotations[2], true)).toBe(false);
    expect(annotationClearsCompetences(annotations[2], false)).toBe(true);
    expect(annotationClearsCompetences(annotations[0], true)).toBe(true);
  });
});

describe('échelle de maîtrise', () => {
  const level = (id_cycle: number, ordre: number, patch: Partial<MaitriseLevel> = {}): MaitriseLevel => ({
    id_cycle,
    ordre,
    libelle: null,
    couleur: null,
    lettre: null,
    default_lib: `Niveau ${ordre}`,
    default: ['red', 'orange', 'yellow', 'green'][ordre - 1],
    ...patch,
  });
  const all = [1, 2, 3, 4].flatMap((o) => [level(1, o), level(2, o)]);

  it('prend le cycle de la classe, du niveau le plus haut au plus bas, couleurs nommées traduites', () => {
    const levels = levelsForCycle(all, 2);
    expect(levels.map((l) => l.value)).toEqual([3, 2, 1, 0]);
    expect(levels[0].couleur).toBe('#46bfaf');
    expect(levels[3].couleur).toBe('#e13a3a');
  });

  it('sans cycle connu, se rabat sur le premier rencontré', () => {
    expect(levelsForCycle(all, null)).toHaveLength(4);
    expect(levelsForCycle(all, 99)).toHaveLength(4);
  });

  it('la personnalisation de l’établissement prime', () => {
    const levels = levelsForCycle([level(1, 1, { libelle: 'À revoir', couleur: '#123456', lettre: 'R ' })], 1);
    expect(levels[0]).toMatchObject({ libelle: 'À revoir', couleur: '#123456', lettre: 'R' });
  });

  it('un clic fait le tour : non évaluée → plus haut → … → plus bas → non évaluée', () => {
    expect(nextLevel(-1, 3)).toBe(3);
    expect(nextLevel(3, 3)).toBe(2);
    expect(nextLevel(0, 3)).toBe(-1);
  });

  it('touches 0 à 4', () => {
    expect(levelForKey('0')).toBe(-1);
    expect(levelForKey('4')).toBe(3);
    expect(levelForKey('5')).toBeNull();
    expect(levelForKey('a')).toBeNull();
  });
});

describe('élèves', () => {
  it('trie par nom puis prénom, sans tenir compte des accents', () => {
    const sorted = sortEleves([
      { lastName: 'Émery', firstName: 'Zoé' },
      { lastName: 'Bernard', firstName: 'Léa' },
      { lastName: 'Emery', firstName: 'Anna' },
    ]);
    expect(sorted.map((e) => e.firstName)).toEqual(['Léa', 'Anna', 'Zoé']);
  });

  const periode: PeriodeClasse = {
    id: 28,
    id_type: 1,
    type: 2,
    ordre: 1,
    timestamp_dt: '2026-08-31T00:00:00.000',
    timestamp_fn: '2026-12-31T00:00:00.000',
    date_fin_saisie: '2026-12-30T00:00:00.000',
  };

  it('un élève parti avant la période n’y est pas évalué', () => {
    expect(isEvaluable({ deleteDate: null }, periode)).toBe(true);
    expect(isEvaluable({ deleteDate: '2026-10-01' }, periode)).toBe(true);
    expect(isEvaluable({ deleteDate: '2027-02-01' }, periode)).toBe(true);
    expect(isEvaluable({ deleteDate: '2026-06-01' }, periode)).toBe(false);
  });

  it('la saisie se ferme le lendemain de la date de fin de saisie, sauf pour le professeur principal', () => {
    expect(isEndSaisie(periode, '2026-12-30', false)).toBe(false);
    expect(isEndSaisie(periode, '2026-12-31', false)).toBe(true);
    expect(isEndSaisie(periode, '2026-12-31', true)).toBe(false);
    expect(isEndSaisie(undefined, '2030-01-01', false)).toBe(false);
  });
});

describe('coloriage en masse', () => {
  const excluded = (id: string) => id === 'absent';

  it('sans sélection : tous les élèves sur toutes les compétences, sauf les exclus', () => {
    const cells = bulkTargets(['a', 'absent', 'b'], [], [7, 8], [], excluded);
    expect(cells).toHaveLength(4);
    expect(cells.some((c) => c.id_eleve === 'absent')).toBe(false);
  });

  it('respecte la sélection d’élèves et de compétences', () => {
    expect(bulkTargets(['a', 'b'], ['b'], [7, 8], [8], excluded)).toEqual([{ id_eleve: 'b', id_competence: 8 }]);
  });

  it('chaque sélection a son message', () => {
    expect(bulkMessageKey(2, 1)).toBe('evaluation.action.evaluate.students.for.skills');
    expect(bulkMessageKey(2, 0)).toBe('evaluation.action.evaluate.students.for.all.skills');
    expect(bulkMessageKey(0, 1)).toBe('evaluation.action.evaluate.all.students.for.skills');
    expect(bulkMessageKey(0, 0)).toBe('evaluation.action.confirme.initialise.skills');
  });
});

it('libellé d’une compétence : code du domaine puis nom', () => {
  expect(competenceLabel({ code_domaine: 'D1.4', nom: ' Choisir ' })).toBe('D1.4 - Choisir');
  expect(competenceLabel({ code_domaine: null, nom: 'Seule' })).toBe('Seule');
});
