import { Alert, LoadingScreen } from '@open-ent/react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import * as api from '../api';
import { moyennesTable } from '../releveExport';
import { useStructure, useStructureData, useViewer } from '../structure';
import type { Classe, PeriodeClasse } from '../types';

type Props = { classe: Classe; periode: PeriodeClasse | null };

/**
 * Onglet « Positionnements » (`positioning.html`) : le récapitulatif des niveaux par domaine de la classe, en PDF dans la
 * page. Le PDF est demandé avec la session de l'usager puis affiché depuis une URL locale : l'export est le même que celui
 * du bouton de téléchargement.
 */
export function PositionnementTab({ classe, periode }: Props) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const { structureId } = useStructure();
  const viewer = useViewer()!;
  const [src, setSrc] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'empty'>('loading');

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const usePerso = await api.getUsePerso(viewer.userId);
        const res = await fetch(api.suiviExportUrl.recapEval({ structureId, classeId: classe.id, text: false, usePerso, idPeriode: periode?.id_type ?? null }), { credentials: 'include' });
        const type = res.headers.get('content-type') ?? '';
        if (!res.ok || type.includes('text/html') || type.includes('json')) throw new Error('empty');
        url = URL.createObjectURL(await res.blob());
        if (!cancelled) {
          setSrc(url);
          setState('ready');
        }
      } catch {
        if (!cancelled) setState('empty');
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [structureId, classe.id, periode?.id_type, viewer.userId]);

  if (state === 'loading') return <LoadingScreen position={false} />;
  if (state === 'empty' || !src) return <Alert type="info">{t('competance.class.info.empty')}</Alert>;
  return <iframe title={t('evaluation.class.evaluation.header.positioning')} src={src} width="100%" height={875} className="border-0" data-positionnement-pdf />;
}

/**
 * Onglet « Moyennes » (`average.html`) : les moyennes de chaque élève par matière notée sur la période, la moyenne générale
 * et, en pied, moyenne, minimum et maximum de la classe.
 */
export function MoyennesTab({ classe, periode }: Props) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const { structureId } = useStructure();
  const data = useStructureData();
  const matieres = data.matieres.filter((m) => m.id);
  const query = useQuery({
    queryKey: ['competences', structureId, 'tableau-moyennes', classe.id, periode?.id_type ?? 'annee'],
    queryFn: () => api.getTableauMoyennes(structureId, classe, matieres.map((m) => m.id), periode?.id_type ?? null),
  });
  if (query.isLoading) return <LoadingScreen position={false} />;
  if (query.isError) return <Alert type="danger">{t('competences.react.loading.error')}</Alert>;

  const teachersOf = (matiereId: string) =>
    [...new Set(data.devoirs.filter((d) => d.id_groupe === classe.id && d.id_matiere === matiereId).map((d) => d.teacher).filter(Boolean))].join(', ');
  const table = query.data
    ? moyennesTable(query.data, matieres, { teachersOf, labels: { moyenne: t('average'), minimum: t('average.minimum'), maximum: t('average.maximum') } })
    : null;
  if (!table) return <Alert type="info">{t('competance.class.info.empty')}</Alert>;

  return (
    <div className="table-responsive">
      <table className="table table-sm table-striped align-middle text-center" data-moyennes>
        <thead>
          <tr>
            <th scope="col" className="text-start">
              {t('student')}
            </th>
            {table.matieres.map((m) => (
              <th key={m.id} scope="col">
                <div>{m.name}</div>
                <div className="small fw-normal text-muted">{m.teachers}</div>
              </th>
            ))}
            <th scope="col">{t('average')}</th>
          </tr>
        </thead>
        <tbody>
          {table.lignes.map((l) => (
            <tr key={l.name}>
              <th scope="row" className="text-start fw-normal">
                {l.name}
              </th>
              {l.cells.map((c, i) => (
                <td key={table.matieres[i].id}>{c}</td>
              ))}
              <td>{l.generale}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {table.pied.map((p) => (
            <tr key={p.label}>
              <th scope="row" className="text-start">
                {p.label}
              </th>
              {p.cells.map((c, i) => (
                <td key={table.matieres[i].id}>{c}</td>
              ))}
              <td>{p.generale}</td>
            </tr>
          ))}
        </tfoot>
      </table>
    </div>
  );
}

/**
 * Onglet « Appréciations professeurs » (`teacher_appraisals.html`) : pour chaque matière, son enseignant (et ses
 * co-enseignants), son appréciation de la classe et la moyenne, le minimum et le maximum. Réservé à une période.
 */
export function AppreciationsTab({ classe, periode }: Props) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const { structureId } = useStructure();
  const query = useQuery({
    queryKey: ['competences', structureId, 'appreciations-classe', classe.id, periode?.id_type ?? 'annee'],
    queryFn: () => api.getClasseAppreciations(structureId, classe.id, periode?.id_type ?? null),
  });
  if (query.isLoading) return <LoadingScreen position={false} />;
  if (query.isError) return <Alert type="danger">{t('competences.react.loading.error')}</Alert>;
  const rows = query.data ?? [];
  if (rows.length === 0) return <Alert type="info">{t('competance.class.info.empty')}</Alert>;
  return (
    <div className="table-responsive">
      <table className="table table-sm table-striped align-middle" data-appreciations>
        <thead>
          <tr>
            <th scope="col">{t('matieres')}</th>
            <th scope="col">{t('appreciation')}</th>
            <th scope="col">{t('average.min')}</th>
            <th scope="col">{t('classaverage.min')}</th>
            <th scope="col">{t('classaverage.max')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.mat}-${r.prof}-${i}`}>
              <td>
                <div>{r.mat ?? ''}</div>
                <div className="small text-muted">{r.prof ?? ''}</div>
                {(r.coT ?? []).map((c) => (
                  <div key={c} className="small text-muted">
                    {c}
                  </div>
                ))}
              </td>
              <td>{r.appr ?? ''}</td>
              <td>{r.moy ?? ''}</td>
              <td>{r.min ?? ''}</td>
              <td>{r.max ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
