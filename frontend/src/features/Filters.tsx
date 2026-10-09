import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { sortClasses, typeGroupeKey } from '../rules';
import { useStructure } from '../structure';
import type { Classe, TypePeriode } from '../types';

/**
 * Sélecteurs NATIFS habillés par le bootstrap du socle : un `<select>` reste le contrôle le plus
 * sûr au clavier et sur mobile, et n'exige pas l'enveloppe `FormControl` des champs du socle.
 */

/** Libellé d'une entrée de sélecteur vide (« tous »), entre crochets comme dans l'AngularJS. */
interface SelectProps<T> {
  label: string;
  value: T | null;
  onChange: (value: T | null) => void;
  className?: string;
}

/** Choix de l'établissement, affiché seulement quand il y en a plusieurs. */
export function StructureSelect({ className }: { className?: string }) {
  const { t } = useTranslation(['competences', 'common']);
  const { structures, structureId, setStructureId } = useStructure();
  const id = useId();
  if (structures.length < 2) return null;
  return (
    <div className={className}>
      <label htmlFor={id} className="form-label">
        {t('competences.react.structure')}
      </label>
      <select id={id} className="form-select" value={structureId} onChange={(e) => setStructureId(e.target.value)}>
        {structures.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Libellé d'un type de période : « Trimestre 1 », « Semestre 2 », ou « Année » pour l'entrée
 * d'identifiant `null` (`getI18nPeriode`).
 */
export function usePeriodeLabel() {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  return (periode: TypePeriode) =>
    periode.id === null
      ? t('viescolaire.utils.annee')
      : `${t(`viescolaire.periode.${periode.type}`)} ${periode.ordre ?? ''}`.trim();
}

/** Période : l'entrée « Année » vaut absence de filtre. */
export function PeriodeSelect({ periodes, label, value, onChange, className }: SelectProps<number> & { periodes: TypePeriode[] }) {
  const labelOf = usePeriodeLabel();
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="form-label">
        {label}
      </label>
      <select
        id={id}
        className="form-select"
        value={value === null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      >
        {periodes.map((p) => (
          <option key={p.id ?? 'annee'} value={p.id === null ? '' : String(p.id)}>
            {labelOf(p)}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Classe ou groupe, regroupés par genre (classe, groupe d'enseignement, groupe manuel). */
export function ClasseSelect({
  classes,
  label,
  emptyLabel,
  value,
  onChange,
  className,
}: SelectProps<string> & { classes: Classe[]; emptyLabel: string }) {
  const { t } = useTranslation(['competences', 'common']);
  const id = useId();
  const groups = (['classe', 'groupe', 'manuel'] as const)
    .map((kind) => ({ kind, items: sortClasses(classes).filter((c) => typeGroupeKey(c.type_groupe) === kind) }))
    .filter((g) => g.items.length > 0);
  const groupLabel = {
    classe: t('viescolaire.utils.class'),
    groupe: t('viescolaire.utils.groupeEnseignement'),
    manuel: t('competences.react.group.manual'),
  };
  return (
    <div className={className}>
      <label htmlFor={id} className="form-label">
        {label}
      </label>
      <select id={id} className="form-select" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">{emptyLabel}</option>
        {groups.map((g) => (
          <optgroup key={g.kind} label={groupLabel[g.kind]}>
            {g.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

/** Sélecteur générique sur une liste `{ value, label }`, avec une entrée « tous ». */
export function SimpleSelect<T extends string | number>({
  label,
  emptyLabel,
  options,
  value,
  onChange,
  className,
}: SelectProps<T> & { emptyLabel: string; options: Array<{ value: T; label: string }> }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="form-label">
        {label}
      </label>
      <select
        id={id}
        className="form-select"
        value={value === null ? '' : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') return onChange(null);
          const match = options.find((o) => String(o.value) === raw);
          onChange(match ? match.value : null);
        }}
      >
        <option value="">{emptyLabel}</option>
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
