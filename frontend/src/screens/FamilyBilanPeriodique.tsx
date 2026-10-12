import { Alert, LoadingScreen } from '@open-ent/react';
import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import * as api from '../api';
import { acquisRow, avisSynthesePeriode, evenementsHistorique, isEmptyRow } from '../conseil';
import { currentPeriode, FamilyChild } from '../family';
import { todayLocal, useChildData, useFamilyOptional } from '../familyContext';
import { WithChild } from '../features/FamilyParts';
import { usePeriodeLabel } from '../features/Filters';
import { formatMoyenne } from '../releve';

/**
 * Bilan périodique de l'enfant (`#/bilan/periodique`, vue du conseil de classe ouverte aux
 * familles), en lecture seule : suivi des acquis par matière, synthèse et avis du conseil, retards
 * et absences. L'AngularJS avait retiré ce lien de son menu ; il reste joignable par adresse.
 */
export function FamilyBilanPeriodique() {
  return <WithChild render={(child, data) => <BilanPeriodiqueView child={child} data={data} />} />;
}

function BilanPeriodiqueView({ child, data }: { child: FamilyChild; data: ReturnType<typeof useChildData> }) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const isParent = useFamilyOptional()?.isParent ?? false;
  const periodeLabel = usePeriodeLabel();
  const periodeId = useId();
  const [periode, setPeriode] = useState<number | null>(() => currentPeriode(data.periodes, todayLocal()) ?? data.periodes[0]?.id_type ?? null);

  const acquisQuery = useQuery({
    queryKey: ['competences', 'famille', child.id, 'acquis', periode],
    queryFn: () => api.getAcquis(child.id, child.idStructure, child.idClasse, periode!),
    enabled: periode !== null,
  });
  const conversionQuery = useQuery({
    queryKey: ['competences', child.idStructure, 'conversion', child.idClasse],
    queryFn: () => api.getConversionTable(child.idStructure, child.idClasse),
  });
  const avisQuery = useQuery({ queryKey: ['competences', 'famille', child.id, 'avis'], queryFn: () => api.getAvisSyntheses(child.idStructure, child.id) });
  const evenementsQuery = useQuery({
    queryKey: ['competences', 'famille', child.id, 'evenements'],
    queryFn: () => api.getEvenements(child.idStructure, child.idClasse, child.id),
  });
  const loading = [acquisQuery, conversionQuery, avisQuery, evenementsQuery].some((q) => q.isLoading && q.fetchStatus !== 'idle');

  const rows =
    periode === null
      ? []
      : (acquisQuery.data ?? [])
          .map((raw) => ({ raw, row: acquisRow(raw, periode, conversionQuery.data ?? []) }))
          .filter(({ raw, row }) => !isEmptyRow(row, raw, periode))
          .sort((a, b) => (a.raw.rank ?? 0) - (b.raw.rank ?? 0));
  const avis = avisQuery.data && periode !== null ? avisSynthesePeriode(avisQuery.data, periode) : null;
  const libelleAvis = (id: number | null) => avisQuery.data?.libelleAvis.find((a) => a.id === id)?.libelle ?? '—';
  const ligne = periode !== null ? evenementsHistorique(evenementsQuery.data ?? [], [periode])[0] : null;

  return (
    <div className="d-flex flex-column gap-16">
      <h1 className="h3 mb-0">
        {t('evaluations.conseil.de.classe')}
        {isParent && ` — ${child.firstName}`}
      </h1>
      <div>
        <label htmlFor={periodeId} className="form-label">
          {t('viescolaire.utils.periode')}
        </label>
        <select id={periodeId} className="form-select" style={{ maxWidth: 280 }} value={periode ?? ''} onChange={(e) => setPeriode(Number(e.target.value))}>
          {data.periodes.map((p) => (
            <option key={p.id_type} value={p.id_type}>
              {periodeLabel({ id: p.id_type, type: p.type, ordre: p.ordre })}
            </option>
          ))}
        </select>
      </div>
      {loading ? (
        <LoadingScreen position={false} />
      ) : (
        <>
          <section className="card p-16">
            <h2 className="h5">{t('evaluation.bilan.periodique.suivi.acquis')}</h2>
            {rows.length === 0 ? (
              <Alert type="info">{t('competences.react.conseil.empty')}</Alert>
            ) : (
              <div className="table-responsive">
                <table className="table align-middle mb-0">
                  <thead>
                    <tr>
                      <th scope="col">{t('matieres')}</th>
                      <th scope="col">{t('viescolaire.utils.elements.programme')}</th>
                      <th scope="col">{t('appreciation').trim()}</th>
                      <th scope="col">{t('average.student')}</th>
                      <th scope="col">{t('average.class')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ row }) => (
                      <tr key={row.idMatiere}>
                        <th scope="row" className="fw-normal">
                          <div className="fw-bold">{row.libelle}</div>
                          <div className="small text-muted">{row.teachers.join(', ')}</div>
                        </th>
                        <td className="small">{row.elementsProgramme}</td>
                        <td className="small">{row.appreciation}</td>
                        <td>{formatMoyenne(row.moyenneEleve)}</td>
                        <td>{formatMoyenne(row.moyenneClasse)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          {avis && (
            <section className="card p-16 d-flex flex-column gap-4">
              <h2 className="h5">{t('evaluations.synthese.acquis.bilan.periodique')}</h2>
              <p className="mb-8">{avis.synthese || '—'}</p>
              <div>
                {t('evaluations.evaluation.avis.conseil')} : {libelleAvis(avis.avisConseil)}
              </div>
              <div>
                {t('evaluations.evaluation.avis.orientation')} : {libelleAvis(avis.avisOrientation)}
              </div>
            </section>
          )}
          {ligne && (
            <section className="card p-16">
              <h2 className="h5">{t('evaluation.bilan.periodique.vie.scolaire')}</h2>
              <ul className="list-unstyled mb-0">
                <li>
                  {t('viescolaire.retards').trim()} : {ligne.retard}
                </li>
                <li>
                  {t('viescolaire.abs.justified')} : {ligne.abs_just} {t('half.days').trim()}
                </li>
                <li>
                  {t('viescolaire.abs.not.justified')} : {ligne.abs_non_just} {t('half.days').trim()}
                </li>
                <li>
                  {t('viescolaire.nb.courses.lost')} : {ligne.abs_totale_heure} {t('hours').trim()}
                </li>
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default FamilyBilanPeriodique;
