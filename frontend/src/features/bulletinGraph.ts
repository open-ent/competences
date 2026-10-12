/**
 * Bilan par domaine du bulletin (`ExportBulletins.drawGraphPerDomaine`) : un graphique par élève,
 * dessiné dans le navigateur — une barre par domaine, empilant la part de chaque niveau de
 * maîtrise, et au besoin les niveaux moyens de l'élève et de la classe —, puis déposé sur le
 * serveur, qui l'insère dans le PDF. Dessiné directement sur un canevas, sans bibliothèque.
 */

import type { GraphRow } from '../graphiques';
import type { Level } from '../saisie';

const W = 1267;
const H = 400;

export function drawDomaineChart(
  rows: GraphRow[],
  levels: Level[],
  o: { withLevelsStudent: boolean; withLevelsClass: boolean; labels: { student: string; classe: string; axis: string } },
): string {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  const pad = { left: 60, right: 20, top: 20, bottom: 90 };
  const plotH = H - pad.top - pad.bottom;
  const band = (W - pad.left - pad.right) / Math.max(rows.length, 1);
  const y = (v: number) => pad.top + plotH - (Math.min(v, 4) / 4) * plotH;

  ctx.font = '12px sans-serif';
  ctx.strokeStyle = '#e0e0e0';
  ctx.fillStyle = '#333';
  ctx.textAlign = 'right';
  for (let v = 0; v <= 4; v++) {
    ctx.beginPath();
    ctx.moveTo(pad.left, y(v));
    ctx.lineTo(W - pad.right, y(v));
    ctx.stroke();
    ctx.fillText(String(v), pad.left - 8, y(v) + 4);
  }
  ctx.save();
  ctx.translate(16, pad.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText(o.labels.axis, 0, 0);
  ctx.restore();

  const sorted = [...levels].sort((a, b) => a.value - b.value);
  rows.forEach((r, i) => {
    const x = pad.left + i * band + band * 0.2;
    const w = band * 0.6;
    // Parts empilées, du niveau le plus faible au plus fort, sur une hauteur de 4.
    let base = 0;
    sorted.forEach((l) => {
      const h = ((r.repartition[l.value] ?? 0) / 100) * 4;
      if (h > 0) {
        ctx.fillStyle = l.couleur;
        ctx.fillRect(x, y(base + h), w, y(base) - y(base + h));
      }
      base += h;
    });
    ctx.fillStyle = '#333';
    ctx.textAlign = 'center';
    ctx.fillText(r.label, pad.left + i * band + band / 2, H - pad.bottom + 18);
  });

  const line = (values: number[], color: string) => {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    values.forEach((v, i) => {
      const px = pad.left + i * band + band / 2;
      if (i === 0) ctx.moveTo(px, y(v));
      else ctx.lineTo(px, y(v));
    });
    ctx.stroke();
    values.forEach((v, i) => {
      ctx.beginPath();
      ctx.arc(pad.left + i * band + band / 2, y(v), 4, 0, Math.PI * 2);
      ctx.fill();
    });
  };
  if (o.withLevelsStudent) line(rows.map((r) => r.niveauEleve), '#00ADF9');
  if (o.withLevelsClass) line(rows.map((r) => r.niveauClasse), '#787c87');

  // Légende, en bas.
  const legend: Array<[string, string]> = [
    ...(o.withLevelsStudent ? ([[o.labels.student, '#00ADF9']] as Array<[string, string]>) : []),
    ...(o.withLevelsClass ? ([[o.labels.classe, '#787c87']] as Array<[string, string]>) : []),
    ...[...sorted].reverse().map((l) => [l.libelle, l.couleur] as [string, string]),
  ];
  ctx.textAlign = 'left';
  let lx = pad.left;
  legend.forEach(([label, color]) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(lx + 6, H - 30, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.fillText(label, lx + 16, H - 26);
    lx += ctx.measureText(label).width + 40;
  });
  return canvas.toDataURL('image/png');
}
