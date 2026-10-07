import { useEdificeClient } from '@open-ent/react';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '../api';
import { byName, levelColor, levelLabel, sortLevels } from '../utils';

/** Paramètres d'évaluation par compétences : échelle de maîtrise + modalités + matières évaluables. */
export function Dashboard() {
  const { t } = useTranslation(['competences', 'common']);
  const { user, init } = useEdificeClient();
  const structureId = user?.structures?.[0] ?? '';

  const levelsQuery = useQuery({ queryKey: ['comp', 'levels', structureId], queryFn: () => api.getMaitriseLevels(structureId), enabled: !!structureId });
  const modalitesQuery = useQuery({ queryKey: ['comp', 'modalites', structureId], queryFn: () => api.getModalites(structureId), enabled: !!structureId });
  const matieresQuery = useQuery({ queryKey: ['comp', 'matieres', structureId], queryFn: () => api.getMatieres(structureId), enabled: !!structureId });

  const levels = useMemo(() => sortLevels(levelsQuery.data ?? []), [levelsQuery.data]);
  const modalites = modalitesQuery.data ?? [];
  const matieres = [...(matieresQuery.data ?? [])].sort(byName);

  if (init && !structureId) {
    return (
      <div>
        <h1>{t('competences.title', { defaultValue: 'Compétences' })}</h1>
        <div className="alert alert-info" role="alert">
          {t('competences.no.structure', { defaultValue: 'Aucun établissement associé à votre compte.' })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-16">{t('competences.title', { defaultValue: 'Compétences' })}</h1>
      <p className="text-muted mb-16">
        {t('competences.dashboard.intro', { defaultValue: "Paramètres d'évaluation par compétences de l'établissement." })}
      </p>

      <div className="d-flex gap-16 flex-wrap align-items-start">
        {/* Échelle de maîtrise */}
        <section className="card p-16 flex-grow-1" style={{ minWidth: 300 }}>
          <h2 style={{ fontSize: 18 }} className="mb-12">{t('competences.scale', { defaultValue: 'Échelle de maîtrise' })}</h2>
          {levelsQuery.isLoading && <p>{t('competences.loading', { defaultValue: 'Chargement…' })}</p>}
          {!levelsQuery.isLoading && levels.length === 0 && (
            <p className="text-muted">{t('competences.scale.empty', { defaultValue: 'Échelle non configurée pour cet établissement.' })}</p>
          )}
          {levels.length > 0 && (
            <ul className="list-unstyled mb-0">
              {levels.map((l, i) => {
                const color = levelColor(l);
                return (
                  <li key={l.id ?? l.id_niveau ?? i} className="d-flex align-items-center gap-8 py-4 border-bottom">
                    <span aria-hidden="true" style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: color || '#ccc' }} />
                    <span>{levelLabel(l)}</span>
                    {l.lettre && <span className="text-muted">({l.lettre})</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Modalités d'enseignement */}
        <section className="card p-16 flex-grow-1" style={{ minWidth: 240 }}>
          <h2 style={{ fontSize: 18 }} className="mb-12">
            {t('competences.modalities', { defaultValue: "Modalités d'enseignement" })}{' '}
            <span className="text-muted" style={{ fontSize: 14 }}>({modalites.length})</span>
          </h2>
          {modalitesQuery.isLoading && <p>{t('competences.loading', { defaultValue: 'Chargement…' })}</p>}
          {!modalitesQuery.isLoading && modalites.length === 0 && (
            <p className="text-muted">{t('competences.modalities.empty', { defaultValue: 'Aucune modalité.' })}</p>
          )}
          {modalites.length > 0 && (
            <ul className="list-unstyled mb-0">
              {modalites.map((m) => <li key={m.id} className="py-4 border-bottom">{m.libelle}</li>)}
            </ul>
          )}
        </section>

        {/* Matières évaluables */}
        <section className="card p-16 flex-grow-1" style={{ minWidth: 260 }}>
          <h2 style={{ fontSize: 18 }} className="mb-12">
            {t('competences.subjects', { defaultValue: 'Matières évaluables' })}{' '}
            <span className="text-muted" style={{ fontSize: 14 }}>({matieres.length})</span>
          </h2>
          {matieresQuery.isLoading && <p>{t('competences.loading', { defaultValue: 'Chargement…' })}</p>}
          {!matieresQuery.isLoading && matieres.length === 0 && (
            <p className="text-muted">{t('competences.subjects.empty', { defaultValue: 'Aucune matière.' })}</p>
          )}
          {matieres.length > 0 && (
            <ul className="list-unstyled mb-0">
              {matieres.map((m) => <li key={m.id} className="py-4 border-bottom">{m.name}</li>)}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export default Dashboard;
