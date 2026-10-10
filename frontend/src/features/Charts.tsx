import { useTranslation } from 'react-i18next';

/*
 * Graphiques du conseil de classe, dessinés en SVG : bâtons groupés et radar. Pas de bibliothèque
 * de graphiques — l'AngularJS embarquait chart.js pour ces deux seuls usages. Chaque graphique est
 * doublé de son tableau de valeurs, pour les lecteurs d'écran et pour qui veut les chiffres.
 */

export interface Series {
  label: string;
  color: string;
  values: Array<number | null>;
}

interface ChartProps {
  title: string;
  categories: string[];
  series: Series[];
  max: number;
  step: number;
}

const fr = (n: number | null) => (n === null ? '—' : String(n).replace('.', ','));

function Legend({ series }: { series: Series[] }) {
  return (
    <ul className="list-inline small mb-0">
      {series.map((s) => (
        <li key={s.label} className="list-inline-item">
          <span className="d-inline-block align-middle me-4" style={{ width: 12, height: 12, background: s.color, borderRadius: 2 }} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function ValuesTable({ title, categories, series }: Omit<ChartProps, 'max' | 'step'>) {
  const { t } = useTranslation(['competences', 'common']);
  return (
    <details className="small">
      <summary>{t('competences.react.graph.values')}</summary>
      <table className="table table-sm mb-0 mt-8">
        <caption className="visually-hidden">{title}</caption>
        <thead>
          <tr>
            <th scope="col" />
            {series.map((s) => (
              <th key={s.label} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((c, i) => (
            <tr key={c}>
              <th scope="row" className="fw-normal">
                {c}
              </th>
              {series.map((s) => (
                <td key={s.label}>{fr(s.values[i])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** Bâtons groupés : une catégorie par matière ou domaine, une barre par série. */
export function BarChart({ title, categories, series, max, step }: ChartProps) {
  const W = 720;
  const H = 300;
  const pad = { left: 36, right: 12, top: 12, bottom: 70 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const band = plotW / Math.max(categories.length, 1);
  const barW = Math.min(28, (band * 0.8) / Math.max(series.length, 1));
  const y = (v: number) => pad.top + plotH - (Math.min(v, max) / max) * plotH;
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);

  return (
    <figure className="mb-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-100" role="img" aria-label={title} style={{ maxHeight: 340 }}>
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={pad.left} x2={W - pad.right} y1={y(tk)} y2={y(tk)} stroke="currentColor" strokeOpacity={0.12} />
            <text x={pad.left - 6} y={y(tk) + 4} fontSize={11} textAnchor="end" fill="currentColor">
              {tk}
            </text>
          </g>
        ))}
        {categories.map((c, i) => {
          const x0 = pad.left + i * band + (band - barW * series.length) / 2;
          return (
            <g key={c}>
              {series.map((s, j) => {
                const v = s.values[i];
                if (v === null) return null;
                return (
                  <rect key={s.label} x={x0 + j * barW} y={y(v)} width={barW - 2} height={pad.top + plotH - y(v)} fill={s.color}>
                    <title>{`${c} — ${s.label} : ${fr(v)}`}</title>
                  </rect>
                );
              })}
              <text
                x={pad.left + i * band + band / 2}
                y={H - pad.bottom + 14}
                fontSize={11}
                textAnchor="end"
                fill="currentColor"
                transform={`rotate(-30 ${pad.left + i * band + band / 2} ${H - pad.bottom + 14})`}
              >
                {c.length > 22 ? `${c.slice(0, 21)}…` : c}
              </text>
            </g>
          );
        })}
      </svg>
      <Legend series={series} />
      <ValuesTable title={title} categories={categories} series={series} />
    </figure>
  );
}

/** Radar : un axe par matière ou domaine, un polygone par série. Au-dessous de trois axes, des bâtons. */
export function RadarChart(props: ChartProps) {
  const { title, categories, series, max, step } = props;
  if (categories.length < 3) return <BarChart {...props} />;
  const S = 360;
  const c = S / 2;
  const r = S / 2 - 60;
  const angle = (i: number) => (Math.PI * 2 * i) / categories.length - Math.PI / 2;
  const point = (i: number, v: number) => [c + Math.cos(angle(i)) * r * (Math.min(v, max) / max), c + Math.sin(angle(i)) * r * (Math.min(v, max) / max)];
  const rings = Array.from({ length: Math.floor(max / step) }, (_, i) => (i + 1) * step);

  return (
    <figure className="mb-0">
      <svg viewBox={`0 0 ${S} ${S}`} className="w-100" role="img" aria-label={title} style={{ maxHeight: 380 }}>
        {rings.map((ring) => (
          <polygon
            key={ring}
            points={categories.map((_, i) => point(i, ring).join(',')).join(' ')}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.12}
          />
        ))}
        {categories.map((cat, i) => {
          const [x, yy] = point(i, max);
          const [lx, ly] = [c + Math.cos(angle(i)) * (r + 14), c + Math.sin(angle(i)) * (r + 14)];
          return (
            <g key={cat}>
              <line x1={c} y1={c} x2={x} y2={yy} stroke="currentColor" strokeOpacity={0.12} />
              <text x={lx} y={ly} fontSize={10} textAnchor={Math.abs(lx - c) < 4 ? 'middle' : lx > c ? 'start' : 'end'} fill="currentColor">
                {cat.length > 18 ? `${cat.slice(0, 17)}…` : cat}
              </text>
            </g>
          );
        })}
        {series.map((s) => (
          <polygon
            key={s.label}
            points={s.values.map((v, i) => point(i, v ?? 0).join(',')).join(' ')}
            fill={s.color}
            fillOpacity={0.2}
            stroke={s.color}
            strokeWidth={2}
          >
            <title>{s.label}</title>
          </polygon>
        ))}
      </svg>
      <Legend series={series} />
      <ValuesTable title={title} categories={categories} series={series} />
    </figure>
  );
}

/** Répartition des niveaux de l'élève, en barres empilées horizontales aux couleurs des niveaux. */
export function RepartitionBars({ rows, levels }: { rows: Array<{ label: string; repartition: number[] }>; levels: Array<{ value: number; couleur: string; libelle: string }> }) {
  return (
    <div className="d-flex flex-column gap-4">
      {rows.map((row) => (
        <div key={row.label} className="d-flex align-items-center gap-8 small">
          <span className="text-truncate" style={{ width: 180 }} title={row.label}>
            {row.label}
          </span>
          <div className="d-flex flex-fill rounded overflow-hidden border" style={{ height: 16 }}>
            {row.repartition.map((pct, level) =>
              pct > 0 ? (
                <div
                  key={level}
                  style={{ width: `${pct}%`, background: levels.find((l) => l.value === level)?.couleur }}
                  title={`${levels.find((l) => l.value === level)?.libelle ?? level} : ${fr(pct)} %`}
                />
              ) : null,
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
