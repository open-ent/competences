import { useTranslation } from 'react-i18next';

import { formatDate } from '../rules';
import { Level, UNEVALUATED_COLOR } from '../saisie';
import { CompetenceEvaluation, evolutionPoints, proportions } from '../suivi';

/**
 * Barre de proportion des niveaux d'une compétence (`proportion-suivi-competence`) : un segment par niveau, large comme
 * sa part des évaluations, avec le détail en infobulle et en texte pour les lecteurs d'écran.
 */
export function ProportionBar({ evals, levels }: { evals: CompetenceEvaluation[]; levels: Level[] }) {
  const { t } = useTranslation(['competences', 'common']);
  const slices = proportions(evals);
  if (slices.length === 0) return null;
  const describe = (value: number) => levels.find((l) => l.value === value)?.lettre ?? t('competences.react.saisie.level.none');
  const summary = slices.map((s) => `${s.count} ${describe(s.value)} (${Math.round(s.percent)} %)`).join(', ');
  return (
    <span className="d-inline-flex rounded overflow-hidden align-middle" style={{ width: 140, height: 16 }} role="img" aria-label={summary} title={summary} data-proportion>
      {slices.map((s) => (
        <span key={s.value} style={{ width: `${s.percent}%`, background: levels.find((l) => l.value === s.value)?.couleur ?? UNEVALUATED_COLOR, opacity: s.value < 0 ? 0.3 : 1 }} />
      ))}
    </span>
  );
}

/**
 * Évolution des niveaux d'une compétence dans le temps (`chart-bubble` du suivi élève) : un point par évaluation, relié
 * au suivant. Les évaluations formatives sont repérées par un contour. Le tableau reste la vue de référence.
 */
export function EvolutionChart({ evals, levels }: { evals: CompetenceEvaluation[]; levels: Level[] }) {
  const { t } = useTranslation(['competences', 'common']);
  const points = evolutionPoints(evals);
  if (points.length === 0) return <p className="text-muted mb-0">{t('evaluation.not.exist')}</p>;
  const ordered = [...levels].sort((a, b) => a.value - b.value);
  const width = 560;
  const height = 40 + 36 * Math.max(ordered.length - 1, 1);
  const left = 44;
  const top = 20;
  const y = (value: number) => {
    const i = ordered.findIndex((l) => l.value === value);
    return height - top - (i < 0 ? 0 : i) * ((height - 2 * top) / Math.max(ordered.length - 1, 1));
  };
  const x = (i: number) => (points.length === 1 ? (width + left) / 2 : left + (i * (width - left - 20)) / (points.length - 1));
  const levelOf = (value: number) => levels.find((l) => l.value === value);
  return (
    <div className="overflow-auto" data-evolution-chart>
      <svg viewBox={`0 0 ${width} ${height + 24}`} width="100%" role="img" aria-label={t('competences.react.suivi.evolution')} style={{ maxWidth: width }}>
        {ordered.map((l) => (
          <g key={l.value}>
            <line x1={left} x2={width - 10} y1={y(l.value)} y2={y(l.value)} stroke="currentColor" opacity={0.12} />
            <text x={left - 8} y={y(l.value) + 4} textAnchor="end" fontSize={11}>
              {l.lettre}
            </text>
          </g>
        ))}
        <polyline fill="none" stroke="currentColor" opacity={0.35} strokeDasharray="2 6" points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')} />
        {points.map((p, i) => (
          <g key={`${p.date}-${i}`}>
            <circle cx={x(i)} cy={y(p.value)} r={9} fill={levelOf(p.value)?.couleur ?? UNEVALUATED_COLOR} stroke={p.formative ? '#000' : 'none'} strokeWidth={2} strokeDasharray={p.formative ? '3 2' : undefined}>
              <title>{`${p.label}${p.formative ? ' (F)' : ''} — ${formatDate(p.date)} — ${levelOf(p.value)?.libelle ?? ''}`}</title>
            </circle>
            <text x={x(i)} y={height + 12} textAnchor="middle" fontSize={10}>
              {formatDate(p.date).slice(0, 5)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
