/**
 * Export LSU (`#/export`), porté depuis `exports.html`, `eval_export_controller.ts`, `LSU.ts`,
 * `ErrorLSU.ts`, `STSFile.ts` et `xmlToJson.ts`.
 */

/** Type d'export, envoyé en chaîne comme le faisait l'AngularJS (`LSU_TYPE_EXPORT`). */
export const LSU_TYPE = { BFC: '1', BILAN_PERIODIQUE: '2' } as const;
export type LsuType = (typeof LSU_TYPE)[keyof typeof LSU_TYPE];

// ── Fichier STS ───────────────────────────────────────────────────────────────

type XmlJson = { '@attributes'?: Record<string, string>; '#text'?: unknown } & Record<string, unknown>;

/** `xmlToJson` de l'AngularJS, à l'identique : le serveur et les fichiers déjà enregistrés en dépendent. */
function xmlToJson(xml: Node): XmlJson | string {
  let obj: XmlJson | string = {};
  if (xml.nodeType === 1) {
    const element = xml as Element;
    if (element.attributes.length > 0) {
      const attributes: Record<string, string> = {};
      for (let j = 0; j < element.attributes.length; j++) {
        const attribute = element.attributes.item(j)!;
        attributes[attribute.nodeName] = attribute.nodeValue ?? '';
      }
      obj['@attributes'] = attributes;
    }
  } else if (xml.nodeType === 3) {
    obj = xml.nodeValue ?? '';
  }
  if (typeof obj !== 'string' && xml.hasChildNodes()) {
    for (let i = 0; i < xml.childNodes.length; i++) {
      const item = xml.childNodes.item(i);
      const name = item.nodeName;
      if (obj[name] === undefined) obj[name] = xmlToJson(item);
      else {
        if (!Array.isArray(obj[name])) obj[name] = [obj[name]];
        (obj[name] as unknown[]).push(xmlToJson(item));
      }
    }
  }
  return obj;
}

/** `cleanJson` : attributs et nœuds texte aplatis en propriétés (`ID`, `TYPE`, `NOM_USAGE`…). */
function cleanJson(array: XmlJson[]): Record<string, unknown>[] {
  return array.map((obj) => {
    const result: Record<string, unknown> = { ...(obj['@attributes'] ?? {}) };
    const rest: Record<string, unknown> = { ...obj };
    delete rest['@attributes'];
    delete rest['#text'];
    for (const [key, value] of Object.entries(rest)) {
      const node = value as XmlJson;
      if (Array.isArray(node['#text'])) {
        const nested = { ...node };
        delete nested['#text'];
        result[key] = cleanJson(Object.values(nested) as XmlJson[]);
      } else result[key] = node['#text'];
    }
    return result;
  });
}

/**
 * Les individus d'un export STS-Web (`STS_EDT/DONNEES/INDIVIDUS/INDIVIDU`), tels que le serveur
 * les attend : il y apparie chaque enseignant (nom d'usage, prénom, date de naissance) pour
 * reprendre son identifiant STS et son type. `null` si le fichier n'en contient pas.
 */
export function parseStsIndividus(doc: Document): Record<string, unknown>[] | null {
  const root = xmlToJson(doc) as Record<string, any>;
  let individus = root?.STS_EDT?.DONNEES?.INDIVIDUS?.INDIVIDU;
  if (!individus) return null;
  if (!Array.isArray(individus)) individus = [individus];
  return cleanJson(individus);
}

export interface StsFile {
  id: number;
  name_file: string;
  creation_date: string;
  /** Contenu enregistré : les individus, sérialisés en JSON. */
  content: string;
}

// ── Contrôles avant export ────────────────────────────────────────────────────

/** `controleExportLSU`, à l'endroit : l'export est-il possible ? */
export function canExportLsu(p: { type: LsuType; classes: number; responsables: number; periodes: number; hasSts: boolean }): boolean {
  if (!p.hasSts || p.classes === 0 || p.responsables === 0) return false;
  return p.type === LSU_TYPE.BFC || p.periodes > 0;
}

/** Le corps de `POST /competences/exportLSU/lsu` : le serveur ne lit que les identifiants. */
export function lsuBody(p: {
  type: LsuType;
  structureId: string;
  classeIds: string[];
  responsableIds: string[];
  periodeTypes: number[];
  sts: unknown[];
}) {
  return {
    type: p.type,
    idStructure: p.structureId,
    classes: p.classeIds.map((id) => ({ id })),
    responsables: p.responsableIds.map((id) => ({ id })),
    periodes_type: p.type === LSU_TYPE.BILAN_PERIODIQUE ? p.periodeTypes.map((id_type) => ({ id_type })) : [],
    stsFile: p.sts,
  };
}

// ── Erreurs de l'export ───────────────────────────────────────────────────────

export interface ErrorEleve {
  idEleve: string;
  lastName: string;
  firstName: string;
  nameClass: string;
  /** `idClass` pour la plupart des erreurs, `idClasse` pour l'élève inscrit dans plusieurs classes. */
  idClass?: string;
  idClasse?: string;
  errorsMessages: string[];
}

/** Classe d'un élève en erreur — l'AngularJS ne lisait que `idClasse` et perdait les autres. */
export const errorClasse = (e: ErrorEleve) => e.idClasse ?? e.idClass ?? '';

export interface EpiTeachersError {
  name: string;
  intervenantsMatieres?: Array<{ intervenant?: { displayName?: string }; matiere?: { name?: string } }>;
  groupes?: Array<{ name: string }>;
}

export interface LsuErrors {
  eleves: ErrorEleve[];
  codes: Array<{ code: string; libelle: string }>;
  emptyDiscipline: boolean;
  epiTeachers: EpiTeachersError[];
  /** Erreur générale (`error`), par exemple « getEleves : no student ». */
  message: string | null;
}

/** `ErrorsLSU.setErrorsLSU` : le corps d'un 400 mêle erreurs générales et une entrée par élève. */
export function parseLsuErrors(body: Record<string, unknown>): LsuErrors {
  const { errorCode, emptyDiscipline, error, errorEPITeachers, ...eleves } = body;
  const codes = Array.isArray(errorCode) ? (errorCode as LsuErrors['codes']) : [];
  return {
    codes: [...codes].sort((a, b) => String(a.code).localeCompare(String(b.code))),
    emptyDiscipline: emptyDiscipline === true,
    epiTeachers: Array.isArray(errorEPITeachers) ? (errorEPITeachers as EpiTeachersError[]) : [],
    message: error === undefined || error === null ? null : String(error),
    eleves: (Object.values(eleves) as ErrorEleve[])
      .filter((e) => e && typeof e === 'object' && 'idEleve' in e)
      .sort((a, b) => (a.nameClass ?? '').localeCompare(b.nameClass ?? '') || (a.lastName ?? '').localeCompare(b.lastName ?? '')),
  };
}

export const hasBlockingErrors = (e: LsuErrors) => e.eleves.length > 0 || e.codes.length > 0 || e.emptyDiscipline || e.epiTeachers.length > 0;

export const NO_STUDENT_ERROR = 'getEleves : no student';

// ── Élèves ignorés ────────────────────────────────────────────────────────────

export interface UnheededStudent {
  idEleve: string;
  lastName: string;
  firstName: string;
  idClasse: string;
  classeName: string;
  ignoredInfos: Array<{ id_periode: number; id_classe: string }>;
}

/**
 * Période d'un ignoré, telle que le serveur l'attend : `-1` (export de fin de cycle) devient
 * `null` (`addUnheededStudents`/`remUnheededStudents`).
 */
export const unheededPeriode = (idPeriode: number | null) => (idPeriode === -1 ? null : idPeriode);

/** Clé d'une case « ignorer » : un élève, dans une classe, pour une période (`null` = le cycle). */
export const ignoreKey = (idEleve: string, idClasse: string, periode: number | null) => `${idEleve}|${idClasse}|${periode ?? 'cycle'}`;

/**
 * `controleAllIgnored`, à l'endroit : on ne peut relancer l'export qu'une fois chaque élève en
 * erreur écarté pour chaque période exportée (pour le cycle en fin de cycle).
 */
export function allErrorsIgnored(eleves: ErrorEleve[], periodes: Array<number | null>, ignored: Set<string>) {
  return eleves.every((e) => periodes.every((p) => ignored.has(ignoreKey(e.idEleve, errorClasse(e), p))));
}

// ── Archives ──────────────────────────────────────────────────────────────────

export interface ArchiveYears {
  years?: Array<{ id_annee: string }>;
  active_year: { start_date: string; end_date: string; periodes: number[] };
}

/** `getYearsAndPeriodes` : années archivées, la plus récente d'abord, l'année en cours signalée. */
export function archiveYears(data: ArchiveYears, currentLabel: string): Array<{ id: string; libelle: string }> {
  const start = data.active_year.start_date.slice(0, 4);
  const end = data.active_year.end_date.slice(0, 4);
  if (!data.years || data.years.length === 0) return [{ id: start, libelle: `${start} - ${end} ${currentLabel}` }];
  return data.years
    .map((y) => {
      const next = String(Number(y.id_annee) + 1);
      const current = y.id_annee === start && next === end;
      return { id: y.id_annee, libelle: `${y.id_annee} - ${next}${current ? ` ${currentLabel}` : ''}` };
    })
    .sort((a, b) => Number(b.id) - Number(a.id));
}
