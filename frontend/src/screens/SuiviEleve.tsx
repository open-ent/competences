import { Alert, Button, LoadingScreen } from '@open-ent/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

import * as api from '../api';
import type { DomaineSuivi } from '../api';
import { ClasseSelect, StructureSelect, usePeriodeLabel } from '../features/Filters';
import { formatDate, isChefEtabOrHeadTeacher, isValidClasse, sortClasses } from '../rules';
import { Level, levelsForCycle, sortEleves, UNEVALUATED_COLOR } from '../saisie';
import { useStructure, useStructureData, useViewer } from '../structure';
import {
  CompetenceEvaluation,
  competenceLevels,
  Conversion,
  finalMatieres,
  isMine,
  isShown,
  myTeachers,
  nextFinal,
  TeacherSubject,
} from '../suivi';
import type { PeriodeClasse } from '../types';

/**
 * Suivi des compétences d'un élève (`#/competences/eleve`) : par domaine du socle, le niveau de
 * chaque compétence — sur toutes les évaluations, ou sur les miennes avec niveau atteint et niveau
 * final modifiable —, et le détail des évaluations qui l'ont produit.
 *
 * Accepte `?idEleve=…&idClasse=…`, posés par la recherche d'élève de l'accueil (comme l'AngularJS).
 *
 * Pas encore portés : bilan de fin de cycle, vue par enseignement, graphiques, onglets notes et
 * bulletins, export PDF, évaluation libre.
 */
export function SuiviEleve() {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const [params, setParams] = useSearchParams();
  const { structures, rightsLoaded, isLoading: structuresLoading } = useStructure();
  const data = useStructureData();
  const viewer = useViewer();
  const periodeLabel = usePeriodeLabel();
  const periodeId = useId();
  const eleveSelectId = useId();

  const classeId = params.get('idClasse');
  const eleveId = params.get('idEleve');
  const [periodeKey, setPeriodeKey] = useState<string>('');
  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v === null ? next.delete(k) : next.set(k, v)));
    setParams(next, { replace: true });
  };

  const classes = useMemo(
    () => (viewer ? sortClasses(data.classes.filter((c) => isValidClasse(c.id, undefined, data.classes, viewer))) : []),
    [data.classes, viewer],
  );
  const classe = data.classes.find((c) => c.id === classeId);

  const elevesQuery = useQuery({
    queryKey: ['competences', 'eleves-classe', classeId],
    queryFn: () => api.getElevesDevoir(classe!),
    enabled: !!classe,
  });
  const periodesQuery = useQuery({
    queryKey: ['competences', 'periodes-classe', classeId],
    queryFn: () => api.getPeriodesClasse(classeId!),
    enabled: !!classeId,
  });
  const periodes = useMemo(() => (periodesQuery.data ?? []).filter((p) => p.id !== null).sort((a, b) => a.id_type - b.id_type), [periodesQuery.data]);
  // Période par défaut : celle en cours, sinon l'année (`getCurrentPeriode`).
  useEffect(() => {
    if (!periodesQuery.data || periodeKey !== '') return;
    const today = viewer?.today ?? '';
    const current = periodes.find((p) => p.timestamp_dt.slice(0, 10) <= today && today <= p.timestamp_fn.slice(0, 10));
    setPeriodeKey(current ? String(current.id_type) : 'annee');
  }, [periodesQuery.data, periodes, periodeKey, viewer?.today]);
  const periode = periodes.find((p) => String(p.id_type) === periodeKey);

  const eleves = useMemo(() => sortEleves(elevesQuery.data ?? []), [elevesQuery.data]);
  const eleveIndex = eleves.findIndex((e) => e.id === eleveId);
  const eleve = eleves[eleveIndex];

  if (structuresLoading || !rightsLoaded) return <LoadingScreen position={false} />;
  if (structures.length === 0) return <Alert type="info">{t('competences.react.no.structure')}</Alert>;
  if (data.isLoading || !viewer) return <LoadingScreen position={false} />;

  const nameOf = (e: (typeof eleves)[number]) => e.displayName ?? `${e.lastName ?? ''} ${e.firstName ?? ''}`.trim();

  return (
    <div className="d-flex flex-column gap-16">
      <h1 className="h3 mb-0">{t('evaluations.suivi.eleve.title')}</h1>

      <section className="card p-16">
        <h2 className="h6">{t('viescolaire.utils.criterion')}</h2>
        <div className="row g-12">
          <StructureSelect className="col-12 col-md-3" />
          <ClasseSelect
            className="col-12 col-md-3"
            label={t('viescolaire.utils.class.groupe')}
            emptyLabel="—"
            classes={classes}
            value={classeId}
            onChange={(id) => {
              setPeriodeKey('');
              setParam({ idClasse: id, idEleve: null });
            }}
          />
          <div className="col-12 col-md-3">
            <label htmlFor={periodeId} className="form-label">
              {t('viescolaire.utils.periode')}
            </label>
            <select id={periodeId} className="form-select" value={periodeKey} disabled={!classeId} onChange={(e) => setPeriodeKey(e.target.value)}>
              {periodes.map((p) => (
                <option key={p.id_type} value={String(p.id_type)}>
                  {periodeLabel({ id: p.id_type, type: p.type, ordre: p.ordre })}
                </option>
              ))}
              <option value="annee">{t('viescolaire.utils.annee')}</option>
            </select>
          </div>
          <div className="col-12 col-md-3">
            <label htmlFor={eleveSelectId} className="form-label">
              {t('viescolaire.utils.student')}
            </label>
            <select
              id={eleveSelectId}
              className="form-select"
              value={eleveId ?? ''}
              disabled={!classeId}
              onChange={(e) => setParam({ idEleve: e.target.value || null })}
            >
              <option value="">—</option>
              {eleves.map((e) => (
                <option key={e.id} value={e.id}>
                  {nameOf(e)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {!classe || !eleve ? (
        <Alert type="info">{t('evaluation.suivi.eleve.empty')}</Alert>
      ) : classe.id_cycle == null ? (
        <Alert type="info">{t('evaluation.creation.no.cycle')}</Alert>
      ) : (
        <>
          <div className="d-flex align-items-center justify-content-between gap-12">
            <Button
              type="button"
              color="tertiary"
              variant="ghost"
              disabled={eleveIndex <= 0}
              onClick={() => setParam({ idEleve: eleves[eleveIndex - 1].id })}
            >
              ← {eleveIndex > 0 ? nameOf(eleves[eleveIndex - 1]) : ''}
            </Button>
            <h2 className={`h4 mb-0 ${eleve.deleteDate ? 'text-decoration-line-through' : ''}`}>{nameOf(eleve)}</h2>
            <Button
              type="button"
              color="tertiary"
              variant="ghost"
              disabled={eleveIndex >= eleves.length - 1}
              onClick={() => setParam({ idEleve: eleves[eleveIndex + 1].id })}
            >
              {eleveIndex < eleves.length - 1 ? nameOf(eleves[eleveIndex + 1]) : ''} →
            </Button>
          </div>
          <SuiviCompetences
            key={`${eleve.id}-${periodeKey}`}
            classe={classe}
            eleveId={eleve.id}
            periode={periodeKey === 'annee' ? null : (periode ?? null)}
          />
        </>
      )}
    </div>
  );
}

function SuiviCompetences({
  classe,
  eleveId,
  periode,
}: {
  classe: NonNullable<ReturnType<typeof useStructureData>['classes'][number]>;
  eleveId: string;
  periode: PeriodeClasse | null;
}) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const queryClient = useQueryClient();
  const { structureId, rights } = useStructure();
  const viewer = useViewer()!;
  const idCycle = classe.id_cycle!;
  const chef = isChefEtabOrHeadTeacher(viewer);
  const [onlyMine, setOnlyMine] = useState(!(chef || viewer.isPersEducNat));
  const [onlyEvaluated, setOnlyEvaluated] = useState(true);
  const [error, setError] = useState(false);

  const notesKey = ['competences', structureId, 'suivi', eleveId, idCycle, periode?.id_type ?? 'annee'];
  const domainesQuery = useQuery({
    queryKey: ['competences', 'domaines-eleve', classe.id, eleveId, idCycle],
    queryFn: () => api.getDomainesEleve(classe.id, eleveId, idCycle),
  });
  const notesQuery = useQuery({ queryKey: notesKey, queryFn: () => api.getCompetenceNotesEleve(eleveId, idCycle, periode?.id_type ?? null) });
  const conversionQuery = useQuery({
    queryKey: ['competences', structureId, 'conversion', classe.id],
    queryFn: () => api.getConversionTable(structureId, classe.id),
  });
  const averageQuery = useQuery({ queryKey: ['competences', structureId, 'skill-average'], queryFn: () => api.getSkillAverageOption(structureId) });
  const levelsQuery = useQuery({ queryKey: ['competences', structureId, 'maitrise'], queryFn: () => api.getMaitriseLevels(structureId) });

  const teachers = useMemo(() => myTeachers(viewer.userId, classe, viewer.today), [viewer.userId, classe, viewer.today]);

  if ([domainesQuery, notesQuery, conversionQuery, averageQuery, levelsQuery].some((q) => q.isLoading)) {
    return <LoadingScreen position={false} />;
  }
  if (domainesQuery.isError || notesQuery.isError) return <Alert type="danger">{t('competences.react.loading.error')}</Alert>;

  const levels = levelsForCycle(levelsQuery.data ?? [], idCycle);
  const table = conversionQuery.data ?? [];
  const evaluations = notesQuery.data ?? [];
  const isYear = periode === null;
  // Le niveau final d'une période close ne se modifie plus (`isEndSaisieNivFinal`).
  const finalLocked = periode?.date_fin_saisie ? viewer.today > periode.date_fin_saisie.slice(0, 10) : false;
  const canSetFinal = rights.saveCompetenceNiveauFinal && onlyMine;

  const setFinal = async (competenceId: number, evals: CompetenceEvaluation[], current: number | undefined) => {
    try {
      setError(false);
      await api.saveNiveauFinal({
        id_periode: periode?.id_type ?? null,
        id_eleve: eleveId,
        niveau_final: nextFinal(current, levels.length),
        id_competence: competenceId,
        ids_matieres: finalMatieres(evals, teachers),
      });
    } catch {
      setError(true);
    } finally {
      await queryClient.invalidateQueries({ queryKey: notesKey });
    }
  };

  return (
    <section className="card p-16 d-flex flex-column gap-12">
      <div className="d-flex flex-wrap gap-16">
        <div className="form-check">
          <input id="suivi-only-mine" type="checkbox" className="form-check-input" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
          <label htmlFor="suivi-only-mine" className="form-check-label">
            {t('competences.react.suivi.only.mine')}
          </label>
        </div>
        <div className="form-check">
          <input
            id="suivi-only-evaluated"
            type="checkbox"
            className="form-check-input"
            checked={onlyEvaluated}
            onChange={(e) => setOnlyEvaluated(e.target.checked)}
          />
          <label htmlFor="suivi-only-evaluated" className="form-check-label">
            {t('evaluation.suivieleve.filtre.competence')}
          </label>
        </div>
      </div>
      {table.length === 0 && <Alert type="warning">{t('competences.react.suivi.no.conversion')}</Alert>}
      {canSetFinal && finalLocked && <Alert type="warning">{t('evaluations.suivi.eleve.niveau.final.end.saisie.warning')}</Alert>}
      {error && <Alert type="danger">{t('competences.react.saisie.save.error')}</Alert>}

      <Legend levels={levels} />

      {(domainesQuery.data ?? []).map((domaine) => (
        <DomaineBlock
          key={domaine.id}
          domaine={domaine}
          evaluations={evaluations}
          teachers={teachers}
          table={table}
          levels={levels}
          options={{ average: !!averageQuery.data, isYear }}
          onlyMine={onlyMine}
          onlyEvaluated={onlyEvaluated}
          finalEditable={canSetFinal && !finalLocked}
          onSetFinal={setFinal}
        />
      ))}
    </section>
  );
}

function Legend({ levels }: { levels: Level[] }) {
  const { t } = useTranslation(['competences', 'common']);
  return (
    <ul className="list-inline small mb-0" aria-label={t('competences.react.suivi.legend')}>
      {[...levels].reverse().map((l) => (
        <li key={l.value} className="list-inline-item">
          <LevelBubble level={l} /> {l.libelle}
        </li>
      ))}
    </ul>
  );
}

function LevelBubble({ level, label }: { level: Level | undefined; label?: string }) {
  return (
    <span
      className="d-inline-block rounded-circle align-middle"
      role={label ? 'img' : undefined}
      aria-label={label}
      style={{ width: 18, height: 18, background: level?.couleur ?? UNEVALUATED_COLOR, opacity: level ? 1 : 0.3 }}
    />
  );
}

type BlockProps = {
  evaluations: CompetenceEvaluation[];
  teachers: TeacherSubject[];
  table: Conversion[];
  levels: Level[];
  options: { average: boolean; isYear: boolean };
  onlyMine: boolean;
  onlyEvaluated: boolean;
  finalEditable: boolean;
  onSetFinal: (competenceId: number, evals: CompetenceEvaluation[], current: number | undefined) => Promise<void>;
};

/** Un domaine, ses compétences visibles, puis ses sous-domaines ; caché s'il ne montre rien. */
function DomaineBlock({ domaine, ...props }: BlockProps & { domaine: DomaineSuivi }) {
  const rows = (domaine.competences ?? [])
    .map((c) => ({
      competence: c,
      evals: props.evaluations.filter((e) => e.id_competence === c.id && e.id_domaine === c.id_domaine),
    }))
    .filter(({ competence, evals }) => isShown(evals, competence.masque, props.onlyEvaluated, props.onlyMine, props.teachers));
  const children = (domaine.domaines ?? []).filter((d) => hasVisible(d, props));
  if (rows.length === 0 && children.length === 0) return null;
  const Heading = domaine.niveau === 1 ? 'h3' : 'h4';
  return (
    <details open={domaine.niveau > 1}>
      <summary>
        <Heading className={`d-inline ${domaine.niveau === 1 ? 'h5' : 'h6'}`}>
          {domaine.codification} - {domaine.libelle}
        </Heading>
      </summary>
      <div className="ms-16 mt-8 d-flex flex-column gap-4">
        {rows.map(({ competence, evals }) => (
          <CompetenceRow key={competence.id} competence={competence} evals={evals} {...props} />
        ))}
        {children.map((d) => (
          <DomaineBlock key={d.id} domaine={d} {...props} />
        ))}
      </div>
    </details>
  );
}

function hasVisible(domaine: DomaineSuivi, props: BlockProps): boolean {
  const own = (domaine.competences ?? []).some((c) =>
    isShown(
      props.evaluations.filter((e) => e.id_competence === c.id && e.id_domaine === c.id_domaine),
      c.masque,
      props.onlyEvaluated,
      props.onlyMine,
      props.teachers,
    ),
  );
  return own || (domaine.domaines ?? []).some((d) => hasVisible(d, props));
}

function CompetenceRow({
  competence,
  evals,
  ...props
}: BlockProps & { competence: { id: number; nom: string }; evals: CompetenceEvaluation[] }) {
  const { t } = useTranslation(['competences', 'common']);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const levels = competenceLevels(evals, props.teachers, props.table, props.options);
  const levelOf = (value: number | undefined) => (value === undefined || value < 0 ? undefined : props.levels.find((l) => l.value === value));
  const describe = (value: number | undefined) => levelOf(value)?.libelle ?? t('competences.react.saisie.level.none');
  const shownEvals = (props.onlyMine ? evals.filter((e) => isMine(e, props.teachers)) : evals).filter((e) => e.evaluation > -1);

  return (
    <div className="border-bottom pb-4">
      <div className="d-flex align-items-center gap-12 flex-wrap">
        <button type="button" className="btn btn-link p-0 text-start flex-fill" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {competence.nom}
        </button>
        {props.onlyMine ? (
          <>
            <span className="small text-muted">{t('evaluation.suivi.niveau.atteint')}</span>
            <LevelBubble level={levelOf(levels.atteint)} label={`${t('evaluation.suivi.niveau.atteint')} : ${describe(levels.atteint)}`} />
            <span className="small text-muted">{t('evaluation.suivi.niveau.final')}</span>
            {props.finalEditable && levels.final !== undefined ? (
              <button
                type="button"
                className="btn p-0 border-0"
                disabled={busy}
                aria-label={t('competences.react.suivi.final.change', { level: describe(levels.final) })}
                onClick={async () => {
                  setBusy(true);
                  await props.onSetFinal(competence.id, evals, levels.final);
                  setBusy(false);
                }}
              >
                <LevelBubble level={levelOf(levels.final)} />
              </button>
            ) : (
              <LevelBubble level={levelOf(levels.final)} label={`${t('evaluation.suivi.niveau.final')} : ${describe(levels.final)}`} />
            )}
          </>
        ) : (
          <>
            <span className="small text-muted">{t('evaluation.suivi.niveau')}</span>
            <LevelBubble level={levelOf(levels.all)} label={`${t('evaluation.suivi.niveau')} : ${describe(levels.all)}`} />
          </>
        )}
      </div>
      {open && (
        <table className="table table-sm small mt-8 mb-0">
          <thead>
            <tr>
              <th scope="col">{t('date')}</th>
              <th scope="col">{t('viescolaire.notes.title')}</th>
              <th scope="col">{t('evaluations.test.teacher')}</th>
              <th scope="col">{t('evaluation.suivi.niveau')}</th>
            </tr>
          </thead>
          <tbody>
            {shownEvals.length === 0 && (
              <tr>
                <td colSpan={4} className="text-muted">
                  {t('competences.react.suivi.no.evaluation')}
                </td>
              </tr>
            )}
            {shownEvals.map((e) => (
              <tr key={e.id_competences_notes}>
                <td>{formatDate(e.evaluation_date)}</td>
                <td>
                  {e.evaluation_libelle}
                  {e.formative && <span className="text-muted"> ({t('competences.react.suivi.formative')})</span>}
                </td>
                <td>{e.owner_name}</td>
                <td>
                  <LevelBubble level={levelOf(e.evaluation)} label={describe(e.evaluation)} /> {describe(e.evaluation)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default SuiviEleve;
