import { Alert, LoadingScreen } from '@open-ent/react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams } from 'react-router-dom';

import * as api from '../api';
import { asSuiviEvaluation, byDateDesc, FamilyChild, resultOf } from '../family';
import { useChildData } from '../familyContext';
import { WithChild } from '../features/FamilyParts';
import { DomaineBlock, Legend } from '../features/SuiviTree';
import { formatDate } from '../rules';

/**
 * Fiche d'un devoir (`display_devoir.html`) : détails, compétences évaluées avec leur niveau,
 * résultat, appréciation quand l'enseignant l'a rendue visible ; passage au devoir voisin.
 */
export function FamilyDevoir() {
  return <WithChild render={(child, data) => <DevoirView child={child} data={data} />} />;
}

function DevoirView({ child, data }: { child: FamilyChild; data: ReturnType<typeof useChildData> }) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const { devoirId } = useParams();
  const ordered = [...data.devoirs].sort(byDateDesc);
  const index = ordered.findIndex((d) => d.id === Number(devoirId));
  const devoir = ordered[index];
  const idCycle = data.idCycle;

  const appreciationQuery = useQuery({
    queryKey: ['competences', 'famille', child.id, 'appreciation', devoir?.id],
    queryFn: () => api.getDevoirAppreciation(devoir!.id, child.id),
    enabled: !!devoir?.apprec_visible,
  });
  const domainesQuery = useQuery({
    queryKey: ['competences', 'domaines-eleve', child.idClasse, child.id, idCycle],
    queryFn: () => api.getDomainesEleve(child.idClasse, child.id, idCycle!),
    enabled: !!devoir && devoir.competences.length > 0 && idCycle !== null,
  });

  // Devoir inconnu (autre enfant, lien périmé) : le premier, sinon l'accueil (`initListDevoirs`).
  if (!devoir) return <Navigate to={ordered[0] ? `/devoir/${ordered[0].id}` : '/'} replace />;

  const previous = ordered[index - 1];
  const next = ordered[index + 1];
  const sous = data.sousMatiere(devoir.id_matiere, devoir.id_sousmatiere);
  const details: Array<[string, string | undefined | null]> = [
    ['viescolaire.utils.description', devoir.libelle],
    ['viescolaire.utils.subject', data.matiereNames.get(devoir.id_matiere)],
    ['viescolaire.utils.undersubject', sous],
    ['viescolaire.utils.date', formatDate(devoir.date)],
    ['viescolaire.utils.teacher', data.teacherOf(devoir)],
    ['viescolaire.utils.type', devoir._type_libelle],
    ['viescolaire.utils.coefficient', devoir.is_evaluated ? String(devoir.coefficient ?? '') : null],
    ['evaluations.test.grade.on', devoir.is_evaluated ? String(devoir.diviseur ?? '') : null],
  ];

  return (
    <div className="d-flex flex-column gap-16">
      <div className="d-flex align-items-center gap-12">
        {previous ? (
          <Link to={`/devoir/${previous.id}`} className="btn btn-outline-primary btn-sm" aria-label={t('competences.react.famille.previous')}>
            ‹
          </Link>
        ) : (
          <span className="btn btn-sm invisible">‹</span>
        )}
        <h1 className="h3 mb-0 flex-fill text-center">{devoir.name}</h1>
        {next ? (
          <Link to={`/devoir/${next.id}`} className="btn btn-outline-primary btn-sm" aria-label={t('competences.react.famille.next')}>
            ›
          </Link>
        ) : (
          <span className="btn btn-sm invisible">›</span>
        )}
      </div>

      <div className="row g-16">
        <section className="col-12 col-lg-4">
          <div className="card p-16">
            <h2 className="h6">{t('evaluations.homework.details')}</h2>
            <dl className="mb-0 small">
              {details
                .filter(([, v]) => v)
                .map(([label, v]) => (
                  <div key={label} className="mb-4">
                    <dt className="d-inline fw-bold">{t(label)} : </dt>
                    <dd className="d-inline">{v}</dd>
                  </div>
                ))}
            </dl>
          </div>
        </section>

        <div className="col-12 col-lg-8 d-flex flex-column gap-16">
          <section className="card p-16">
            <h2 className="h5">{t('viescolaire.evaluation.result')}</h2>
            <p className="fs-4 mb-0" title={devoir.annotation?.libelle}>
              {resultOf(devoir) || '—'}
              {devoir.annotation && <span className="fs-6 text-muted"> ({devoir.annotation.libelle})</span>}
            </p>
          </section>

          {devoir.apprec_visible && (
            <section className="card p-16">
              <h2 className="h5">{t('viescolaire.utils.appreciation')}</h2>
              {appreciationQuery.isLoading ? <LoadingScreen position={false} /> : <p className="mb-0">{appreciationQuery.data || '—'}</p>}
            </section>
          )}

          {devoir.competences.length > 0 && (
            <section className="card p-16 d-flex flex-column gap-8">
              <h2 className="h5 mb-0">{t('evaluations.competences.title')}</h2>
              <Legend levels={data.levels} />
              {domainesQuery.isLoading ? (
                <LoadingScreen position={false} />
              ) : domainesQuery.isError ? (
                <Alert type="danger">{t('competences.react.loading.error')}</Alert>
              ) : (
                (domainesQuery.data ?? []).map((domaine) => (
                  <DomaineBlock
                    key={domaine.id}
                    domaine={domaine}
                    evaluations={devoir.competences.map(asSuiviEvaluation)}
                    teachers={[]}
                    table={[]}
                    levels={data.levels}
                    options={{ average: false, isYear: false }}
                    onlyMine={false}
                    onlyEvaluated
                    finalEditable={false}
                    onSetFinal={async () => undefined}
                    rawLevel
                  />
                ))
              )}
            </section>
          )}
        </div>
      </div>
      <div>
        <Link to="/devoirs/list">{t('evaluation.access.to.list')}</Link>
      </div>
    </div>
  );
}

export default FamilyDevoir;
