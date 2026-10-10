import { Alert, LoadingScreen } from '@open-ent/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import * as api from '../api';
import { ClasseSelect, StructureSelect, usePeriodeLabel } from '../features/Filters';
import { AppreciationInput } from '../features/SaisieInputs';
import { appreciationsByElement, elementTitle, KIND_TYPE, MAX_PROJET_APPRECIATION, ProjetKind } from '../projets';
import { isChefEtabOrHeadTeacher, sortClasses } from '../rules';
import { isEvaluable, sortEleves } from '../saisie';
import { useStructure, useViewer } from '../structure';
import type { Classe, PeriodeClasse } from '../types';

const KINDS: Array<{ kind: ProjetKind; label: string; column: string }> = [
  { kind: 'EPI', label: 'evaluations.enseignements.pratiques.interdisciplinaires', column: 'evaluations.epi.appreciations' },
  { kind: 'AP', label: 'evaluations.accompagnement.personnalise', column: 'evaluations.ap.appreciations' },
  { kind: 'parcours', label: 'evaluations.parcours.educatifs', column: 'evaluations.parcours.appreciations' },
];

/**
 * Saisie des projets (`display_epi_ap_parcours.html`) : pour une classe et une période, les
 * éléments du bilan périodique sur lesquels l'enseignant intervient — EPI, accompagnement
 * personnalisé, parcours —, avec l'appréciation de chaque élève et celle de la classe.
 */
export function Projets() {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const { structureId, structures, rightsLoaded, isLoading: structuresLoading } = useStructure();
  const viewer = useViewer();
  const periodeLabel = usePeriodeLabel();
  const periodeId = useId();
  const [classeId, setClasseId] = useState<string | null>(null);
  const [periodeKey, setPeriodeKey] = useState('');
  const [kind, setKind] = useState<ProjetKind>('EPI');

  const classesQuery = useQuery({
    queryKey: ['competences', structureId, 'projet-classes'],
    queryFn: () => api.getProjetClasses(structureId),
    enabled: !!structureId,
  });
  const classes = useMemo(() => sortClasses((classesQuery.data ?? []).map((c) => ({ ...c, services: null }))), [classesQuery.data]);
  const classe = classes.find((c) => c.id === classeId);
  const periodesQuery = useQuery({
    queryKey: ['competences', 'periodes-classe', classeId],
    queryFn: () => api.getPeriodesClasse(classeId!),
    enabled: !!classeId,
  });
  const periodes = useMemo(() => (periodesQuery.data ?? []).filter((p) => p.id !== null).sort((a, b) => a.id_type - b.id_type), [periodesQuery.data]);
  useEffect(() => {
    if (!periodesQuery.data || periodeKey !== '') return;
    const today = viewer?.today ?? '';
    const current = periodes.find((p) => p.timestamp_dt.slice(0, 10) <= today && today <= p.timestamp_fn.slice(0, 10)) ?? periodes[0];
    if (current) setPeriodeKey(String(current.id_type));
  }, [periodesQuery.data, periodes, periodeKey, viewer?.today]);
  const periode = periodes.find((p) => String(p.id_type) === periodeKey);

  if (structuresLoading || !rightsLoaded || classesQuery.isLoading) return <LoadingScreen position={false} />;
  if (structures.length === 0) return <Alert type="info">{t('competences.react.no.structure')}</Alert>;
  if (!viewer) return <LoadingScreen position={false} />;

  return (
    <div className="d-flex flex-column gap-16">
      <h1 className="h3 mb-0">{t('evaluations.saisie.projets.title')}</h1>
      <section className="card p-16">
        <h2 className="h6">{t('viescolaire.utils.criterion')}</h2>
        <div className="row g-12">
          <StructureSelect className="col-12 col-md-4" />
          <ClasseSelect
            className="col-12 col-md-4"
            label={t('viescolaire.utils.class.groupe')}
            emptyLabel="—"
            classes={classes}
            value={classeId}
            onChange={(id) => {
              setClasseId(id);
              setPeriodeKey('');
            }}
          />
          <div className="col-12 col-md-4">
            <label htmlFor={periodeId} className="form-label">
              {t('viescolaire.utils.periode')}
            </label>
            <select id={periodeId} className="form-select" value={periodeKey} disabled={!classeId} onChange={(e) => setPeriodeKey(e.target.value)}>
              {periodes.map((p) => (
                <option key={p.id_type} value={String(p.id_type)}>
                  {periodeLabel({ id: p.id_type, type: p.type, ordre: p.ordre })}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {!classe || !periode ? (
        <Alert type="info">{t('evaluation.bilan.periodique.empty')}</Alert>
      ) : (
        <>
          <div className="btn-group" role="tablist">
            {KINDS.map((k) => (
              <button
                key={k.kind}
                type="button"
                role="tab"
                aria-selected={kind === k.kind}
                className={`btn ${kind === k.kind ? 'btn-primary' : 'btn-outline-primary'}`}
                onClick={() => setKind(k.kind)}
              >
                {t(k.label)}
              </button>
            ))}
          </div>
          <ProjetsView key={`${classe.id}-${periode.id_type}`} classe={classe} periode={periode} kind={kind} />
        </>
      )}
    </div>
  );
}

function ProjetsView({ classe, periode, kind }: { classe: Classe; periode: PeriodeClasse; kind: ProjetKind }) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const queryClient = useQueryClient();
  const { structureId } = useStructure();
  const viewer = useViewer()!;
  const [error, setError] = useState(false);

  const elementsQuery = useQuery({
    queryKey: ['competences', structureId, 'projet-elements', classe.id, viewer.userId],
    queryFn: () => api.getProjetElements(structureId, classe.id, viewer.userId),
  });
  const ids = (elementsQuery.data ?? []).map((e) => e.id);
  const teachersQuery = useQuery({
    queryKey: ['competences', structureId, 'projet-teachers', classe.id, ids],
    queryFn: () => api.getProjetTeachers(structureId, classe.id, ids),
    enabled: elementsQuery.isSuccess,
  });
  const appreciationsKey = ['competences', structureId, 'projet-appreciations', classe.id, periode.id_type, ids];
  const appreciationsQuery = useQuery({
    queryKey: appreciationsKey,
    queryFn: () => api.getProjetAppreciations(structureId, classe.id, periode.id_type, ids),
    enabled: elementsQuery.isSuccess,
  });
  const elevesQuery = useQuery({ queryKey: ['competences', 'eleves-classe', classe.id], queryFn: () => api.getElevesDevoir(classe) });

  if ([elementsQuery, elevesQuery].some((q) => q.isLoading) || appreciationsQuery.isLoading) return <LoadingScreen position={false} />;
  if (elementsQuery.isError) return <Alert type="danger">{t('evaluations.elements.get.error')}</Alert>;

  const elements = (elementsQuery.data ?? []).filter((e) => e.type === KIND_TYPE[kind]);
  const byElement = appreciationsByElement(appreciationsQuery.data ?? []);
  const eleves = sortEleves((elevesQuery.data ?? []).filter((e) => isEvaluable(e, periode)));
  // Passé la fin de saisie, seule la direction écrit encore (`BilanPeriodique.endSaisie`).
  const locked = !isChefEtabOrHeadTeacher(viewer) && !!periode.date_fin_saisie && viewer.today > periode.date_fin_saisie.slice(0, 10);
  const column = KINDS.find((k) => k.kind === kind)!.column;

  const save = async (elementId: number, value: string, previous: string, eleveId?: string) => {
    if (value === previous) return;
    try {
      setError(false);
      await api.saveProjetAppreciation({ structureId, classe, periode: periode.id_type, elementId }, value, eleveId);
    } catch {
      setError(true);
    } finally {
      await queryClient.invalidateQueries({ queryKey: appreciationsKey });
    }
  };

  return (
    <div className="d-flex flex-column gap-16">
      {locked && <Alert type="warning">{t('end.saisie.appreciation')}</Alert>}
      {error && <Alert type="danger">{t('competences.react.saisie.save.error')}</Alert>}
      {elements.length === 0 && <Alert type="info">{t('competences.react.projets.none')}</Alert>}
      {elements.map((element) => {
        const entry = byElement.get(element.id);
        return (
          <section key={element.id} className="card p-16 d-flex flex-column gap-12">
            <div>
              <h2 className="h5 mb-0">{elementTitle(element)}</h2>
              {element.type === 1 && element.theme && <div className="small text-muted">{element.theme.libelle}</div>}
              <div className="small fst-italic">{(teachersQuery.data?.get(element.id) ?? []).join(', ')}</div>
            </div>
            <div className="table-responsive">
              <table className="table align-middle mb-0">
                <thead>
                  <tr>
                    <th scope="col" style={{ width: '25%' }}>
                      {t('viescolaire.utils.student')}
                    </th>
                    <th scope="col">{t(column)}</th>
                  </tr>
                </thead>
                <tbody>
                  {eleves.map((eleve) => {
                    const name = eleve.displayName ?? `${eleve.lastName ?? ''} ${eleve.firstName ?? ''}`.trim();
                    const previous = entry?.eleves.get(eleve.id) ?? '';
                    return (
                      <tr key={eleve.id}>
                        <th scope="row" className={`fw-normal ${eleve.deleteDate ? 'text-decoration-line-through text-muted' : ''}`}>
                          {name}
                        </th>
                        <td>
                          <AppreciationInput
                            label={`${elementTitle(element)} ${name}`}
                            value={previous}
                            disabled={locked}
                            maxLength={MAX_PROJET_APPRECIATION}
                            onCommit={(value) => save(element.id, value, previous, eleve.id)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div>
              <h3 className="h6">{t('evaluations.releve.appreciation.classe')}</h3>
              <AppreciationInput
                label={`${t('evaluations.releve.appreciation.classe')} ${elementTitle(element)}`}
                value={entry?.classe ?? ''}
                disabled={locked}
                multiline
                maxLength={MAX_PROJET_APPRECIATION}
                onCommit={(value) => save(element.id, value, entry?.classe ?? '')}
              />
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default Projets;
