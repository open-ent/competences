/**
 * Export du relevé périodique (`ReleveNote.export`, `formateHeaderAndColumn`,
 * `addColumnForExportCsv`, `setAverageClasse`) : options communes au PDF (produit par le serveur)
 * et au CSV (composé ici à partir des données que le serveur renvoie).
 */

export interface ReleveExportOptions {
  fileType: 'pdf' | 'csv';
  appreciation: boolean;
  averageFinal: boolean;
  averageAuto: boolean;
  positionnementFinal: boolean;
  appreciationClasse: boolean;
  moyenneClasse: boolean;
  /** CSV seulement : une colonne par évaluation, avec la moyenne retenue. */
  withNotes: boolean;
  /** CSV seulement : moyennes et appréciations des périodes précédentes. */
  previousAverages: boolean;
  previousAppreciations: boolean;
  sousMatieres: { moyennes: Record<number, boolean>; positionnements_auto: Record<number, boolean> };
}

export const defaultReleveExportOptions = (sousMatiereIds: number[]): ReleveExportOptions => ({
  fileType: 'pdf',
  appreciation: true,
  averageFinal: true,
  averageAuto: true,
  positionnementFinal: true,
  appreciationClasse: true,
  moyenneClasse: true,
  withNotes: false,
  previousAverages: false,
  previousAppreciations: false,
  sousMatieres: {
    moyennes: Object.fromEntries(sousMatiereIds.map((id) => [id, true])),
    positionnements_auto: Object.fromEntries(sousMatiereIds.map((id) => [id, true])),
  },
});

/** Ces options n'existent qu'en CSV (`IsSpecificOptionsCsv`). */
export const csvOnly = (o: ReleveExportOptions) => o.withNotes || o.previousAverages || o.previousAppreciations;

/**
 * Corps de `POST /competences/releve/export`. `colspan` et `moyspan` dimensionnent les colonnes du
 * PDF : nombre d'options cochées (moins une) et de colonnes de positionnement et d'appréciation.
 */
export function releveExportBody(
  o: ReleveExportOptions,
  ctx: { idMatiere: string; idClasse: string; idEtablissement: string; idPeriode: number | null; typeClasse: number; classeName: string; matiere: string },
) {
  const trues = (r: Record<number, boolean>) => Object.values(r).filter(Boolean).length;
  const flags = [o.appreciation, o.averageFinal, o.averageAuto, o.positionnementFinal, o.appreciationClasse, o.moyenneClasse, o.withNotes, o.previousAverages, o.previousAppreciations];
  const colspan = flags.filter(Boolean).length + trues(o.sousMatieres.moyennes) + trues(o.sousMatieres.positionnements_auto);
  const moyspan = trues(o.sousMatieres.positionnements_auto) + (o.positionnementFinal ? 1 : 0) + (o.appreciation ? 1 : 0);
  return {
    idMatiere: ctx.idMatiere,
    idClasse: ctx.idClasse,
    idEtablissement: ctx.idEtablissement,
    idPeriode: ctx.idPeriode,
    ...o,
    typeClasse: ctx.typeClasse,
    classeName: ctx.classeName,
    matiere: ctx.matiere,
    colspan: colspan - 1,
    moyspan,
  };
}

/** Réponse CSV du serveur (champs lus par l'AngularJS). */
export interface ReleveExportData {
  eleves: Array<
    Record<string, unknown> & {
      id: string;
      displayName?: string;
      moyenne?: unknown;
      moyenneFinale?: unknown;
      positionnement?: unknown;
      appreciation_matiere_periode?: string;
      sousMatieres?: {
        moyennes?: Array<{ id_sousmatiere: number; moyenne?: unknown; print?: boolean }>;
        positionnements_auto?: Array<{ id_sousmatiere: number; positionnement?: unknown; printPosi?: boolean }>;
      };
      finalAverages?: Array<{ id_periode: number; moyenne: unknown }>;
      averages?: Array<{ id_periode: number; moyenne: unknown }>;
      previousAppreciations?: Array<{ id_periode: number; appreciation_matiere_periode: string | null }>;
    }
  >;
  notes?: Array<{ id_devoir: number; id_eleve: string; valeur: string | null; annotation: number | null }>;
  _moyenne_classe?: Record<string, { moyenne?: unknown } | null>;
  moyenneClasseSousMat?: Array<{ _moyenne: unknown; print?: boolean }>;
  appreciation_classe?: { appreciation?: string };
}

export interface CsvContext {
  t: (key: string) => string;
  devoirs: Array<{ id: number; name: string }>;
  annotationOf: (id: number | null) => string;
  sousMatieres: Array<{ id_type_sousmatiere: number; libelle: string }>;
  /** Périodes antérieures à celle exportée (`getPreviousPeriod`). */
  previous: Array<{ id_type: number; type: number; ordre: number }>;
}

const cell = (v: unknown) => (v === undefined || v === null ? ' ' : String(v).replace(/\n/g, ' '));

/** Le CSV du relevé, séparateur « ; », précédé de la marque d'ordre des octets pour Excel. */
export function releveCsv(o: ReleveExportOptions, data: ReleveExportData, ctx: CsvContext): string {
  const header: string[] = [ctx.t('students')];
  if (o.withNotes) header.push(...ctx.devoirs.map((d) => d.name));
  if (o.averageAuto) header.push(ctx.t('average.auto'));
  if (o.averageFinal) header.push(ctx.t('average.final'));
  if (o.withNotes) header.push(ctx.t('average'));
  const sousMoy = ctx.sousMatieres.filter((s) => o.sousMatieres.moyennes[s.id_type_sousmatiere]);
  header.push(...sousMoy.map((s) => `${ctx.t('average')} ${s.libelle}`));
  if (o.positionnementFinal) header.push(ctx.t('evaluations.releve.positionnement'));
  const sousPos = ctx.sousMatieres.filter((s) => o.sousMatieres.positionnements_auto[s.id_type_sousmatiere]);
  header.push(...sousPos.map((s) => `${ctx.t('evaluations.releve.positionnement')} ${s.libelle}`));
  if (o.appreciation) header.push(ctx.t('viescolaire.utils.appreciations'));
  const initiale = (type: number) => ctx.t(`viescolaire.periode.${type}`).charAt(0);
  for (const p of ctx.previous) {
    if (o.previousAverages) header.push(`${ctx.t('average')}${initiale(p.type)}${p.ordre}`);
    if (o.previousAppreciations) header.push(`${ctx.t('viescolaire.utils.appreciations')} ${initiale(p.type)}${p.ordre}`);
  }

  const lines = data.eleves.map((e) => {
    const row: string[] = [cell(e.displayName)];
    const finale = e.moyenneFinale === null ? 'NN' : e.moyenneFinale;
    if (o.withNotes)
      for (const d of ctx.devoirs) {
        const n = (data.notes ?? []).find((x) => x.id_devoir === d.id && x.id_eleve === e.id);
        row.push(n ? (n.valeur !== null ? n.valeur : ctx.annotationOf(n.annotation)) : '');
      }
    if (o.averageAuto) row.push(cell(e.moyenne));
    if (o.averageFinal) row.push(cell(finale));
    if (o.withNotes) row.push(cell(finale));
    for (const s of sousMoy) row.push(cell(e.sousMatieres?.moyennes?.find((x) => x.id_sousmatiere === s.id_type_sousmatiere)?.moyenne));
    if (o.positionnementFinal) row.push(cell(e.positionnement));
    for (const s of sousPos) row.push(cell(e.sousMatieres?.positionnements_auto?.find((x) => x.id_sousmatiere === s.id_type_sousmatiere)?.positionnement));
    if (o.appreciation) row.push(cell(e.appreciation_matiere_periode));
    for (const p of ctx.previous) {
      if (o.previousAverages) {
        const finalAvg = e.finalAverages?.find((a) => a.id_periode === p.id_type);
        const moy = finalAvg ? (finalAvg.moyenne === null ? 'NN' : finalAvg.moyenne) : e.averages?.find((a) => a.id_periode === p.id_type)?.moyenne;
        row.push(moy === undefined || moy === null ? '' : cell(moy));
      }
      if (o.previousAppreciations) row.push(cell(e.previousAppreciations?.find((a) => a.id_periode === p.id_type)?.appreciation_matiere_periode ?? ''));
    }
    return row.join(';');
  });

  // ⚠ L'AngularJS composait la ligne de moyenne de classe dans une copie de la chaîne : elle
  // n'apparaissait jamais. Elle est ajoutée ici, comme l'option l'annonce.
  if (o.moyenneClasse) {
    const classe = data._moyenne_classe;
    const row = [ctx.t('average.class')];
    if (o.averageAuto) row.push(cell(classe?.['null']?.moyenne ?? ''));
    if (o.averageFinal) row.push(cell(classe?.['nullFinal']?.moyenne ?? ''));
    for (const s of data.moyenneClasseSousMat ?? []) if (s.print) row.push(cell(s._moyenne));
    lines.push(row.join(';'));
  }
  if (o.appreciationClasse) lines.push(`${ctx.t('evaluations.releve.appreciation.classe')};${cell(data.appreciation_classe?.appreciation ?? '')}`);
  return `﻿${header.join('; ')}\r\n${lines.join('\r\n')}\r\n`;
}
