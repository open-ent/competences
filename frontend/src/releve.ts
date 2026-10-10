/**
 * Règles du relevé périodique (`#/releve`), portées depuis l'IHM AngularJS
 * (`display_releve.html`, `ReleveNote.sync`, `saveMoyenneFinaleEleve`, `initMoyenneFinale`,
 * `syncMoyenneAnnee`, `saveAppreciationMatierePeriodeEleve`). Le serveur calcule les moyennes —
 * de l'élève comme de la classe — ; l'interface ne fait que les afficher et les relire après
 * chaque saisie.
 */

import type { ReleveEleve, ReleveNoteRow, PeriodeClasse } from './types';

/** « Non noté » : moyenne absente faute de note. */
export const NN = 'NN';
/** Longueur maximale d'une appréciation (`MAX_LENGTH_300`). */
export const MAX_APPRECIATION = 300;

const NOTE = /^[0-9]+(\.[0-9]{1,2})?$/;

/** Affichage d'une moyenne : virgule décimale, « NN » quand elle manque. */
export function formatMoyenne(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '' || value === NN) return NN;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isNaN(n) ? String(value) : n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

/**
 * Moyenne finale affichée (`initMoyenneFinale`) : celle saisie par l'enseignant si elle existe
 * — `null` en base vaut « NN » posé à la main —, sinon la moyenne calculée.
 */
export function moyenneFinale(eleve: Pick<ReleveEleve, 'moyenne' | 'moyenneFinale'>): { value: string; isSet: boolean } {
  if (eleve.moyenneFinale === undefined) return { value: formatMoyenne(eleve.moyenne), isSet: false };
  if (eleve.moyenneFinale === null) return { value: NN, isSet: formatMoyenne(eleve.moyenne) !== NN };
  return { value: formatMoyenne(eleve.moyenneFinale), isSet: true };
}

export type MoyenneSaisie = { kind: 'set'; moyenne: number } | { kind: 'nn' } | { kind: 'reset' } | { kind: 'invalid' };

/**
 * Ce qu'une saisie de moyenne finale demande (`saveMoyenneFinaleEleve`) : une note sur 20 à deux
 * décimales au plus, « NN », ou une case vidée qui rend la main au calcul. Revenir à la moyenne
 * calculée efface aussi la moyenne saisie, comme le faisait le serveur via `delete`.
 */
export function parseMoyenneFinale(raw: string, moyenneAuto: number | null | undefined): MoyenneSaisie {
  const value = raw.trim().replace(',', '.');
  if (value === '') return { kind: 'reset' };
  if (value.toUpperCase() === NN) return { kind: 'nn' };
  if (!NOTE.test(value)) return { kind: 'invalid' };
  const moyenne = parseFloat(value);
  if (moyenne > 20) return { kind: 'invalid' };
  if (moyenneAuto !== null && moyenneAuto !== undefined && moyenneAuto === moyenne) return { kind: 'reset' };
  return { kind: 'set', moyenne };
}

/**
 * Saisie close sur la période (`isEndSaisie`) : passé le jour de fin de saisie, seuls la direction
 * et le professeur principal de la classe peuvent encore écrire. La vue « Année » n'est jamais
 * saisissable (`disabledSaisieNNoutPeriode`).
 */
export function isReleveLocked(periode: PeriodeClasse | undefined, today: string, chefOrHeadTeacher: boolean): boolean {
  if (!periode || periode.id === null) return true;
  if (chefOrHeadTeacher) return false;
  return !!periode.date_fin_saisie && today > periode.date_fin_saisie.slice(0, 10);
}

/** Une note se modifie si sa période est ouverte, ou pour la direction / le professeur principal. */
export function isNoteLocked(periode: PeriodeClasse | undefined, today: string, chefOrHeadTeacher: boolean): boolean {
  if (chefOrHeadTeacher || !periode?.date_fin_saisie) return false;
  return today > periode.date_fin_saisie.slice(0, 10);
}

/** La note d'un élève sur un devoir, dans les lignes renvoyées par le relevé. */
export function noteOf(notes: ReleveNoteRow[], eleveId: string, devoirId: number) {
  const row = notes.find((n) => n.id_eleve === eleveId && n.id_devoir === devoirId);
  return row ? { id: row.id, id_annotation: row.annotation ?? null, valeur: row.valeur } : undefined;
}

/**
 * Vue « Année » (`syncMoyenneAnnee`) : pour chaque période, la moyenne finale si elle a été
 * saisie, sinon la moyenne calculée ; l'année est la moyenne de ces valeurs. Seule l'année d'un
 * élève qui a une moyenne finale quelque part est recalculée ainsi — sinon le serveur fait foi.
 */
export function yearRow(
  eleveId: string,
  moyennes: Array<{ id_eleve: string; id_periode: number | null; moyenne: number | string | null }>,
  finales: Array<{ id_eleve: string; id_periode: number | null; moyenne: number | string | null }>,
): { byPeriode: Map<number | null, { value: string; isSet: boolean }> } {
  const own = moyennes.filter((m) => m.id_eleve === eleveId);
  const ownFinales = finales.filter((m) => m.id_eleve === eleveId && m.id_periode !== null);
  const byPeriode = new Map<number | null, { value: string; isSet: boolean }>();
  const numbers: number[] = [];
  for (const m of own.filter((x) => x.id_periode !== null)) {
    const finale = ownFinales.find((f) => f.id_periode === m.id_periode);
    const source = finale ?? m;
    byPeriode.set(m.id_periode, { value: formatMoyenne(source.moyenne), isSet: !!finale });
    const n = Number(String(source.moyenne ?? '').replace(',', '.'));
    if (source.moyenne !== null && source.moyenne !== '' && !Number.isNaN(n)) numbers.push(n);
  }
  for (const f of ownFinales) {
    if (!byPeriode.has(f.id_periode)) {
      byPeriode.set(f.id_periode, { value: formatMoyenne(f.moyenne), isSet: true });
      const n = Number(String(f.moyenne ?? '').replace(',', '.'));
      if (!Number.isNaN(n)) numbers.push(n);
    }
  }
  const server = own.find((m) => m.id_periode === null);
  if (ownFinales.length > 0 && numbers.length > 0) {
    byPeriode.set(null, { value: formatMoyenne(numbers.reduce((a, b) => a + b, 0) / numbers.length), isSet: true });
  } else {
    byPeriode.set(null, { value: formatMoyenne(server?.moyenne), isSet: false });
  }
  return { byPeriode };
}

/** Moyenne d'un élève sur une sous-matière (`getAverageSousMatiere`), « NN » à défaut. */
export function sousMatiereMoyenne(eleve: Pick<ReleveEleve, '_moyenne'>, matiereId: string, idSousMatiere: number | string): string {
  return formatMoyenne(eleve._moyenne?.[matiereId]?.[String(idSousMatiere)]?.moyenne);
}
