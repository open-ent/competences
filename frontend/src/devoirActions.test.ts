import { describe, expect, it } from 'vitest';

import { canEditSelection, duplicationTargets, evaluatedMessage, evaluatedSplit, splitDeletable } from './devoirActions';
import type { Viewer } from './rules';
import type { Classe, Devoir, PeriodeClasse } from './types';

const viewer = (patch: Partial<Viewer> = {}): Viewer => ({ userId: 'me', isAdmin: false, isPersEducNat: false, details: {}, today: '2026-10-09', ...patch });
const classe = (id: string, patch: Partial<Classe> = {}): Classe => ({ id, name: id, type_groupe: 0, externalId: `ext-${id}`, services: [], ...patch });
const devoir = (id: number, patch: Partial<Devoir> = {}) => ({ id, name: `D${id}`, id_groupe: 'c1', id_periode: 1, ...patch }) as Devoir;
const periode = (fin: string | null): PeriodeClasse => ({ id: 1, id_type: 1, type: 3, ordre: 1, timestamp_dt: '', timestamp_fn: '', date_fin_saisie: fin });

describe('suppression et modification selon la fin de saisie', () => {
  const classes = [classe('c1')];
  const closed = { c1: [periode('2026-10-01')] };
  const open = { c1: [periode('2026-10-20')] };

  it("la direction supprime et modifie toujours, même saisie close", () => {
    const v = viewer({ isAdmin: true });
    expect(splitDeletable([devoir(1)], closed, classes, v).uncancelable).toEqual([]);
    expect(canEditSelection([devoir(1)], closed, classes, v)).toBe(true);
  });

  it("un enseignant ne supprime plus un devoir dont la saisie est close", () => {
    const r = splitDeletable([devoir(1), devoir(2, { id_groupe: 'c2' })], { ...closed, c2: [periode('2026-12-01')] }, [...classes, classe('c2')], viewer());
    expect(r.uncancelable.map((d) => d.id)).toEqual([1]);
    expect(r.deletable.map((d) => d.id)).toEqual([2]);
  });

  it('le professeur principal garde la main sur sa classe', () => {
    const v = viewer({ details: { headTeacher: ['ext-c1'] } });
    expect(splitDeletable([devoir(1)], closed, classes, v).deletable).toHaveLength(1);
  });

  it("modifier : un seul devoir, saisie ouverte", () => {
    expect(canEditSelection([devoir(1)], open, classes, viewer())).toBe(true);
    expect(canEditSelection([devoir(1)], closed, classes, viewer())).toBe(false);
    expect(canEditSelection([devoir(1), devoir(2)], open, classes, viewer())).toBe(false);
  });
});

describe('seconde confirmation de suppression', () => {
  const ds = [devoir(1), devoir(2), devoir(3)];
  it('distingue notes et compétences évaluées', () => {
    const s = evaluatedSplit([{ id: 1, nbevalskill: 2, nbevalnum: null }, { id: 2, nbevalskill: 0, nbevalnum: 3 }, { id: 3, nbevalskill: null, nbevalnum: 0 }], ds);
    expect(s.skills.map((d) => d.id)).toEqual([1]);
    expect(s.marks.map((d) => d.id)).toEqual([2]);
  });
  it('rien à signaler : pas de seconde confirmation', () => {
    expect(evaluatedMessage({ skills: [], marks: [] })).toBeNull();
  });
  it('peu de devoirs : message détaillé avec liste ; beaucoup : message générique', () => {
    expect(evaluatedMessage({ skills: [ds[0]], marks: [ds[1]] })).toEqual({ key: 'evaluations.devoir.recaputilatif.suppression.text6', listed: true });
    const many = Array.from({ length: 16 }, (_, i) => devoir(i));
    expect(evaluatedMessage({ skills: [], marks: many })).toEqual({ key: 'evaluations.devoir.recaputilatif.suppression.text2', listed: false });
    expect(evaluatedMessage({ skills: [ds[0]], marks: [] })?.key).toBe('evaluations.devoir.recaputilatif.suppression.text4');
  });
});

describe('cibles de duplication', () => {
  const all = [classe('Zèbre'), classe('alpha'), classe('groupe-a', { type_groupe: 1 }), classe('interdite')];
  const ok = (c: Classe) => c.id !== 'interdite';
  it('sépare classes et groupes, trie, écarte les classes non valides', () => {
    const r = duplicationTargets(all, '', ok);
    expect(r.classes.map((c) => c.id)).toEqual(['alpha', 'Zèbre']);
    expect(r.groupes.map((c) => c.id)).toEqual(['groupe-a']);
  });
  it('la recherche ignore accents et casse', () => {
    expect(duplicationTargets(all, 'zebre', ok).classes.map((c) => c.id)).toEqual(['Zèbre']);
  });
});
