import { describe, expect, it } from 'vitest';

import {
  checkDates,
  competencesDiff,
  currentPeriode,
  defaultCoefficient,
  destructiveChanges,
  DevoirForm,
  filterTree,
  leavesOf,
  MAX_COMPETENCES,
  missingFields,
  moveCompetence,
  teachersForClasse,
  toggleCompetences,
  viewerAsOwner,
} from './devoirForm';
import type { Classe, Enseignement, PeriodeClasse } from './types';

const periode = (patch: Partial<PeriodeClasse> = {}): PeriodeClasse => ({
  id: 28,
  id_type: 1,
  type: 2,
  ordre: 1,
  timestamp_dt: '2026-08-31T00:00:00.000',
  timestamp_fn: '2026-12-31T00:00:00.000',
  date_fin_saisie: '2026-12-30T00:00:00.000',
  ...patch,
});

const form = (patch: Partial<DevoirForm> = {}): DevoirForm => ({
  id_groupe: 'c1',
  owner: 'me',
  id_matiere: 'maths',
  id_sousmatiere: null,
  id_type: 1,
  name: 'Contrôle',
  libelle: '',
  is_evaluated: true,
  diviseur: '20',
  ramener_sur: false,
  coefficient: '1',
  id_periode: 1,
  date: '2026-10-08',
  date_publication: '2026-10-09',
  apprec_visible: false,
  competences: [],
  ...patch,
});

describe('dates', () => {
  it('période en cours, sans l’entrée « Année »', () => {
    const periodes = [periode(), periode({ id: 52, id_type: 2, timestamp_dt: '2027-01-01', timestamp_fn: '2027-07-02' }), periode({ id: null })];
    expect(currentPeriode(periodes, '2026-10-09')?.id_type).toBe(1);
    expect(currentPeriode(periodes, '2027-03-01')?.id_type).toBe(2);
    expect(currentPeriode(periodes, '2027-08-15')).toBeUndefined();
  });

  it('publication avant l’évaluation, évaluation hors période', () => {
    expect(checkDates(form({ date_publication: '2026-10-01' }), periode(), '2026-10-09', false)?.publicationBeforeDate).toBe(true);
    expect(checkDates(form({ date: '2027-01-05', date_publication: '2027-01-05' }), periode(), '2026-10-09', false)?.dateOutOfPeriode).toBe(true);
    expect(checkDates(form(), periode(), '2026-10-09', false)).toEqual({
      publicationBeforeDate: false,
      dateOutOfPeriode: false,
      endSaisie: false,
    });
  });

  it('fin de saisie franchie par la date du jour ou celle de l’évaluation, sauf pour la direction', () => {
    expect(checkDates(form(), periode(), '2026-12-31', false)?.endSaisie).toBe(true);
    expect(checkDates(form({ date: '2026-12-31', date_publication: '2026-12-31' }), periode(), '2026-10-09', false)?.endSaisie).toBe(true);
    expect(checkDates(form(), periode(), '2026-12-31', true)?.endSaisie).toBe(false);
  });

  it('sans période connue, le contrôle échoue', () => {
    expect(checkDates(form(), undefined, '2026-10-09', false)).toBeNull();
  });
});

describe('validation', () => {
  it('un formulaire complet passe', () => {
    expect(missingFields(form(), null, false)).toEqual([]);
  });

  it('liste ce qui manque, dans l’ordre de l’AngularJS', () => {
    const missing = missingFields(form({ id_type: null, name: '  ', coefficient: '' }), null, false);
    expect(missing).toEqual(['choose.evaluation.type', 'evaluations.test.title', 'viescolaire.utils.coefficient']);
  });

  it('sans note, au moins une compétence', () => {
    expect(missingFields(form({ is_evaluated: false }), null, false)).toContain('required.fields.double.asterisk');
    expect(
      missingFields(form({ is_evaluated: false, competences: [{ id: 7, nom: 'x', code_domaine: null }] }), null, false),
    ).toEqual([]);
  });

  it('au plus douze compétences', () => {
    const many = Array.from({ length: MAX_COMPETENCES + 1 }, (_, i) => ({ id: i, nom: `c${i}`, code_domaine: null }));
    expect(missingFields(form({ competences: many }), null, false)).toContain('evaluations.max.competences');
  });

  it('la direction doit désigner l’enseignant', () => {
    expect(missingFields(form({ owner: null }), null, true)).toContain('viescolaire.utils.teacher');
    expect(missingFields(form({ owner: null }), null, false)).not.toContain('viescolaire.utils.teacher');
  });

  it('un barème nul est refusé, un coefficient nul accepté', () => {
    expect(missingFields(form({ diviseur: '0' }), null, false)).toContain('evaluations.test.grade.on');
    expect(missingFields(form({ coefficient: '0' }), null, false)).toEqual([]);
  });
});

describe('enseignant et matières', () => {
  const classe = (services: Classe['services']): Classe => ({ id: 'c1', name: '4A', type_groupe: 0, services });
  const enseignants = [
    { id: 'a', displayName: 'A' },
    { id: 'b', displayName: 'B' },
  ];

  it('propose les enseignants qui évaluent dans la classe, ou tous à défaut', () => {
    const svc = { id_enseignant: 'a', id_matiere: 'm', id_groupe: 'c1', evaluable: true };
    expect(teachersForClasse(enseignants, classe([svc]), '2026-10-09').map((e) => e.id)).toEqual(['a']);
    expect(teachersForClasse(enseignants, classe([{ ...svc, evaluable: false }]), '2026-10-09')).toHaveLength(2);
  });

  it('la direction qui crée pour un autre perd son passe-droit sur les matières', () => {
    const viewer = { userId: 'chef', isAdmin: true, isPersEducNat: false, details: {}, today: '2026-10-09' };
    expect(viewerAsOwner(viewer, 'chef')).toBe(viewer);
    expect(viewerAsOwner(viewer, 'a')).toMatchObject({ userId: 'a', isAdmin: false });
  });

  it('coefficient 0 pour une évaluation formative', () => {
    expect(defaultCoefficient({ id: 3, nom: 'Évaluation formative', formative: true })).toBe('0');
    expect(defaultCoefficient({ id: 1, nom: 'Évaluation' })).toBe('1');
  });
});

describe('arbre des compétences', () => {
  const enseignements: Enseignement[] = [
    {
      id: 12,
      nom: 'Arts Plastiques',
      competences_1: [
        {
          id: 6,
          nom: 'Expérimenter, produire',
          code_domaine: null,
          id_cycle: 1,
          competences_2: [
            { id: 7, nom: 'Choisir des moyens plastiques', code_domaine: 'D1.4', id_cycle: 1 },
            { id: 8, nom: 'S’approprier des questions', code_domaine: 'D1.4', id_cycle: 1, masque: true },
          ],
        },
        { id: 20, nom: 'Compétence seule', code_domaine: 'D2', id_cycle: 1 },
      ],
    },
    { id: 13, nom: 'Mathématiques', competences_1: [{ id: 30, nom: 'Chercher', code_domaine: 'D4', id_cycle: 1 }] },
  ];

  it('cache une compétence masquée, sauf si l’évaluation l’utilise déjà', () => {
    const [arts] = filterTree(enseignements, '', new Set(), new Set());
    expect(arts.competences[0].children.map((c) => c.id)).toEqual([7]);
    const [again] = filterTree(enseignements, '', new Set(), new Set([8]));
    expect(again.competences[0].children.map((c) => c.id)).toEqual([7, 8]);
  });

  it('la recherche ignore les accents et garde la mère d’une fille trouvée', () => {
    const tree = filterTree(enseignements, 'CHOISIR', new Set(), new Set());
    expect(tree).toHaveLength(1);
    expect(tree[0].competences[0].children.map((c) => c.id)).toEqual([7]);
    expect(filterTree(enseignements, 'experimenter', new Set(), new Set())[0].competences[0].children).toHaveLength(1);
  });

  it('filtre par enseignement', () => {
    expect(filterTree(enseignements, '', new Set([13]), new Set()).map((e) => e.id)).toEqual([13]);
  });

  it('cocher une mère retient ses filles ; une compétence sans fille se retient elle-même', () => {
    const [arts] = filterTree(enseignements, '', new Set(), new Set());
    expect(leavesOf(arts.competences[0]).map((c) => c.id)).toEqual([7]);
    expect(leavesOf(arts.competences[1]).map((c) => c.id)).toEqual([20]);
  });

  it('pas de doublon, retrait, déplacement', () => {
    const a = { id: 7, nom: 'a', code_domaine: null };
    const b = { id: 20, nom: 'b', code_domaine: null };
    const chosen = toggleCompetences(toggleCompetences([], [a, b], true), [a], true);
    expect(chosen.map((c) => c.id)).toEqual([7, 20]);
    expect(moveCompetence(chosen, 1, -1).map((c) => c.id)).toEqual([20, 7]);
    expect(moveCompetence(chosen, 0, -1)).toBe(chosen);
    expect(toggleCompetences(chosen, [a], false).map((c) => c.id)).toEqual([20]);
  });
});

describe('modification', () => {
  it('ajouts, réordonnancements et retraits envoyés au serveur', () => {
    const diff = competencesDiff([7, 8, 9], [
      { id: 9, nom: '', code_domaine: null },
      { id: 7, nom: '', code_domaine: null },
      { id: 30, nom: '', code_domaine: null },
    ]);
    expect(diff).toEqual({
      competencesAdd: [{ id: 30, index: 2 }],
      competencesUpdate: [
        { id: 9, index: 0 },
        { id: 7, index: 1 },
      ],
      competencesRem: [8],
    });
  });

  it('signale ce que la modification efface', () => {
    const evaluated = [
      { id: '7', typeeval: 'TypeEvalSkill' },
      { id: 'eleve-1', typeeval: 'TypeEvalNum' },
    ];
    const initial = { id_groupe: 'c1', is_evaluated: true, competences: [7, 8] };
    const changes = destructiveChanges(initial, form({ id_groupe: 'c2', is_evaluated: false, competences: [] }), evaluated);
    expect(changes).toEqual({ removedEvaluated: [7], dropsNotes: true, changesClasse: true });
    expect(destructiveChanges(initial, form({ competences: [{ id: 7, nom: '', code_domaine: null }] }), evaluated)).toEqual({
      removedEvaluated: [],
      dropsNotes: false,
      changesClasse: false,
    });
  });
});
