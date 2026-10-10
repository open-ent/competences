/**
 * Relevé de notes de l'élève (`#/releve` côté élèves et parents), porté depuis
 * `eval_parent_releve_ctrl.ts`, `releve_notes.html` et `utils/functions/average.ts`
 * (`getMoyenne`, `getSumAndCoeff`, `setSubSubjectAndSubjectAverages`, `setOverrideAverage`).
 */

import type { FamilyDevoir } from './family';
import type { Service } from './types';

/** Moyenne posée par l'enseignant pour l'élève (`GET /competences/eleve/:id/moyenneFinale`). */
export interface MoyenneFinale {
  id_matiere: string;
  id_periode?: number;
  moyenne: string | number | null;
}

/** Coefficient d'une sous-matière pour un enseignant (`GET /competences/subtopics/services/:idStructure`). */
export interface SubTopicService {
  id_teacher: string;
  id_group: string;
  id_topic: string;
  id_subtopic: number | string;
  coefficient: number;
}

const DIVISEUR_M = 20;
/** `NumberUtils.roundUpTenth` : arrondi au dixième le plus proche. */
export const roundTenth = (n: number) => Math.round(n * 10) / 10;

/**
 * `getSumAndCoeff` : somme pondérée et total des coefficients, sur 20. Une note « ramenée sur 20 »
 * pèse son coefficient ; une note qui ne l'est pas pèse coefficient × diviseur / 20.
 * `null` sans note comptée.
 */
export function sumAndCoeff(devoirs: FamilyDevoir[]): [number, number] | null {
  let sum = 0;
  let coeff = 0;
  let total = 0;
  let has = false;
  for (const d of devoirs) {
    if (!d.note || !d.coefficient || !d.diviseur) continue;
    has = true;
    const note = parseFloat(d.note);
    const c = parseFloat(String(d.coefficient));
    const div = Number(d.diviseur);
    if (!d.ramener_sur) {
      coeff += (c * div) / DIVISEUR_M;
      sum += note * c;
    } else if (c !== 0) {
      sum += (note * DIVISEUR_M * c) / div;
      coeff += c;
    }
    total += c;
  }
  return has && total !== 0 ? [sum, coeff] : null;
}

/** `getMoyenne` : moyenne sur 20 des notes non formatives, arrondie au dixième ; « NN » sans note. */
export function moyenne(devoirs: FamilyDevoir[]): number | 'NN' {
  const r = sumAndCoeff(devoirs.filter((d) => !d.formative));
  if (!r || r[1] === 0) return 'NN';
  return roundTenth(r[0] / r[1]);
}

export interface SousMatiereLigne {
  id: number;
  libelle: string;
  devoirs: FamilyDevoir[];
  /** `''` quand la sous-matière n'a aucun devoir, « NN » sans note. */
  moyenne: number | 'NN' | '';
}

export interface MatiereLigne {
  id: string;
  name: string;
  enseignants: string[];
  devoirs: FamilyDevoir[];
  sousMatieres: SousMatiereLigne[];
  /** Moyenne affichée : celle posée par l'enseignant si elle existe, sinon la calculée. */
  moyenne: number | string;
}

/**
 * Coefficient d'une sous-matière pour les devoirs d'un enseignant : celui qu'il a fixé, ou celui
 * du titulaire dont il est co-enseignant ou remplaçant dans la classe ; 1 par défaut.
 */
function subTopicCoefficient(
  matiereId: string,
  sousMatiereId: number,
  owner: string,
  subTopics: SubTopicService[],
  services: Service[],
  classeId: string,
): number | undefined {
  const found = subTopics.find(
    (s) =>
      Number(s.id_subtopic) === sousMatiereId &&
      s.id_topic === matiereId &&
      (s.id_teacher === owner ||
        services.some((service) =>
          [...(service.coTeachers ?? []), ...(service.substituteTeachers ?? [])].some(
            (t) => t.group_id === classeId && t.subject_id === matiereId && t.second_teacher_id === owner && t.main_teacher_id === s.id_teacher,
          ),
        )),
  );
  return found?.coefficient;
}

/**
 * Moyennes d'une matière à sous-matières (`setSubSubjectAndSubjectAverages`) : par sous-matière,
 * la moyenne de tous ses devoirs ; pour la matière, la moyenne des sous-matières pondérée par leur
 * coefficient. ⚠ Comme l'AngularJS, le coefficient retenu est celui du DERNIER enseignant parcouru.
 */
export function sousMatiereMoyennes(
  matiereId: string,
  sousMatieres: Array<{ id_type_sousmatiere: number; libelle: string }>,
  devoirs: FamilyDevoir[],
  subTopics: SubTopicService[],
  services: Service[],
  classeId: string,
): { lignes: SousMatiereLigne[]; moyenne: number | '' } {
  let sum = 0;
  let coeffs = 0;
  const lignes = sousMatieres.map((sm) => {
    const own = devoirs.filter((d) => Number(d.id_sousmatiere) === sm.id_type_sousmatiere);
    if (own.length === 0) return { id: sm.id_type_sousmatiere, libelle: sm.libelle, devoirs: own, moyenne: '' as const };
    let coefficient = 1;
    let s = 0;
    let c = 0;
    for (const owner of new Set(own.map((d) => d.owner))) {
      coefficient = subTopicCoefficient(matiereId, sm.id_type_sousmatiere, owner, subTopics, services, classeId) ?? coefficient;
      const r = sumAndCoeff(own.filter((d) => d.owner === owner));
      if (r) {
        s += r[0];
        c += r[1];
      }
    }
    if (c === 0) return { id: sm.id_type_sousmatiere, libelle: sm.libelle, devoirs: own, moyenne: 'NN' as const };
    sum += (s / c) * coefficient;
    coeffs += coefficient;
    return { id: sm.id_type_sousmatiere, libelle: sm.libelle, devoirs: own, moyenne: roundTenth(s / c) };
  });
  return { lignes, moyenne: coeffs !== 0 ? roundTenth(sum / coeffs) : '' };
}

/** Un devoir figure au relevé s'il est noté et porte une note ou une annotation (`isEvaluated`). */
export const isReleveDevoir = (d: FamilyDevoir) => !!d.is_evaluated && (d.note !== undefined || d.annotation !== undefined);

/**
 * Lignes du relevé : les matières où l'élève a une note — ou une moyenne posée par l'enseignant —,
 * dans l'ordre alphabétique, avec leurs devoirs et leur moyenne.
 */
export function releveLignes(p: {
  devoirs: FamilyDevoir[];
  matieres: Array<{ id: string; name: string; sous_matieres?: Array<{ id_type_sousmatiere: number; libelle: string }> }>;
  finales: MoyenneFinale[];
  subTopics: SubTopicService[];
  services: Service[];
  classeId: string;
  enseignantsOf: (matiereId: string) => string[];
}): MatiereLigne[] {
  const withNote = new Set(p.devoirs.filter((d) => d.note !== undefined).map((d) => d.id_matiere));
  const overridden = new Map(p.finales.map((f) => [f.id_matiere, f.moyenne]));
  return p.matieres
    .filter((m) => withNote.has(m.id) || overridden.has(m.id))
    .map((m) => {
      const devoirs = p.devoirs.filter((d) => d.id_matiere === m.id && isReleveDevoir(d));
      const forAverage = p.devoirs.filter((d) => d.id_matiere === m.id && !d.formative);
      const sous = m.sous_matieres ?? [];
      let lignes: SousMatiereLigne[] = [];
      let computed: number | string;
      if (sous.length > 0) {
        const r = sousMatiereMoyennes(m.id, sous, forAverage, p.subTopics, p.services, p.classeId);
        lignes = r.lignes.map((l) => ({ ...l, devoirs: devoirs.filter((d) => Number(d.id_sousmatiere) === l.id) }));
        computed = r.moyenne;
      } else computed = moyenne(forAverage);
      const override = overridden.get(m.id);
      const shown = overridden.has(m.id) ? (override === null || override === undefined || override === '' ? 'NN' : override) : computed;
      return {
        id: m.id,
        name: m.name,
        enseignants: p.enseignantsOf(m.id),
        devoirs,
        sousMatieres: lignes,
        moyenne: shown === '' ? 'NN' : shown,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Moyenne de la classe au devoir (`getMoyenneClasse`), au dixième ; « NN » sans donnée. */
export function moyenneClasse(d: Pick<FamilyDevoir, 'sum_notes' | 'nbr_eleves'>): number | 'NN' {
  if (d.sum_notes === null || d.sum_notes === undefined || !d.nbr_eleves) return 'NN';
  return Number((parseFloat(String(d.sum_notes)) / d.nbr_eleves).toFixed(1));
}

/** Nombre à la française (`14,5`) ; les chaînes passent telles quelles. */
export const frNumber = (v: number | string) => (typeof v === 'number' ? String(v).replace('.', ',') : v);
