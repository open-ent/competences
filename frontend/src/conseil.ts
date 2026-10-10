/**
 * Conseil de classe, onglet « Suivi des acquis » (`#/conseil/de/classe`), porté depuis
 * `SuivisDesAcquis.getSuivisDesAcquis` : le serveur renvoie, par matière, les données de TOUTES
 * les périodes ; l'interface en extrait celles de la période choisie.
 */

import { convert, Conversion } from './suivi';

/** Une matière du suivi des acquis, telle que `GET /competences/bilan/periodique/eleve/:id` la renvoie. */
export interface AcquisRaw {
  id_matiere: string;
  libelleMatiere: string;
  idClasse: string;
  rank?: number;
  teachers?: Array<{ firstName: string; name: string; id: string }>;
  appreciations?: Array<{ id_periode: number | null; appreciationByClasse: Array<{ idClasse: string; appreciation: string }> }>;
  moyennesFinales?: Array<{ id_periode: number | null; moyenneFinale: number | string | null }>;
  moyennes?: Array<{ id: number | null; moyenne: number | null }>;
  moyennesClasse?: Array<{ id: number | null; moyenne: number | null }>;
  positionnements_auto?: Array<{ id_periode: number | null; moyenne: number | null }>;
  positionnementsFinaux?: Array<{ id_periode: number | null; positionnementFinal: number }>;
  elementsProgrammeByClasse?: Array<{ id_classe: string; texte: string }>;
}

export interface AcquisRow {
  idMatiere: string;
  libelle: string;
  idClasse: string;
  teachers: string[];
  appreciation: string;
  /** Moyenne finale si elle a été saisie, sinon la moyenne calculée, sinon « NN ». */
  moyenneEleve: number | string;
  moyenneClasse: number | string;
  /** Positionnement calculé (0 = NN) et retenu. */
  positionnementAuto: number;
  positionnement: number;
  elementsProgramme: string;
  skillsValidatedPercentage?: number;
}

const NN = 'NN';

/**
 * Ligne d'une matière pour la période (`getSuivisDesAcquis`). ⚠ Le positionnement calculé est
 * la moyenne des niveaux CONVERTIE par la table ; sans conversion possible il vaut 0, affiché
 * « NN ».
 */
export function acquisRow(raw: AcquisRaw, periode: number, table: Conversion[]): AcquisRow {
  const appreciation =
    raw.appreciations?.find((a) => a.id_periode === periode)?.appreciationByClasse?.[0]?.appreciation ?? '';
  const finale = raw.moyennesFinales?.find((m) => m.id_periode === periode);
  const moyenne = raw.moyennes?.find((m) => m.id === periode);
  const auto = raw.positionnements_auto?.find((p) => p.id_periode === periode);
  const converted = auto?.moyenne !== null && auto?.moyenne !== undefined ? convert(auto.moyenne, table) : -1;
  const positionnementAuto = converted !== -1 ? converted : 0;
  const final = raw.positionnementsFinaux?.find((p) => p.id_periode === periode);
  return {
    idMatiere: raw.id_matiere,
    libelle: raw.libelleMatiere,
    idClasse: raw.idClasse,
    teachers: (raw.teachers ?? []).map((t) => `${t.firstName?.[0] ?? ''}. ${t.name}`.trim()),
    appreciation,
    moyenneEleve: finale ? (finale.moyenneFinale ?? NN) : moyenne && moyenne.moyenne !== null ? moyenne.moyenne : NN,
    moyenneClasse: raw.moyennesClasse?.find((m) => m.id === periode)?.moyenne ?? NN,
    positionnementAuto,
    positionnement: final ? final.positionnementFinal : positionnementAuto,
    elementsProgramme: (raw.elementsProgrammeByClasse ?? []).map((e) => e.texte).filter(Boolean).join(' '),
  };
}

/**
 * Une matière sans rien pour l'élève sur la période — ni appréciation, ni moyenne, ni
 * positionnement — n'est pas montrée.
 */
export function isEmptyRow(row: AcquisRow, raw: AcquisRaw, periode: number): boolean {
  const hasFinale = !!raw.moyennesFinales?.some((m) => m.id_periode === periode);
  return row.appreciation === '' && row.moyenneEleve === NN && !hasFinale && row.positionnementAuto === 0 && row.positionnement === 0;
}

/**
 * Moyenne générale de l'élève ou de la classe sur la période, à deux décimales, « NN » à défaut.
 * Écart assumé : l'AngularJS cherchait les moyennes finales par une clé qu'elles n'ont pas (`id`
 * au lieu de `id_periode`) et retombait toujours sur la moyenne calculée ; la moyenne finale saisie
 * par l'enseignant compte ici, comme dans la ligne de la matière.
 */
export function moyenneGenerale(values: Array<number | string>): string {
  const numbers = values.map((v) => Number(String(v).replace(',', '.'))).filter((n) => !Number.isNaN(n));
  return numbers.length === 0 ? NN : (numbers.reduce((a, b) => a + b, 0) / numbers.length).toFixed(2);
}

// ── Avis, synthèses et vie scolaire ──────────────────────────────────────────

/** Un avis proposable : 1 = avis du conseil, 2 = avis d'orientation (`avis_conseil_bilan_periodique`). */
export interface Avis {
  id: number;
  libelle: string;
  type_avis: number;
  active: boolean;
  id_etablissement: string | null;
}

export interface AvisSyntheses {
  libelleAvis: Avis[];
  syntheses: Array<{ id_typeperiode: number; synthese: string }>;
  avisConseil: Array<{ id_periode: number; id_avis_conseil_bilan: number }>;
  avisOrientation: Array<{ id_periode: number; id_avis_conseil_bilan: number }>;
}

/** `filterAvis` : les avis actifs du type demandé. */
export const avisOfType = (avis: Avis[], type: 1 | 2) => avis.filter((a) => a.active && a.type_avis === type);

/** Synthèse et avis de l'élève sur une période. */
export function avisSynthesePeriode(data: AvisSyntheses, periode: number) {
  return {
    synthese: data.syntheses.find((s) => s.id_typeperiode === periode)?.synthese ?? '',
    avisConseil: data.avisConseil.find((a) => a.id_periode === periode)?.id_avis_conseil_bilan ?? null,
    avisOrientation: data.avisOrientation.find((a) => a.id_periode === periode)?.id_avis_conseil_bilan ?? null,
  };
}

/** Retards et absences d'une période (`GET /competences/eleve/evenements/:id`). */
export interface Evenement {
  id_periode: number;
  retard?: number;
  abs_just?: number;
  abs_non_just?: number;
  abs_totale_heure?: number;
  ordre?: number;
  /** Données remontées par le module Présences : non modifiables ici. */
  from_presences?: boolean;
}

export type EvenementLigne = Required<Pick<Evenement, 'retard' | 'abs_just' | 'abs_non_just' | 'abs_totale_heure'>> & { id_periode: number | null };

/**
 * `setHistoriqueEvenement` : une ligne par période de la classe (zéros à défaut), puis le total de
 * l'année (`id_periode` nul).
 */
export function evenementsHistorique(evenements: Evenement[], periodes: number[]): EvenementLigne[] {
  const lignes = periodes.map((p) => {
    const e = evenements.find((x) => x.id_periode === p);
    return {
      id_periode: p,
      retard: e?.retard ?? 0,
      abs_just: e?.abs_just ?? 0,
      abs_non_just: e?.abs_non_just ?? 0,
      abs_totale_heure: e?.abs_totale_heure ?? 0,
    };
  });
  const sum = (k: keyof Omit<EvenementLigne, 'id_periode'>) => lignes.reduce((a, l) => a + l[k], 0);
  return [...lignes, { id_periode: null, retard: sum('retard'), abs_just: sum('abs_just'), abs_non_just: sum('abs_non_just'), abs_totale_heure: sum('abs_totale_heure') }];
}

/**
 * Droits de saisie du conseil (`eval_bilan_periodique_ctl.ts`). Tout est figé dès que les bulletins
 * de la période sont publiés (`finSaisieBilan`) ; la direction et le professeur principal saisissent
 * synthèse, avis, appréciations et suivi des acquis sans le droit dédié.
 */
export function conseilRights(p: {
  published: boolean;
  chefOrHeadTeacher: boolean;
  hasService: boolean;
  workflow: {
    canSaveAppMatierePosiBilanPeriodique: boolean;
    canSaisiSyntheseBilanPeriodique: boolean;
    canUpdateAvisConseilOrientation: boolean;
    canUpdateAppreciations: boolean;
    canSaisiAppreciationCPE: boolean;
    canUpdateRetardAndAbsence: boolean;
  };
}) {
  const open = !p.published;
  const w = p.workflow;
  return {
    suiviAcquis: open && ((w.canSaveAppMatierePosiBilanPeriodique && p.hasService) || p.chefOrHeadTeacher),
    synthese: open && (w.canSaisiSyntheseBilanPeriodique || p.chefOrHeadTeacher),
    avis: open && (w.canUpdateAvisConseilOrientation || p.chefOrHeadTeacher),
    appreciationsProjets: open && (w.canUpdateAppreciations || p.chefOrHeadTeacher),
    appreciationCPE: open && w.canSaisiAppreciationCPE,
    vieScolaire: open && w.canUpdateRetardAndAbsence,
  };
}
