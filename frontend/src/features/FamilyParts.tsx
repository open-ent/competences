import { Alert, LoadingScreen } from '@open-ent/react';
import { ReactNode, useId } from 'react';
import { useTranslation } from 'react-i18next';

import type { FamilyChild, StudentCompetence } from '../family';
import { useChildData, useFamily } from '../familyContext';
import type { Level } from '../saisie';
import type { PeriodeClasse } from '../types';
import { usePeriodeLabel } from './Filters';
import { LevelBubble } from './SuiviTree';

/** Rend l'écran pour l'enfant suivi, une fois ses référentiels chargés. */
export function WithChild({ render }: { render: (child: FamilyChild, data: ReturnType<typeof useChildData>) => ReactNode }) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const { child, isLoading } = useFamily();
  if (isLoading) return <LoadingScreen position={false} />;
  if (!child) return <Alert type="info">{t('competences.react.famille.no.child')}</Alert>;
  return <ChildData key={child.id} child={child} render={render} />;
}

function ChildData({ child, render }: { child: FamilyChild; render: (child: FamilyChild, data: ReturnType<typeof useChildData>) => ReactNode }) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const data = useChildData(child);
  if (data.isLoading) return <LoadingScreen position={false} />;
  if (data.isError) return <Alert type="danger">{t('competences.react.loading.error')}</Alert>;
  return <>{render(child, data)}</>;
}

/** Période (avec l'année entière) et matière, les deux critères de l'AngularJS. */
export function FamilyCriteria({
  periodes,
  periode,
  onPeriode,
  matieres,
  matiere,
  onMatiere,
  children,
}: {
  periodes: PeriodeClasse[];
  periode: number | null;
  onPeriode: (v: number | null) => void;
  matieres: Array<{ id: string; name: string }>;
  matiere: string | null;
  onMatiere: (v: string | null) => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const periodeLabel = usePeriodeLabel();
  const periodeId = useId();
  const matiereId = useId();
  return (
    <div className="row g-12">
      <div className="col-12 col-md-4">
        <label htmlFor={periodeId} className="form-label">
          {t('viescolaire.utils.periode')}
        </label>
        <select
          id={periodeId}
          className="form-select"
          value={periode ?? ''}
          onChange={(e) => onPeriode(e.target.value === '' ? null : Number(e.target.value))}
        >
          {periodes.map((p) => (
            <option key={p.id_type} value={p.id_type}>
              {periodeLabel({ id: p.id_type, type: p.type, ordre: p.ordre })}
            </option>
          ))}
          <option value="">{t('viescolaire.utils.annee')}</option>
        </select>
      </div>
      <div className="col-12 col-md-4">
        <label htmlFor={matiereId} className="form-label">
          {t('viescolaire.utils.subject')}
        </label>
        <select id={matiereId} className="form-select" value={matiere ?? ''} onChange={(e) => onMatiere(e.target.value || null)}>
          <option value="">{t('competences.react.famille.all.subjects')}</option>
          {matieres.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      {children}
    </div>
  );
}

/** Les niveaux obtenus sur les compétences d'un devoir, en pastilles (`proportion-suivi-competence`). */
export function CompetenceBubbles({ competences, levels }: { competences: StudentCompetence[]; levels: Level[] }) {
  const { t } = useTranslation(['competences', 'common']);
  const shown = competences.filter((c) => c.evaluation > -1);
  if (shown.length === 0) return null;
  return (
    <span className="d-inline-flex gap-4 align-middle">
      {shown.map((c) => {
        const level = levels.find((l) => l.value === c.evaluation);
        return <LevelBubble key={c.id_competences_notes} level={level} label={level?.libelle ?? t('competences.react.saisie.level.none')} />;
      })}
    </span>
  );
}
