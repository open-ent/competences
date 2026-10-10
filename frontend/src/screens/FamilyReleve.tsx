import { Alert, LoadingScreen } from '@open-ent/react';
import { useQuery } from '@tanstack/react-query';
import { Fragment, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import * as api from '../api';
import { currentPeriode, FamilyChild, FamilyDevoir } from '../family';
import { todayLocal, useChildData, useFamily } from '../familyContext';
import { WithChild } from '../features/FamilyParts';
import { usePeriodeLabel } from '../features/Filters';
import { formatDate } from '../rules';
import { frNumber, MatiereLigne, moyenneClasse, releveLignes } from '../releveFamille';

/**
 * Relevé de notes de l'enfant (`eval_parent_dispreleve.html`, `releve_notes.html`) : par matière
 * — et sous-matière —, ses enseignants, chaque note avec son coefficient et la moyenne de la
 * classe, puis la moyenne de l'élève ; export PDF du relevé.
 */
export function FamilyReleve() {
  return <WithChild render={(child, data) => <ReleveView child={child} data={data} />} />;
}

function ReleveView({ child, data }: { child: FamilyChild; data: ReturnType<typeof useChildData> }) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const { isParent } = useFamily();
  const periodeLabel = usePeriodeLabel();
  const periodeId = useId();
  const [periode, setPeriode] = useState<number | null>(() => currentPeriode(data.periodes, todayLocal()));

  const finalesQuery = useQuery({
    queryKey: ['competences', 'famille', child.id, 'moyennes-finales', periode ?? 'annee'],
    queryFn: () => api.getMoyennesFinales(child.id, periode),
  });
  const subTopicsQuery = useQuery({ queryKey: ['competences', child.idStructure, 'subtopics'], queryFn: () => api.getSubTopicServices(child.idStructure) });
  const servicesQuery = useQuery({ queryKey: ['competences', child.idStructure, 'services-eleve'], queryFn: () => api.getServices(child.idStructure) });
  const matieresQuery = useQuery({ queryKey: ['competences', child.idStructure, 'matieres-eleve'], queryFn: () => api.getStudentMatieres(child.idStructure) });

  if ([finalesQuery, subTopicsQuery, servicesQuery, matieresQuery].some((q) => q.isLoading)) return <LoadingScreen position={false} />;

  const devoirs = data.devoirs.filter((d) => periode === null || d.id_periode === periode);
  const services = servicesQuery.data ?? [];
  const groupes = new Set([child.idClasse, ...devoirs.map((d) => d.id_groupe).filter((g): g is string => !!g)]);
  // Enseignants de la matière (`matiere.ens`) : le titulaire du service évaluable de la classe, et
  // les co-enseignants ou remplaçants auteurs d'une évaluation de l'élève.
  const enseignantsOf = (matiereId: string) => {
    const ids = new Set<string>();
    for (const s of services) {
      if (s.id_matiere !== matiereId || !s.evaluable) continue;
      if (![s.id_groupe, ...(s.id_groups ?? [])].some((g) => g && groupes.has(g))) continue;
      ids.add(s.id_enseignant);
      for (const second of [...(s.coTeachers ?? []), ...(s.substituteTeachers ?? [])]) {
        if (devoirs.some((d) => d.owner === second.second_teacher_id)) ids.add(second.second_teacher_id);
      }
    }
    for (const d of devoirs) if (d.id_matiere === matiereId && !ids.size) ids.add(d.owner);
    return [...ids].map((id) => data.teacherOf({ owner: id })).filter(Boolean);
  };
  const lignes = releveLignes({
    devoirs,
    matieres: matieresQuery.data ?? [],
    finales: finalesQuery.data ?? [],
    subTopics: subTopicsQuery.data ?? [],
    services,
    classeId: child.idClasse,
    enseignantsOf,
  });
  const periodeObj = data.periodes.find((p) => p.id_type === periode) ?? null;

  return (
    <div className="d-flex flex-column gap-16">
      <h1 className="h3 mb-0">
        {t('evaluations.releve.title')}
        {isParent && ` — ${child.firstName}`}
      </h1>
      <div className="d-flex flex-wrap gap-12 align-items-end">
        <div>
          <label htmlFor={periodeId} className="form-label">
            {t('viescolaire.utils.periode')}
          </label>
          <select id={periodeId} className="form-select" value={periode ?? ''} onChange={(e) => setPeriode(e.target.value === '' ? null : Number(e.target.value))}>
            {data.periodes.map((p) => (
              <option key={p.id_type} value={p.id_type}>
                {periodeLabel({ id: p.id_type, type: p.type, ordre: p.ordre })}
              </option>
            ))}
            <option value="">{t('viescolaire.utils.annee')}</option>
          </select>
        </div>
        {devoirs.length > 0 && (
          <a className="btn btn-outline-primary" href={api.relevePdfUrl(child, periodeObj)}>
            {t('evaluations.export')}
          </a>
        )}
      </div>

      {lignes.length === 0 ? (
        <Alert type="info">{t('evaluations.no.summary.releve')}</Alert>
      ) : (
        <>
          <div className="table-responsive card">
            <table className="table align-middle mb-0">
              <thead>
                <tr>
                  <th scope="col">{t('viescolaire.utils.subject')}</th>
                  <th scope="col" colSpan={2}>
                    {t('evaluations.grade')}
                  </th>
                  <th scope="col">{t('average')}</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((m) => (
                  <MatiereRows key={m.id} matiere={m} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="small text-muted mb-0">
            * note <sup>n</sup> (m) : {t('evaluation.notation.explanation')}
          </p>
        </>
      )}
    </div>
  );
}

function MatiereHeader({ matiere, rowSpan }: { matiere: MatiereLigne; rowSpan?: number }) {
  return (
    <th scope="row" rowSpan={rowSpan} className="fw-normal">
      <div className="fw-bold">{matiere.name}</div>
      {matiere.enseignants.map((e) => (
        <div key={e} className="small text-muted">
          {e}
        </div>
      ))}
    </th>
  );
}

function MatiereRows({ matiere }: { matiere: MatiereLigne }) {
  if (matiere.sousMatieres.length === 0) {
    return (
      <tr>
        <MatiereHeader matiere={matiere} />
        <td colSpan={2}>
          <Notes devoirs={matiere.devoirs} />
        </td>
        <td className="fw-bold fs-5">{frNumber(matiere.moyenne)}</td>
      </tr>
    );
  }
  return (
    <>
      {matiere.sousMatieres.map((sm, i) => (
        <Fragment key={sm.id}>
          <tr>
            {i === 0 && <MatiereHeader matiere={matiere} rowSpan={matiere.sousMatieres.length} />}
            <td className="small">{sm.libelle}</td>
            <td>
              <Notes devoirs={sm.devoirs} />
              {sm.moyenne !== '' && <span className="ms-8 fw-bold">{frNumber(sm.moyenne)}</span>}
            </td>
            {i === 0 && (
              <td rowSpan={matiere.sousMatieres.length} className="fw-bold fs-5">
                {frNumber(matiere.moyenne)}
              </td>
            )}
          </tr>
        </Fragment>
      ))}
    </>
  );
}

/** Chaque note : valeur ou annotation, coefficient en exposant, (F) si formative, moyenne de la classe. */
function Notes({ devoirs }: { devoirs: FamilyDevoir[] }) {
  return (
    <div className="d-flex flex-wrap gap-12">
      {devoirs.map((d) => {
        const coef = d.coefficient !== null && d.coefficient !== undefined && Number(d.coefficient) !== 1 ? Number(d.coefficient) : null;
        const classe = moyenneClasse(d);
        return (
          <div key={d.id} className="text-center" title={`${formatDate(d.date)} — ${d.name}`}>
            <span className="fw-bold fs-5">{d.annotation ? d.annotation.libelle_court : frNumber(Number(d.note))}</span>
            {!d.annotation && <span> / {d.diviseur}</span>}
            {coef !== null && <sup className="fw-bold">{frNumber(coef)}</sup>}
            {d.formative && <span> (F)</span>}
            {d.sum_notes !== undefined && d.nbr_eleves !== undefined && (
              <div className="small text-muted">
                ({frNumber(classe)}
                {classe !== 'NN' && ` / ${d.diviseur}`})
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default FamilyReleve;
