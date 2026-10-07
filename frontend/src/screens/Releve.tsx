import { useEdificeClient } from '@open-ent/react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '../api';

/**
 * Relevé de notes — parité IHM AngularJS (CCTP 51C).
 * Sélection classe / matière / période, puis tableau des élèves avec moyenne de la période
 * et moyenne finale (GET /competences/releve). Accès réservé à l'enseignant de la matière
 * (ou admin) : message explicite si l'accès est refusé.
 */
export function Releve() {
  const { t } = useTranslation(['competences', 'common']);
  const { user, init } = useEdificeClient();
  const structureId = user?.structures?.[0] ?? '';

  const classesQuery = useQuery({ queryKey: ['comp', 'classes', structureId], queryFn: () => api.getClasses(structureId), enabled: !!structureId });
  const matieresQuery = useQuery({ queryKey: ['comp', 'matieres', structureId], queryFn: () => api.getMatieres(structureId), enabled: !!structureId });
  const periodesQuery = useQuery({ queryKey: ['comp', 'periodes', structureId], queryFn: () => api.getPeriodes(structureId), enabled: !!structureId });

  const [classId, setClassId] = useState('');
  const [matiereId, setMatiereId] = useState('');
  const [periodeId, setPeriodeId] = useState<number | ''>('');

  useEffect(() => { if (!classId && classesQuery.data?.length) setClassId(classesQuery.data[0].id); }, [classId, classesQuery.data]);
  useEffect(() => { if (!matiereId && matieresQuery.data?.length) setMatiereId(matieresQuery.data[0].id); }, [matiereId, matieresQuery.data]);
  useEffect(() => { if (periodeId === '' && periodesQuery.data?.length) setPeriodeId(periodesQuery.data[0].id); }, [periodeId, periodesQuery.data]);

  const releveQuery = useQuery({
    queryKey: ['comp', 'releve', structureId, classId, matiereId, periodeId],
    queryFn: () => api.getReleve(structureId, classId, matiereId, Number(periodeId)),
    enabled: !!structureId && !!classId && !!matiereId && periodeId !== '',
  });
  const releve = releveQuery.data;

  if (init && !structureId) {
    return (
      <div>
        <h1>{t('competences.title', { defaultValue: 'Compétences' })}</h1>
        <div className="alert alert-info" role="alert">{t('competences.no.structure', { defaultValue: 'Aucun établissement associé à votre compte.' })}</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-16">{t('competences.releve.title', { defaultValue: 'Relevé de notes' })}</h1>

      <div className="d-flex gap-12 align-items-end flex-wrap mb-16">
        <div style={{ minWidth: 200 }}>
          <label htmlFor="rel-class" className="form-label">{t('competences.class', { defaultValue: 'Classe' })}</label>
          <select id="rel-class" className="form-select" value={classId} onChange={(e) => setClassId(e.target.value)}>
            {(classesQuery.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div style={{ minWidth: 220 }}>
          <label htmlFor="rel-mat" className="form-label">{t('competences.subject', { defaultValue: 'Matière' })}</label>
          <select id="rel-mat" className="form-select" value={matiereId} onChange={(e) => setMatiereId(e.target.value)}>
            {(matieresQuery.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div style={{ minWidth: 160 }}>
          <label htmlFor="rel-per" className="form-label">{t('competences.periode', { defaultValue: 'Période' })}</label>
          <select id="rel-per" className="form-select" value={periodeId} onChange={(e) => setPeriodeId(Number(e.target.value))}>
            {(periodesQuery.data ?? []).map((p, i) => <option key={p.id} value={p.id}>{t('competences.periode.n', { defaultValue: 'Période {{n}}', n: p.ordre ?? i + 1 })}</option>)}
          </select>
        </div>
      </div>

      {releveQuery.isLoading && <p>{t('competences.loading', { defaultValue: 'Chargement…' })}</p>}
      {releveQuery.isError && <div className="alert alert-warning" role="alert">{t('competences.error', { defaultValue: 'Une erreur est survenue.' })}</div>}
      {!releveQuery.isLoading && releve === null && (
        <div className="alert alert-info" role="alert">
          {t('competences.releve.forbidden', { defaultValue: 'Accès au relevé réservé à l’enseignant de cette matière (ou à un administrateur).' })}
        </div>
      )}
      {releve && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table className="table table-bordered mb-0">
              <thead>
                <tr>
                  <th>{t('competences.student', { defaultValue: 'Élève' })}</th>
                  <th className="text-center">{t('competences.releve.moyenne', { defaultValue: 'Moyenne période' })}</th>
                  <th className="text-center">{t('competences.releve.moyenneFinale', { defaultValue: 'Moyenne finale' })}</th>
                </tr>
              </thead>
              <tbody>
                {releve.eleves.map((e) => (
                  <tr key={e.id}>
                    <td>{e.displayName}</td>
                    <td className="text-center">{e.moyenne || '—'}</td>
                    <td className="text-center">{e.moyenneFinale || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {releve.appreciationClasse && (
            <p className="mt-12"><strong>{t('competences.releve.appreciation', { defaultValue: 'Appréciation de la classe' })} :</strong> {releve.appreciationClasse}</p>
          )}
        </>
      )}
    </div>
  );
}

export default Releve;
