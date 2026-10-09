import { describe, expect, it } from 'vitest';

import {
  attachServices,
  canOpenDevoir,
  classesWithDevoirs,
  EMPTY_SEARCH,
  filterDevoirs,
  formatDate,
  isChefEtabOrHeadTeacher,
  isNotDone,
  isSubstitutionActive,
  isValidClasse,
  isValidDevoir,
  matieresForClasse,
  periodesWithDevoirs,
  sortDevoirs,
  userHasService,
  Viewer,
} from './rules';
import type { Classe, Devoir, Matiere, Service, TypePeriode } from './types';

const ME = 'me';
const viewer = (patch: Partial<Viewer> = {}): Viewer => ({
  userId: ME,
  isAdmin: false,
  isPersEducNat: false,
  details: {},
  today: '2026-10-09',
  ...patch,
});

const service = (patch: Partial<Service> = {}): Service => ({
  id_enseignant: ME,
  id_matiere: 'maths',
  id_groupe: 'c1',
  evaluable: true,
  ...patch,
});

const classe = (id: string, services: Service[] | null, patch: Partial<Classe> = {}): Classe => ({
  id,
  name: id.toUpperCase(),
  type_groupe: 0,
  externalId: `ext-${id}`,
  services,
  ...patch,
});

const devoir = (patch: Partial<Devoir> = {}): Devoir => ({
  id: 1,
  name: 'Contrôle',
  owner: ME,
  id_groupe: 'c1',
  is_evaluated: true,
  id_sousmatiere: null,
  id_periode: 1,
  id_type: 1,
  id_etablissement: 's',
  diviseur: 20,
  id_matiere: 'maths',
  coefficient: 1,
  ramener_sur: false,
  date: '2026-10-01',
  nbcompetences: 0,
  ...patch,
});

describe('profils', () => {
  it('le professeur principal se reconnaît à l’identifiant EXTERNE de la classe', () => {
    const c = classe('c1', []);
    expect(isChefEtabOrHeadTeacher(viewer({ details: { headTeacherManual: ['ext-c1'] } }), c)).toBe(true);
    expect(isChefEtabOrHeadTeacher(viewer({ details: { headTeacher: ['c1'] } }), c)).toBe(false);
  });

  it('sans classe, seul le droit de direction compte', () => {
    expect(isChefEtabOrHeadTeacher(viewer({ details: { headTeacher: ['ext-c1'] } }))).toBe(false);
    expect(isChefEtabOrHeadTeacher(viewer({ isAdmin: true }))).toBe(true);
  });
});

describe('services', () => {
  it('une suppléance compte à la journée, bornes incluses', () => {
    expect(isSubstitutionActive('2026-10-09', '2026-10-09T00:00:00', '2026-10-09')).toBe(true);
    expect(isSubstitutionActive('2026-10-10', '2026-12-01', '2026-10-09')).toBe(false);
    expect(isSubstitutionActive(undefined, '2026-12-01', '2026-10-09')).toBe(false);
  });

  it('rattache les services à un groupe seul ou à une liste de groupes', () => {
    const [c1, c2, c3] = attachServices(
      [
        { id: 'c1', name: 'A', type_groupe: 0 },
        { id: 'c2', name: 'B', type_groupe: 0 },
        { id: 'c3', name: 'C', type_groupe: 0 },
      ],
      [service({ id_groupe: 'c1' }), service({ id_groupe: undefined, id_groups: ['c1', 'c2'] })],
    );
    expect(c1.services).toHaveLength(2);
    expect(c2.services).toHaveLength(1);
    expect(c3.services).toBeNull();
  });

  it('un service non évaluable ne donne pas accès à la classe', () => {
    const classes = [classe('c1', [service({ evaluable: false })])];
    expect(userHasService(classes[0], viewer())).toBe(false);
    expect(isValidClasse('c1', undefined, classes, viewer())).toBe(false);
  });

  it('co-enseignant et remplaçant à date sont reconnus, sur la bonne matière', () => {
    const co = service({ id_enseignant: 'other', coTeachers: [{ second_teacher_id: ME, subject_id: 'maths' }] });
    const sub = service({
      id_enseignant: 'other',
      substituteTeachers: [{ second_teacher_id: ME, subject_id: 'maths', start_date: '2026-09-01', entered_end_date: '2026-10-31' }],
    });
    expect(userHasService(classe('c1', [co]), viewer(), 'maths')).toBe(true);
    expect(userHasService(classe('c1', [co]), viewer(), 'svt')).toBe(false);
    expect(userHasService(classe('c1', [sub]), viewer(), 'maths')).toBe(true);
    expect(userHasService(classe('c1', [sub]), viewer({ today: '2026-11-01' }), 'maths')).toBe(false);
  });
});

describe('isValidDevoir ≠ isValidClasse', () => {
  it('une évaluation reste visible sur un service NON évaluable (écart repris de l’AngularJS)', () => {
    const classes = [classe('c1', [service({ evaluable: false })])];
    expect(isValidDevoir(devoir(), classes, viewer())).toBe(true);
    expect(isValidClasse('c1', 'maths', classes, viewer())).toBe(false);
  });

  it('le personnel d’éducation voit toute classe évaluable, mais pas les évaluations des autres', () => {
    const classes = [classe('c1', [service({ id_enseignant: 'other' })])];
    expect(isValidClasse('c1', undefined, classes, viewer({ isPersEducNat: true }))).toBe(true);
    expect(isValidDevoir(devoir(), classes, viewer({ isPersEducNat: true }))).toBe(false);
  });

  it('la direction voit toutes les évaluations des classes qui ont un service', () => {
    const classes = [classe('c1', [service({ id_enseignant: 'other' })]), classe('c2', null)];
    expect(isValidDevoir(devoir(), classes, viewer({ isAdmin: true }))).toBe(true);
    expect(isValidDevoir(devoir({ id_groupe: 'c2' }), classes, viewer({ isAdmin: true }))).toBe(false);
  });
});

describe('matières d’une classe', () => {
  const maths: Matiere = { id: 'maths', name: 'Maths', externalId: 'M' };
  const sansCode: Matiere = { id: 'x', name: 'Sans code', externalId: null };

  it('écarte une matière sans identifiant externe', () => {
    const classes = [classe('c1', [service(), service({ id_matiere: 'x' })])];
    expect(matieresForClasse([maths, sansCode], 'c1', classes, viewer()).map((m) => m.id)).toEqual(['maths']);
  });

  it('respecte la restriction de la matière à certaines classes', () => {
    const restricted: Matiere = { ...maths, libelleClasses: ['ext-autre'] };
    const classes = [classe('c1', [service()])];
    expect(matieresForClasse([restricted], 'c1', classes, viewer())).toHaveLength(0);
  });

  it('sans classe, cherche dans toutes les classes', () => {
    const classes = [classe('c1', []), classe('c2', [service({ id_groupe: 'c2' })])];
    expect(matieresForClasse([maths], null, classes, viewer())).toHaveLength(1);
  });

  it('une ligne n’ouvre la saisie que si l’usager évalue une matière dans la classe', () => {
    const classes = [classe('c1', [service()]), classe('c2', [service({ id_enseignant: 'other' })])];
    expect(canOpenDevoir('c1', [maths], classes, viewer())).toBe(true);
    expect(canOpenDevoir('c2', [maths], classes, viewer())).toBe(false);
    expect(canOpenDevoir('inconnue', [maths], classes, viewer())).toBe(false);
  });
});

describe('filtres de liste', () => {
  const list = [
    devoir({ id: 1, name: 'Contrôle (bis', id_type: 2 }),
    devoir({ id: 2, name: 'DM', id_groupe: 'c2', owner: 'other', id_periode: 2 }),
    devoir({ id: 3, name: 'Interro', id_sousmatiere: 7 }),
  ];

  it('cherche le nom comme du texte : une parenthèse ne vide plus la liste', () => {
    expect(filterDevoirs(list, { ...EMPTY_SEARCH, name: 'contrôle (' }).map((d) => d.id)).toEqual([1]);
  });

  it('combine les critères', () => {
    expect(filterDevoirs(list, { ...EMPTY_SEARCH, classe: 'c1', periode: 1 }).map((d) => d.id)).toEqual([1, 3]);
    expect(filterDevoirs(list, { ...EMPTY_SEARCH, enseignant: 'other' }).map((d) => d.id)).toEqual([2]);
    expect(filterDevoirs(list, { ...EMPTY_SEARCH, sousmatiere: 7 }).map((d) => d.id)).toEqual([3]);
    expect(filterDevoirs(list, { ...EMPTY_SEARCH, type: 2 }).map((d) => d.id)).toEqual([1]);
  });

  it('trie par date décroissante puis par nom de classe', () => {
    const sorted = sortDevoirs([
      { ...devoir({ id: 1, date: '2026-09-01' }), nameClass: 'B' },
      { ...devoir({ id: 2, date: '2026-10-01' }), nameClass: 'B' },
      { ...devoir({ id: 3, date: '2026-10-01' }), nameClass: 'A' },
    ]);
    expect(sorted.map((d) => d.id)).toEqual([3, 2, 1]);
  });

  it('ne propose que les classes portant une évaluation que l’usager y évalue', () => {
    const classes = [classe('c1', [service()]), classe('c2', [service({ id_groupe: 'c2' })])];
    expect(classesWithDevoirs(classes, [devoir()], viewer()).map((c) => c.id)).toEqual(['c1']);
  });
});

describe('périodes proposées', () => {
  const periodes: TypePeriode[] = [
    { id: 1, type: 3, ordre: 1 },
    { id: 2, type: 3, ordre: 2 },
    { id: 4, type: 2, ordre: 1 },
    { id: null, type: 0 },
  ];

  it('une évaluation au 1er trimestre fait proposer TOUS les trimestres, plus l’année', () => {
    const kept = periodesWithDevoirs(periodes, [devoir({ id_periode: 1 })], null);
    expect(kept.map((p) => p.id)).toEqual([1, 2, null]);
  });

  it('se restreint aux évaluations de la classe choisie', () => {
    const kept = periodesWithDevoirs(periodes, [devoir({ id_periode: 4, id_groupe: 'c2' })], 'c1');
    expect(kept.map((p) => p.id)).toEqual([null]);
  });
});

describe('évaluations non terminées', () => {
  it('reprend la comparaison de JavaScript : null retenu, absent écarté', () => {
    expect(isNotDone({ percent: 40 })).toBe(true);
    expect(isNotDone({ percent: 100 })).toBe(false);
    expect(isNotDone({ percent: null })).toBe(true);
    expect(isNotDone({})).toBe(false);
  });
});

describe('formatDate', () => {
  it('formate une date seule sans décalage de fuseau', () => {
    expect(formatDate('2026-10-01')).toBe('01/10/2026');
    expect(formatDate('2026-10-01T23:30:00.000')).toBe('01/10/2026');
    expect(formatDate(null)).toBe('');
  });
});
