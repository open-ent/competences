// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import {
  allErrorsIgnored,
  archiveYears,
  canExportLsu,
  hasBlockingErrors,
  ignoreKey,
  LSU_TYPE,
  lsuBody,
  parseLsuErrors,
  parseStsIndividus,
  unheededPeriode,
} from './lsu';

const STS = `<?xml version="1.0" encoding="UTF-8"?>
<STS_EDT>
  <DONNEES>
    <INDIVIDUS>
      <INDIVIDU ID="1234" TYPE="epp">
        <NOM_USAGE>MARTIN</NOM_USAGE>
        <PRENOM>Amélie</PRENOM>
        <DATE_NAISSANCE>1980-01-02</DATE_NAISSANCE>
      </INDIVIDU>
      <INDIVIDU ID="5678" TYPE="local">
        <NOM_USAGE>DURAND</NOM_USAGE>
        <PRENOM>Paul</PRENOM>
      </INDIVIDU>
    </INDIVIDUS>
  </DONNEES>
</STS_EDT>`;

const parse = (xml: string) => parseStsIndividus(new DOMParser().parseFromString(xml, 'application/xml'));

describe('fichier STS', () => {
  it('aplatit attributs et champs de chaque individu, comme l’AngularJS', () => {
    expect(parse(STS)).toEqual([
      { ID: '1234', TYPE: 'epp', NOM_USAGE: 'MARTIN', PRENOM: 'Amélie', DATE_NAISSANCE: '1980-01-02' },
      { ID: '5678', TYPE: 'local', NOM_USAGE: 'DURAND', PRENOM: 'Paul' },
    ]);
  });

  it('un seul individu donne tout de même un tableau', () => {
    expect(parse('<STS_EDT><DONNEES><INDIVIDUS><INDIVIDU ID="1" TYPE="epp"><NOM_USAGE>A</NOM_USAGE></INDIVIDU></INDIVIDUS></DONNEES></STS_EDT>')).toEqual([
      { ID: '1', TYPE: 'epp', NOM_USAGE: 'A' },
    ]);
  });

  it('un fichier sans individus est refusé', () => {
    expect(parse('<STS_EDT><DONNEES/></STS_EDT>')).toBeNull();
    expect(parse('<autre/>')).toBeNull();
  });
});

describe('contrôle et corps de l’export', () => {
  const base = { classes: 1, responsables: 1, periodes: 0, hasSts: true };

  it('fin de cycle : classes, responsable et fichier STS suffisent', () => {
    expect(canExportLsu({ ...base, type: LSU_TYPE.BFC })).toBe(true);
    expect(canExportLsu({ ...base, type: LSU_TYPE.BFC, hasSts: false })).toBe(false);
    expect(canExportLsu({ ...base, type: LSU_TYPE.BFC, responsables: 0 })).toBe(false);
  });

  it('bilan périodique : il faut en plus une période', () => {
    expect(canExportLsu({ ...base, type: LSU_TYPE.BILAN_PERIODIQUE })).toBe(false);
    expect(canExportLsu({ ...base, type: LSU_TYPE.BILAN_PERIODIQUE, periodes: 2 })).toBe(true);
  });

  it('le corps ne porte que des identifiants, et pas de période en fin de cycle', () => {
    const p = { structureId: 's', classeIds: ['c1'], responsableIds: ['r1'], periodeTypes: [3, 4], sts: [{ ID: '1' }] };
    expect(lsuBody({ ...p, type: LSU_TYPE.BILAN_PERIODIQUE })).toEqual({
      type: '2',
      idStructure: 's',
      classes: [{ id: 'c1' }],
      responsables: [{ id: 'r1' }],
      periodes_type: [{ id_type: 3 }, { id_type: 4 }],
      stsFile: [{ ID: '1' }],
    });
    expect(lsuBody({ ...p, type: LSU_TYPE.BFC }).periodes_type).toEqual([]);
  });
});

describe('erreurs de l’export', () => {
  it('sépare erreurs générales et élèves, triés par classe puis nom', () => {
    const errors = parseLsuErrors({
      errorCode: [{ code: 'Z', libelle: 'z' }, { code: 'A', libelle: 'a' }],
      emptyDiscipline: false,
      u2: { idEleve: 'u2', lastName: 'Zola', firstName: 'É', idClass: 'c1', nameClass: '4A', errorsMessages: ['m'] },
      u1: { idEleve: 'u1', lastName: 'Abel', firstName: 'A', idClasse: 'c2', nameClass: '4B', errorsMessages: ['n'] },
      u3: { idEleve: 'u3', lastName: 'Bart', firstName: 'B', idClass: 'c1', nameClass: '4A', errorsMessages: [] },
    });
    expect(errors.codes.map((c) => c.code)).toEqual(['A', 'Z']);
    expect(errors.eleves.map((e) => e.idEleve)).toEqual(['u3', 'u2', 'u1']);
    expect(errors.message).toBeNull();
    expect(hasBlockingErrors(errors)).toBe(true);
  });

  it('« aucun élève » est une erreur générale, non bloquante au sens des élèves', () => {
    const errors = parseLsuErrors({ error: 'getEleves : no student' });
    expect(errors.message).toBe('getEleves : no student');
    expect(hasBlockingErrors(errors)).toBe(false);
  });

  it('on relance quand chaque élève est écarté pour chaque période exportée', () => {
    const eleves = parseLsuErrors({
      u1: { idEleve: 'u1', idClass: 'c1', nameClass: '4A', lastName: 'A', firstName: 'a', errorsMessages: [] },
      u2: { idEleve: 'u2', idClasse: 'c2', nameClass: '4B', lastName: 'B', firstName: 'b', errorsMessages: [] },
    }).eleves;
    const ignored = new Set([ignoreKey('u1', 'c1', 3), ignoreKey('u1', 'c1', 4), ignoreKey('u2', 'c2', 3)]);
    expect(allErrorsIgnored(eleves, [3, 4], ignored)).toBe(false);
    ignored.add(ignoreKey('u2', 'c2', 4));
    expect(allErrorsIgnored(eleves, [3, 4], ignored)).toBe(true);
    expect(allErrorsIgnored(eleves, [null], new Set([ignoreKey('u1', 'c1', null), ignoreKey('u2', 'c2', null)]))).toBe(true);
  });

  it('la période -1 (fin de cycle) part en null', () => {
    expect(unheededPeriode(-1)).toBeNull();
    expect(unheededPeriode(3)).toBe(3);
  });
});

describe('archives', () => {
  const active = { start_date: '2026-09-01', end_date: '2027-07-04', periodes: [3, 4, 5] };

  it('années archivées, la plus récente d’abord, l’année en cours signalée', () => {
    expect(archiveYears({ years: [{ id_annee: '2025' }, { id_annee: '2026' }], active_year: active }, '(Année en cours)')).toEqual([
      { id: '2026', libelle: '2026 - 2027 (Année en cours)' },
      { id: '2025', libelle: '2025 - 2026' },
    ]);
  });

  it('sans archive, l’année en cours seule', () => {
    expect(archiveYears({ years: [], active_year: active }, '(Année en cours)')).toEqual([{ id: '2026', libelle: '2026 - 2027 (Année en cours)' }]);
  });
});
