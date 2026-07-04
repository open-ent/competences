import { useEdificeClient } from '@open-ent/react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { api } from '../api';

/** Formate une date « YYYY-MM-DD… » en « jj/mm/aaaa ». */
const fmtDate = (s?: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

/** Évaluations : liste des devoirs de l'établissement (lecture). */
export function Evaluations() {
  const { t } = useTranslation(['competences', 'common']);
  const { user, init } = useEdificeClient();
  const structureId = user?.structures?.[0] ?? '';

  const devoirsQuery = useQuery({ queryKey: ['comp', 'devoirs', structureId], queryFn: () => api.getDevoirs(structureId), enabled: !!structureId });
  const devoirs = devoirsQuery.data ?? [];

  if (init && !structureId) return <div><h1>{t('competences.evaluations', { defaultValue: 'Évaluations' })}</h1></div>;

  return (
    <div>
      <h1 className="mb-16">{t('competences.evaluations', { defaultValue: 'Évaluations' })}</h1>
      {devoirsQuery.isLoading && <p>{t('competences.loading', { defaultValue: 'Chargement…' })}</p>}
      {!devoirsQuery.isLoading && devoirs.length === 0 && (
        <p className="text-muted">{t('competences.evaluations.empty', { defaultValue: 'Aucune évaluation saisie pour cet établissement.' })}</p>
      )}
      {devoirs.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>{t('competences.eval.name', { defaultValue: 'Évaluation' })}</th>
              <th>{t('competences.eval.subject', { defaultValue: 'Matière' })}</th>
              <th>{t('competences.eval.date', { defaultValue: 'Date' })}</th>
            </tr>
          </thead>
          <tbody>
            {devoirs.map((d) => (
              <tr key={d.id}>
                <td>{d.name ?? `#${d.id}`}</td>
                <td>{d.libelle_matiere ?? d.matiere ?? ''}</td>
                <td>{fmtDate(d.date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default Evaluations;
