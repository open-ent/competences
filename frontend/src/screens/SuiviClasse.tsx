import { Alert, LoadingScreen } from '@open-ent/react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import * as api from '../api';
import type { DomaineSuivi } from '../api';
import { ClasseSelect, StructureSelect, usePeriodeLabel } from '../features/Filters';
import { isChefEtabOrHeadTeacher, isValidClasse, sortClasses } from '../rules';
import { isEvaluable, Level, levelsForCycle, sortEleves, UNEVALUATED_COLOR } from '../saisie';
import { useStructure, useStructureData, useViewer } from '../structure';
import { ClasseEvaluation, classeLevels, classeShown, Conversion, distribution, myTeachers, TeacherSubject } from '../suivi';
import type { EleveDevoir } from '../types';

/**
 * Suivi des compétences d'une classe (`#/competences/classe`) : pour chaque compétence du socle,
 * la répartition des élèves par niveau ; un clic donne le niveau de chaque élève et mène à son
 * suivi.
 *
 * Pas encore portés : vue par enseignement, exports (récapitulatifs, relevés, tableaux de
 * moyennes en PDF ou CSV).
 */
export function SuiviClasse() {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const { structures, rightsLoaded, isLoading: structuresLoading } = useStructure();
  const data = useStructureData();
  const viewer = useViewer();
  const periodeLabel = usePeriodeLabel();
  const periodeId = useId();
  const [classeId, setClasseId] = useState<string | null>(null);
  const [periodeKey, setPeriodeKey] = useState('');

  const classes = useMemo(
    () => (viewer ? sortClasses(data.classes.filter((c) => isValidClasse(c.id, undefined, data.classes, viewer))) : []),
    [data.classes, viewer],
  );
  const classe = data.classes.find((c) => c.id === classeId);
  const periodesQuery = useQuery({
    queryKey: ['competences', 'periodes-classe', classeId],
    queryFn: () => api.getPeriodesClasse(classeId!),
    enabled: !!classeId,
  });
  const periodes = useMemo(() => (periodesQuery.data ?? []).filter((p) => p.id !== null).sort((a, b) => a.id_type - b.id_type), [periodesQuery.data]);
  useEffect(() => {
    if (!periodesQuery.data || periodeKey !== '') return;
    const today = viewer?.today ?? '';
    const current = periodes.find((p) => p.timestamp_dt.slice(0, 10) <= today && today <= p.timestamp_fn.slice(0, 10));
    setPeriodeKey(current ? String(current.id_type) : 'annee');
  }, [periodesQuery.data, periodes, periodeKey, viewer?.today]);

  if (structuresLoading || !rightsLoaded) return <LoadingScreen position={false} />;
  if (structures.length === 0) return <Alert type="info">{t('competences.react.no.structure')}</Alert>;
  if (data.isLoading || !viewer) return <LoadingScreen position={false} />;

  const periode = periodes.find((p) => String(p.id_type) === periodeKey) ?? null;

  return (
    <div className="d-flex flex-column gap-16">
      <h1 className="h3 mb-0">{t('evaluations.suivi.classe.title')}</h1>
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
              <option value="annee">{t('viescolaire.utils.annee')}</option>
            </select>
          </div>
        </div>
      </section>

      {!classe || periodeKey === '' ? (
        <Alert type="info">{t('evaluation.suivi.classe.empty')}</Alert>
      ) : classe.id_cycle == null ? (
        <Alert type="info">{t('evaluation.suivi.no.cycle')}</Alert>
      ) : (
        <ClasseView key={`${classe.id}-${periodeKey}`} classe={classe} periode={periode} />
      )}
    </div>
  );
}

function ClasseView({
  classe,
  periode,
}: {
  classe: NonNullable<ReturnType<typeof useStructureData>['classes'][number]>;
  periode: import('../types').PeriodeClasse | null;
}) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const { structureId } = useStructure();
  const viewer = useViewer()!;
  const idCycle = classe.id_cycle!;
  const chef = isChefEtabOrHeadTeacher(viewer, classe);
  const [onlyMine, setOnlyMine] = useState(!(chef || viewer.isPersEducNat));
  const [onlyEvaluated, setOnlyEvaluated] = useState(true);
  const teachers = useMemo(() => myTeachers(viewer.userId, classe, viewer.today), [viewer.userId, classe, viewer.today]);

  const domainesQuery = useQuery({ queryKey: ['competences', 'domaines-classe', classe.id], queryFn: () => api.getDomainesClasse(classe.id) });
  const notesQuery = useQuery({
    queryKey: ['competences', structureId, 'suivi-classe', classe.id, periode?.id_type ?? 'annee'],
    queryFn: () => api.getCompetenceNotesClasse(classe, structureId, periode?.id_type ?? null),
  });
  const elevesQuery = useQuery({ queryKey: ['competences', 'eleves-classe', classe.id], queryFn: () => api.getElevesDevoir(classe) });
  const conversionQuery = useQuery({ queryKey: ['competences', structureId, 'conversion', classe.id], queryFn: () => api.getConversionTable(structureId, classe.id) });
  const averageQuery = useQuery({ queryKey: ['competences', structureId, 'skill-average'], queryFn: () => api.getSkillAverageOption(structureId) });
  const levelsQuery = useQuery({ queryKey: ['competences', structureId, 'maitrise'], queryFn: () => api.getMaitriseLevels(structureId) });

  if ([domainesQuery, notesQuery, elevesQuery, conversionQuery, averageQuery, levelsQuery].some((q) => q.isLoading)) {
    return <LoadingScreen position={false} />;
  }
  if (domainesQuery.isError || notesQuery.isError) return <Alert type="danger">{t('competences.react.loading.error')}</Alert>;

  // Les élèves partis avant la période n'y figurent pas (`DisplayEvaluable`).
  const eleves = sortEleves((elevesQuery.data ?? []).filter((e) => isEvaluable(e, periode ?? undefined)));
  const levels = levelsForCycle(levelsQuery.data ?? [], idCycle);
  const table = conversionQuery.data ?? [];

  return (
    <section className="card p-16 d-flex flex-column gap-12">
      <div className="d-flex flex-wrap gap-16">
        <div className="form-check">
          <input id="classe-only-mine" type="checkbox" className="form-check-input" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
          <label htmlFor="classe-only-mine" className="form-check-label">
            {t('competences.react.suivi.only.mine')}
          </label>
        </div>
        <div className="form-check">
          <input
            id="classe-only-evaluated"
            type="checkbox"
            className="form-check-input"
            checked={onlyEvaluated}
            onChange={(e) => setOnlyEvaluated(e.target.checked)}
          />
          <label htmlFor="classe-only-evaluated" className="form-check-label">
            {t('evaluation.suivieleve.filtre.competence')}
          </label>
        </div>
      </div>
      {table.length === 0 && <Alert type="warning">{t('competences.react.suivi.no.conversion')}</Alert>}
      <p className="small text-muted mb-0">{t('competences.react.classe.count', { count: eleves.length })}</p>

      {(domainesQuery.data ?? []).map((d) => (
        <ClasseDomaine
          key={d.id}
          domaine={d}
          ctx={{
            classeId: classe.id,
            evaluations: notesQuery.data ?? [],
            eleves,
            teachers,
            table,
            levels,
            options: { average: !!averageQuery.data, isYear: periode === null, onlyMine },
            onlyEvaluated,
          }}
        />
      ))}
    </section>
  );
}

type Ctx = {
  classeId: string;
  evaluations: ClasseEvaluation[];
  eleves: EleveDevoir[];
  teachers: TeacherSubject[];
  table: Conversion[];
  levels: Level[];
  options: { average: boolean; isYear: boolean; onlyMine: boolean };
  onlyEvaluated: boolean;
};

const evalsOf = (ctx: Ctx, c: { id: number; id_domaine: number }) =>
  ctx.evaluations.filter((e) => e.id_competence === c.id && e.id_domaine === c.id_domaine);

function visible(domaine: DomaineSuivi, ctx: Ctx): boolean {
  return (
    (domaine.competences ?? []).some((c) => classeShown(evalsOf(ctx, c), c.masque, ctx.onlyEvaluated, ctx.options.onlyMine, ctx.teachers)) ||
    (domaine.domaines ?? []).some((d) => visible(d, ctx))
  );
}

function ClasseDomaine({ domaine, ctx }: { domaine: DomaineSuivi; ctx: Ctx }) {
  if (!visible(domaine, ctx)) return null;
  const competences = (domaine.competences ?? []).filter((c) =>
    classeShown(evalsOf(ctx, c), c.masque, ctx.onlyEvaluated, ctx.options.onlyMine, ctx.teachers),
  );
  const Heading = domaine.niveau === 1 ? 'h3' : 'h4';
  return (
    <details open={domaine.niveau > 1}>
      <summary>
        <Heading className={`d-inline ${domaine.niveau === 1 ? 'h5' : 'h6'}`}>
          {domaine.codification} - {domaine.libelle}
        </Heading>
      </summary>
      <div className="ms-16 mt-8 d-flex flex-column gap-4">
        {competences.map((c) => (
          <ClasseCompetence key={c.id} competence={c} ctx={ctx} />
        ))}
        {(domaine.domaines ?? []).map((d) => (
          <ClasseDomaine key={d.id} domaine={d} ctx={ctx} />
        ))}
      </div>
    </details>
  );
}

function ClasseCompetence({ competence, ctx }: { competence: { id: number; nom: string; id_domaine: number }; ctx: Ctx }) {
  const { t } = useTranslation(['competences', 'common']);
  const [open, setOpen] = useState(false);
  const perEleve = classeLevels(evalsOf(ctx, competence), ctx.eleves.map((e) => e.id), ctx.teachers, ctx.table, ctx.options);
  const maxValue = ctx.levels[0]?.value ?? 3;
  const parts = distribution(perEleve, maxValue);
  const total = ctx.eleves.length || 1;
  const levelOf = (v: number) => ctx.levels.find((l) => l.value === v);
  const nameOf = (v: number) => levelOf(v)?.libelle ?? t('competences.react.saisie.level.none');
  const summary = parts
    .filter((p) => p.count > 0)
    .map((p) => `${nameOf(p.value)} : ${p.count}`)
    .join(', ');

  return (
    <div className="border-bottom pb-4">
      <div className="d-flex align-items-center gap-12 flex-wrap">
        <button type="button" className="btn btn-link p-0 text-start flex-fill" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {competence.nom}
        </button>
        <div className="d-flex rounded overflow-hidden" style={{ width: 240, height: 16 }} role="img" aria-label={summary}>
          {parts
            .filter((p) => p.count > 0)
            .map((p) => (
              <span
                key={p.value}
                title={`${nameOf(p.value)} : ${p.count}`}
                style={{ width: `${(p.count / total) * 100}%`, background: levelOf(p.value)?.couleur ?? UNEVALUATED_COLOR, opacity: p.value < 0 ? 0.3 : 1 }}
              />
            ))}
        </div>
      </div>
      {open && (
        <ul className="list-unstyled d-flex flex-wrap gap-8 mt-8 mb-0">
          {ctx.eleves.map((e) => {
            const v = perEleve.get(e.id) ?? -1;
            const name = e.displayName ?? `${e.lastName ?? ''} ${e.firstName ?? ''}`.trim();
            return (
              <li key={e.id}>
                <Link
                  to={`/competences/eleve?idEleve=${e.id}&idClasse=${ctx.classeId}`}
                  className="d-inline-flex align-items-center gap-4 border rounded px-8 py-4 small text-decoration-none"
                  style={{ borderColor: levelOf(v)?.couleur ?? UNEVALUATED_COLOR }}
                  aria-label={`${name} : ${nameOf(v)}`}
                >
                  <span className="d-inline-block rounded-circle" style={{ width: 10, height: 10, background: levelOf(v)?.couleur ?? UNEVALUATED_COLOR, opacity: v < 0 ? 0.3 : 1 }} />
                  {name}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default SuiviClasse;
