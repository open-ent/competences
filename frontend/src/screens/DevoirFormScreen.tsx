import { Alert, Button, LoadingScreen, Modal, useEdificeClient } from '@open-ent/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';

import * as api from '../api';
import {
  checkDates,
  ChosenCompetence,
  competencesDiff,
  currentPeriode,
  defaultCoefficient,
  destructiveChanges,
  devoirPayload,
  DevoirForm,
  filterTree,
  leavesOf,
  MAX_COMPETENCES,
  missingFields,
  moveCompetence,
  periodesOf,
  teachersForClasse,
  toggleCompetences,
  TreeNode,
  viewerAsOwner,
} from '../devoirForm';
import { ClasseSelect, SimpleSelect, usePeriodeLabel } from '../features/Filters';
import { canOpenDevoir, isChefEtabOrHeadTeacher, isHeadTeacher, matieresForClasse, sortClasses } from '../rules';
import { competenceLabel, isEndSaisie } from '../saisie';
import { useStructure, useStructureData, useViewer } from '../structure';
import type { Classe, Devoir } from '../types';

const isoDay = (value: string | null | undefined) => (value ?? '').slice(0, 10);

/**
 * Création (`#/devoir/create`) et modification (`#/devoir/:idDevoir/edit`) d'une évaluation —
 * `display_creation_devoir.html`. Deux volets, comme dans l'AngularJS : les informations, puis
 * les compétences évaluées ; un récapitulatif les accompagne.
 *
 * Écarts assumés : le filtre par domaine et la reprise automatique des compétences de la dernière
 * évaluation (préférences de l'AngularJS) sont remplacés par un bouton explicite « reprendre ».
 */
export function DevoirFormScreen({ mode }: { mode: 'create' | 'edit' }) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const { idDevoir } = useParams();
  const { structureId, rightsLoaded } = useStructure();
  const data = useStructureData();
  const viewer = useViewer();
  const editedId = mode === 'edit' ? Number(idDevoir) : null;
  const devoir = editedId !== null ? data.devoirs.find((d) => d.id === editedId) : undefined;

  const initialCompetencesQuery = useQuery({
    queryKey: ['competences', structureId, 'devoir', editedId, 'competences'],
    queryFn: () => api.getCompetencesDevoir(editedId!),
    enabled: editedId !== null,
  });

  if (!rightsLoaded || data.isLoading || !viewer || initialCompetencesQuery.isLoading) {
    return <LoadingScreen position={false} />;
  }
  if (mode === 'edit' && !devoir) {
    return (
      <div className="d-flex flex-column gap-16">
        <Alert type="warning">{t('competences.react.saisie.not.found')}</Alert>
        <Link to="/devoirs/list">{t('competences.react.saisie.back')}</Link>
      </div>
    );
  }

  // Classes où l'usager peut évaluer une matière (`isValidClasseMatiere`).
  const classes = sortClasses(data.classes.filter((c) => canOpenDevoir(c.id, data.matieres, data.classes, viewer)));
  if (mode === 'create' && classes.length === 0) {
    return <Alert type="info">{t('evaluation.no.service.evaluable')}</Alert>;
  }

  return (
    <FormBody
      key={editedId ?? 'create'}
      devoir={devoir}
      classes={mode === 'edit' && devoir && !classes.some((c) => c.id === devoir.id_groupe)
        ? [...classes, ...data.classes.filter((c) => c.id === devoir.id_groupe)]
        : classes}
      initialCompetences={(initialCompetencesQuery.data ?? [])
        .slice()
        .sort((a, b) => a.index - b.index)
        .map((c) => ({ id: c.id_competence, nom: c.nom, code_domaine: c.code_domaine }))}
    />
  );
}

function FormBody({
  devoir,
  classes,
  initialCompetences,
}: {
  devoir: Devoir | undefined;
  classes: Classe[];
  initialCompetences: ChosenCompetence[];
}) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useEdificeClient();
  const { structureId } = useStructure();
  const data = useStructureData();
  const viewer = useViewer()!;
  const periodeLabel = usePeriodeLabel();
  const chef = isChefEtabOrHeadTeacher(viewer);
  const today = viewer.today;

  const [form, setForm] = useState<DevoirForm>(() =>
    devoir
      ? {
          id_groupe: devoir.id_groupe,
          owner: devoir.owner,
          id_matiere: devoir.id_matiere,
          id_sousmatiere: devoir.id_sousmatiere,
          id_type: devoir.id_type,
          name: devoir.name,
          libelle: devoir.libelle ?? '',
          is_evaluated: devoir.is_evaluated,
          diviseur: String(devoir.diviseur),
          ramener_sur: devoir.ramener_sur,
          coefficient: String(devoir.coefficient ?? ''),
          id_periode: devoir.id_periode,
          date: isoDay(devoir.date),
          date_publication: isoDay(devoir.date_publication),
          apprec_visible: !!devoir.apprec_visible,
          competences: initialCompetences,
        }
      : {
          id_groupe: classes[0]?.id ?? null,
          owner: chef ? null : (user?.userId ?? null),
          id_matiere: null,
          id_sousmatiere: null,
          id_type: data.types.find((ty) => ty.default_type)?.id ?? data.types[0]?.id ?? null,
          name: '',
          libelle: '',
          is_evaluated: false,
          diviseur: '20',
          ramener_sur: false,
          coefficient: defaultCoefficient(data.types.find((ty) => ty.default_type)),
          id_periode: null,
          date: today,
          date_publication: today,
          apprec_visible: false,
          competences: [],
        },
  );
  const set = (patch: Partial<DevoirForm>) => setForm((f) => ({ ...f, ...patch }));
  const [tab, setTab] = useState<'informations' | 'competences'>('informations');
  const [missing, setMissing] = useState<string[] | null>(null);
  const [destructive, setDestructive] = useState<ReturnType<typeof destructiveChanges> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const classe = data.classes.find((c) => c.id === form.id_groupe);
  const periodesQuery = useQuery({
    queryKey: ['competences', 'periodes-classe', form.id_groupe],
    queryFn: () => api.getPeriodesClasse(form.id_groupe!),
    enabled: !!form.id_groupe,
  });
  const periodes = periodesOf(periodesQuery.data ?? []);
  const periode = periodes.find((p) => p.id_type === form.id_periode);

  // Période par défaut d'une création : celle en cours pour la classe choisie.
  useEffect(() => {
    if (devoir || form.id_periode !== null || !periodesQuery.data) return;
    const current = currentPeriode(periodesQuery.data, today);
    if (current) set({ id_periode: current.id_type });
  }, [devoir, form.id_periode, periodesQuery.data, today]);

  // Enseignant (direction) puis matières du propriétaire.
  const teachers = useMemo(() => teachersForClasse(data.enseignants, classe, today), [data.enseignants, classe, today]);
  useEffect(() => {
    if (!chef || form.owner) return;
    if (teachers[0]) set({ owner: teachers[0].id });
  }, [chef, form.owner, teachers]);

  const matieres = useMemo(() => {
    const seen = new Set<string>();
    const offered = matieresForClasse(data.matieres, form.id_groupe, data.classes, viewerAsOwner(viewer, form.owner)).filter(
      (m) => !seen.has(m.name) && !!seen.add(m.name),
    );
    // En modification, la matière enregistrée reste proposée même si le service a changé depuis :
    // l'AngularJS la remplaçait en silence par la première matière venue.
    const current = devoir && form.id_groupe === devoir.id_groupe ? data.matieres.find((m) => m.id === devoir.id_matiere) : undefined;
    return current && !offered.some((m) => m.id === current.id) ? [current, ...offered] : offered;
  }, [data.matieres, data.classes, form.id_groupe, form.owner, viewer, devoir]);
  useEffect(() => {
    if (form.id_matiere && matieres.some((m) => m.id === form.id_matiere)) return;
    const first = matieres[0];
    set({
      id_matiere: first?.id ?? null,
      id_sousmatiere: first?.sousMatieres?.[0] ? Number(first.sousMatieres[0].id_type_sousmatiere) : null,
    });
  }, [matieres, form.id_matiere]);
  const matiere = data.matieres.find((m) => m.id === form.id_matiere);

  const enseignementsQuery = useQuery({
    queryKey: ['competences', 'enseignements', form.id_groupe],
    queryFn: () => api.getEnseignements(form.id_groupe!),
    enabled: !!form.id_groupe && classe?.id_cycle != null,
  });

  const dates = checkDates(form, periode, today, chef);
  // La modification d'une évaluation dont la saisie est close est réservée à la direction.
  const devoirPeriode = devoir ? periodes.find((p) => p.id_type === devoir.id_periode) : undefined;
  const locked = !!devoir && classe !== undefined && isEndSaisie(devoirPeriode, today, isHeadTeacher(classe, viewer)) && !chef;

  const changeClasse = (id: string | null) => {
    const next = data.classes.find((c) => c.id === id);
    set({
      id_groupe: id,
      id_periode: null,
      owner: chef ? null : form.owner,
      // Un autre cycle, un autre référentiel : les compétences choisies n'y ont plus de sens.
      competences: next?.id_cycle === classe?.id_cycle ? form.competences : [],
    });
  };

  const save = async () => {
    setSaving(true);
    setSaveError(false);
    try {
      const payload = devoirPayload(form, structureId, classe?.type_groupe ?? 0);
      let id = devoir?.id;
      if (devoir) {
        await api.updateDevoir(devoir.id, {
          ...payload,
          old_id_groupe: devoir.id_groupe,
          competences: [],
          ...competencesDiff(initialCompetencesIds(), form.competences),
        });
      } else {
        const created = await api.createDevoir({ ...payload, competences: form.competences.map((c) => c.id) });
        id = created?.id;
      }
      await queryClient.invalidateQueries({ queryKey: ['competences', structureId] });
      if (id) navigate(`/devoir/${id}`);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
      setDestructive(null);
    }
  };

  const initialCompetencesIds = () => initialCompetences.map((c) => c.id);

  const onSubmit = async () => {
    const problems = missingFields(form, dates, chef);
    if (!periode && form.id_periode !== null) problems.push('viescolaire.utils.periode');
    if (problems.length > 0) {
      setMissing(problems);
      return;
    }
    if (devoir) {
      const evaluated = await api.getEvaluationInformation(devoir.id).catch(() => []);
      const changes = destructiveChanges(
        { id_groupe: devoir.id_groupe, is_evaluated: devoir.is_evaluated, competences: initialCompetencesIds() },
        form,
        evaluated,
      );
      const hasNotes = evaluated.length > 0;
      if (changes.removedEvaluated.length > 0 || changes.dropsNotes || (changes.changesClasse && hasNotes)) {
        setDestructive(changes);
        return;
      }
    }
    await save();
  };

  const classeName = (id: string | null) => data.classes.find((c) => c.id === id)?.name ?? '';

  return (
    <div className="d-flex flex-column gap-16">
      <Link to={devoir ? `/devoir/${devoir.id}` : '/devoirs/list'}>← {t('competences.react.saisie.back')}</Link>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-12">
        <h1 className="h3 mb-0">{t(devoir ? 'evaluations.test.edit' : 'evaluations.test.new')}</h1>
        <Button color="primary" variant="filled" onClick={onSubmit} isLoading={saving} disabled={locked}>
          {t('viescolaire.utils.save')}
        </Button>
      </div>
      {locked && <Alert type="warning">{t('evaluations.devoir.uncancelable')}</Alert>}
      {saveError && <Alert type="danger">{t('competences.react.saisie.save.error')}</Alert>}

      <div className="row g-16">
        <div className="col-12 col-lg-8 d-flex flex-column gap-12">
          <div className="btn-group" role="tablist">
            {(['informations', 'competences'] as const).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className={`btn ${tab === key ? 'btn-primary' : 'btn-outline-primary'}`}
                onClick={() => setTab(key)}
              >
                {t(key === 'informations' ? 'competences.react.form.tab.informations' : 'evaluations.test.competences')}
                {key === 'competences' && ` (${form.competences.length})`}
              </button>
            ))}
          </div>

          {tab === 'informations' ? (
            <section className="card p-16 d-flex flex-column gap-12" role="tabpanel">
              <p className="small text-muted mb-0">{t('competences.react.form.required')}</p>
              <div className="row g-12">
                <ClasseSelect
                  className="col-12 col-md-6"
                  label={`${t('viescolaire.utils.class.groupe')} *`}
                  emptyLabel="—"
                  classes={classes}
                  value={form.id_groupe}
                  onChange={changeClasse}
                />
                {chef && (
                  <SimpleSelect
                    className="col-12 col-md-6"
                    label={`${t('viescolaire.utils.teacher')} *`}
                    emptyLabel="—"
                    options={teachers.map((e) => ({ value: e.id, label: e.displayName }))}
                    value={form.owner}
                    onChange={(owner) => set({ owner, id_matiere: null })}
                  />
                )}
                <SimpleSelect
                  className="col-12 col-md-6"
                  label={`${t('viescolaire.utils.subject')} *`}
                  emptyLabel="—"
                  options={matieres.map((m) => ({ value: m.id, label: m.name }))}
                  value={form.id_matiere}
                  onChange={(id) => {
                    const m = data.matieres.find((x) => x.id === id);
                    set({ id_matiere: id, id_sousmatiere: m?.sousMatieres?.[0] ? Number(m.sousMatieres[0].id_type_sousmatiere) : null });
                  }}
                />
                {matiere?.sousMatieres && matiere.sousMatieres.length > 0 && (
                  <SimpleSelect
                    className="col-12 col-md-6"
                    label={t('viescolaire.utils.undersubject')}
                    emptyLabel="—"
                    options={matiere.sousMatieres.map((s) => ({ value: Number(s.id_type_sousmatiere), label: s.libelle }))}
                    value={form.id_sousmatiere}
                    onChange={(id_sousmatiere) => set({ id_sousmatiere })}
                  />
                )}
                <SimpleSelect
                  className="col-12 col-md-6"
                  label={`${t('viescolaire.utils.type')} *`}
                  emptyLabel="—"
                  options={data.types.map((ty) => ({ value: ty.id, label: ty.nom }))}
                  value={form.id_type}
                  onChange={(id_type) =>
                    set({
                      id_type,
                      coefficient: form.is_evaluated ? defaultCoefficient(data.types.find((ty) => ty.id === id_type)) : form.coefficient,
                    })
                  }
                />
              </div>

              <Field label={`${t('evaluations.test.title')} *`}>
                {(id) => (
                  <input id={id} type="text" className="form-control" value={form.name} onChange={(e) => set({ name: e.target.value })} />
                )}
              </Field>
              <Field label={t('viescolaire.utils.description')}>
                {(id) => (
                  <textarea
                    id={id}
                    className="form-control"
                    rows={3}
                    maxLength={255}
                    value={form.libelle}
                    onChange={(e) => set({ libelle: e.target.value })}
                  />
                )}
              </Field>

              <div className="form-check">
                <input
                  id="devoir-is-evaluated"
                  type="checkbox"
                  className="form-check-input"
                  checked={form.is_evaluated}
                  onChange={(e) =>
                    set({
                      is_evaluated: e.target.checked,
                      coefficient: e.target.checked ? defaultCoefficient(data.types.find((ty) => ty.id === form.id_type)) : form.coefficient,
                    })
                  }
                />
                <label htmlFor="devoir-is-evaluated" className="form-check-label">
                  {t('evaluations.test.is.evaluated')} **
                </label>
              </div>
              {form.is_evaluated && (
                <div className="row g-12 align-items-end">
                  <Field className="col-6 col-md-3" label={t('evaluations.test.grade.on')}>
                    {(id) => (
                      <input
                        id={id}
                        type="number"
                        min={1}
                        className="form-control"
                        value={form.diviseur}
                        onChange={(e) => set({ diviseur: e.target.value, ramener_sur: e.target.value === '20' ? false : form.ramener_sur })}
                      />
                    )}
                  </Field>
                  <Field className="col-6 col-md-3" label={`${t('viescolaire.utils.coefficient')} *`}>
                    {(id) => (
                      <input
                        id={id}
                        type="number"
                        min={0}
                        step="0.5"
                        className="form-control"
                        value={form.coefficient}
                        onChange={(e) => set({ coefficient: e.target.value })}
                      />
                    )}
                  </Field>
                  <div className="col-12 col-md-6 form-check">
                    <input
                      id="devoir-ramener-sur"
                      type="checkbox"
                      className="form-check-input"
                      checked={form.ramener_sur}
                      disabled={form.diviseur === '20'}
                      onChange={(e) => set({ ramener_sur: e.target.checked })}
                    />
                    <label htmlFor="devoir-ramener-sur" className="form-check-label">
                      {t('evaluations.test.grade.report.average')}
                    </label>
                  </div>
                </div>
              )}

              <div className="row g-12">
                <Field className="col-12 col-md-4" label={`${t('viescolaire.utils.periode')} *`}>
                  {(id) => (
                    <select
                      id={id}
                      className="form-select"
                      value={form.id_periode ?? ''}
                      disabled={!form.id_groupe}
                      onChange={(e) => set({ id_periode: e.target.value === '' ? null : Number(e.target.value) })}
                    >
                      <option value="">—</option>
                      {periodes.map((p) => (
                        <option key={p.id_type} value={p.id_type}>
                          {periodeLabel({ id: p.id_type, type: p.type, ordre: p.ordre })}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field className="col-6 col-md-4" label={`${t('evaluations.test.date')} *`}>
                  {(id) => (
                    <input id={id} type="date" className="form-control" value={form.date} onChange={(e) => set({ date: e.target.value })} />
                  )}
                </Field>
                <Field className="col-6 col-md-4" label={`${t('evaluations.test.grade.publication.date')} *`}>
                  {(id) => (
                    <input
                      id={id}
                      type="date"
                      className="form-control"
                      value={form.date_publication}
                      onChange={(e) => set({ date_publication: e.target.value })}
                    />
                  )}
                </Field>
              </div>
              {dates?.dateOutOfPeriode && <Alert type="warning">{t('devoir.errDateDevoir')}</Alert>}
              {dates?.publicationBeforeDate && <Alert type="warning">{t('devoir.errDatePubli')}</Alert>}
              {dates?.endSaisie && <Alert type="warning">{t('end.saisie')}</Alert>}

              <div className="form-check">
                <input
                  id="devoir-apprec-visible"
                  type="checkbox"
                  className="form-check-input"
                  checked={form.apprec_visible}
                  onChange={(e) => set({ apprec_visible: e.target.checked })}
                />
                <label htmlFor="devoir-apprec-visible" className="form-check-label">
                  {t('evaluations.devoir.appreciation.creation')}
                </label>
              </div>
            </section>
          ) : (
            <section className="card p-16" role="tabpanel">
              {classe?.id_cycle == null ? (
                <Alert type="info">{t('evaluation.creation.no.cycle')}</Alert>
              ) : enseignementsQuery.isLoading ? (
                <LoadingScreen position={false} />
              ) : (
                <CompetencePicker
                  enseignements={enseignementsQuery.data ?? []}
                  chosen={form.competences}
                  alreadyUsed={new Set(initialCompetences.map((c) => c.id))}
                  onChange={(competences) => set({ competences })}
                />
              )}
            </section>
          )}
        </div>

        <aside className="col-12 col-lg-4">
          <section className="card p-16">
            <h2 className="h6">{t('evaluations.devoir.recaputilatif')}</h2>
            <dl className="small mb-12">
              <dt>{t('evaluations.test.title')}</dt>
              <dd>{form.name || '—'}</dd>
              <dt>{t('viescolaire.utils.class')}</dt>
              <dd>{classeName(form.id_groupe) || '—'}</dd>
              {form.is_evaluated && (
                <>
                  <dt>{t('viescolaire.utils.coefficient')}</dt>
                  <dd>{form.coefficient}</dd>
                  <dt>{t('evaluations.test.grade.on')}</dt>
                  <dd>{form.diviseur}</dd>
                </>
              )}
              <dt>{t('evaluations.test.date')}</dt>
              <dd className="mb-0">{form.date.split('-').reverse().join('/')}</dd>
            </dl>
            {form.competences.length > MAX_COMPETENCES && (
              <Alert type="danger">
                {t('you.have')}
                {form.competences.length} {t('evaluations.competences')}. {t('evaluations.max.competences')}
              </Alert>
            )}
            <ol className="list-unstyled d-flex flex-column gap-4 mb-0">
              {form.competences.map((c, index) => (
                <li key={c.id} className="d-flex align-items-start gap-4 small">
                  <span className="flex-fill">
                    {index + 1}. {competenceLabel(c)}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    color="tertiary"
                    variant="ghost"
                    aria-label={t('competences.react.form.up', { name: c.nom })}
                    disabled={index === 0}
                    onClick={() => set({ competences: moveCompetence(form.competences, index, -1) })}
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    color="tertiary"
                    variant="ghost"
                    aria-label={t('competences.react.form.down', { name: c.nom })}
                    disabled={index === form.competences.length - 1}
                    onClick={() => set({ competences: moveCompetence(form.competences, index, 1) })}
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    color="tertiary"
                    variant="ghost"
                    aria-label={t('competences.react.form.remove', { name: c.nom })}
                    onClick={() => set({ competences: toggleCompetences(form.competences, [c], false) })}
                  >
                    ✕
                  </Button>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>

      {missing && (
        <Modal id="devoir-missing" isOpen onModalClose={() => setMissing(null)} size="sm">
          <Modal.Header onModalClose={() => setMissing(null)}>{t('formulaire.incomplet')}</Modal.Header>
          <Modal.Body>
            <p>{t('required.fields.not.selected')}</p>
            <ul className="mb-0">
              {missing.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ul>
          </Modal.Body>
          <Modal.Footer>
            <Button color="primary" variant="filled" onClick={() => setMissing(null)}>
              {t('competences.react.form.understood')}
            </Button>
          </Modal.Footer>
        </Modal>
      )}

      {destructive && (
        <Modal id="devoir-destructive" isOpen onModalClose={() => setDestructive(null)} size="md">
          <Modal.Header onModalClose={() => setDestructive(null)}>{t('evaluations.test.edit')}</Modal.Header>
          <Modal.Body>
            {destructive.removedEvaluated.length > 0 && (
              <>
                <p>{t('evaluations.devoir.updateDevoir.firstConfirmSupp.part1')}</p>
                <ul>
                  {initialCompetences
                    .filter((c) => destructive.removedEvaluated.includes(c.id))
                    .map((c) => (
                      <li key={c.id}>{competenceLabel(c)}</li>
                    ))}
                </ul>
              </>
            )}
            {destructive.changesClasse && <p>{t('evaluations.devoir.updateDevoir.firstConfirmSupp.change.classe')}</p>}
            {destructive.dropsNotes && <p>{t('evaluations.devoir.updateDevoir.evaluatedSkillDisabel.part1')}</p>}
            <p className="mb-0">{t('evaluations.devoir.updateDevoir.firstConfirmSupp.part2')}</p>
          </Modal.Body>
          <Modal.Footer>
            <Button color="tertiary" variant="ghost" onClick={() => setDestructive(null)}>
              {t('competences.react.cancel')}
            </Button>
            <Button color="danger" variant="filled" isLoading={saving} onClick={save}>
              {t('evaluations.devoir.confirmation')}
            </Button>
          </Modal.Footer>
        </Modal>
      )}
    </div>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: (id: string) => JSX.Element }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="form-label">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

/**
 * Choix des compétences (`c-skills-list`) : recherche, filtre par enseignement, arbre à cases.
 * Cocher une compétence-mère retient toutes ses filles visibles (`checkConnaissances`).
 */
function CompetencePicker({
  enseignements,
  chosen,
  alreadyUsed,
  onChange,
}: {
  enseignements: Parameters<typeof filterTree>[0];
  chosen: ChosenCompetence[];
  alreadyUsed: Set<number>;
  onChange: (next: ChosenCompetence[]) => void;
}) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const [keyword, setKeyword] = useState('');
  const [filter, setFilter] = useState<Set<number>>(new Set());
  const [lastLoading, setLastLoading] = useState(false);
  const searchId = useId();
  const chosenIds = new Set(chosen.map((c) => c.id));
  const tree = filterTree(enseignements, keyword, filter, alreadyUsed);
  const withCompetences = enseignements.filter((e) => (e.competences_1 ?? []).length > 0);

  const takeLast = async () => {
    setLastLoading(true);
    try {
      const last = await api.getLastDevoirCompetences();
      const available = new Set(
        enseignements.flatMap((e) => (e.competences_1 ?? []).flatMap((c) => [c.id, ...(c.competences_2 ?? []).map((s) => s.id)])),
      );
      onChange(
        toggleCompetences(
          chosen,
          last
            .filter((c) => available.has(c.id_competence))
            .sort((a, b) => a.index - b.index)
            .map((c) => ({ id: c.id_competence, nom: c.nom, code_domaine: c.code_domaine })),
          true,
        ),
      );
    } finally {
      setLastLoading(false);
    }
  };

  const toggleNode = (node: TreeNode, select: boolean) => onChange(toggleCompetences(chosen, leavesOf(node), select));

  return (
    <div className="d-flex flex-column gap-12">
      <div className="d-flex flex-wrap gap-8 align-items-end">
        <div className="flex-fill">
          <label htmlFor={searchId} className="visually-hidden">
            {t('evaluations.competences.search')}
          </label>
          <input
            id={searchId}
            type="search"
            className="form-control"
            placeholder={t('evaluations.competences.search')}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <Button type="button" color="primary" variant="outline" isLoading={lastLoading} onClick={takeLast}>
          {t('competences.react.form.take.last')}
        </Button>
      </div>

      <div className="d-flex flex-wrap gap-4" role="group" aria-label={t('competences.react.form.enseignements')}>
        {withCompetences.map((e) => (
          <Button
            key={e.id}
            type="button"
            size="sm"
            color="tertiary"
            variant={filter.has(e.id) ? 'filled' : 'outline'}
            aria-pressed={filter.has(e.id)}
            onClick={() =>
              setFilter((f) => {
                const next = new Set(f);
                if (next.has(e.id)) next.delete(e.id);
                else next.add(e.id);
                return next;
              })
            }
          >
            {e.nom}
          </Button>
        ))}
      </div>

      {tree.length === 0 && <p className="text-muted mb-0">{t('competences.react.form.no.competence')}</p>}
      {tree.map((e) => (
        <details key={e.id} open={keyword.trim() !== '' || filter.size > 0}>
          <summary className="fw-bold">{e.nom}</summary>
          <ul className="list-unstyled ms-16 mt-8 d-flex flex-column gap-8">
            {e.competences.map((node) => {
              const leaves = leavesOf(node);
              const all = leaves.every((l) => chosenIds.has(l.id));
              const some = leaves.some((l) => chosenIds.has(l.id));
              return (
                <li key={node.id}>
                  <div className="form-check">
                    <input
                      id={`competence-${e.id}-${node.id}`}
                      type="checkbox"
                      className="form-check-input"
                      checked={all}
                      ref={(el) => {
                        if (el) el.indeterminate = some && !all;
                      }}
                      onChange={() => toggleNode(node, !all)}
                    />
                    <label htmlFor={`competence-${e.id}-${node.id}`} className="form-check-label">
                      {node.children.length > 0 ? <strong>{node.nom}</strong> : competenceLabel(node)}
                    </label>
                  </div>
                  {node.children.length > 0 && (
                    <ul className="list-unstyled ms-24 mt-4 d-flex flex-column gap-4">
                      {node.children.map((child) => (
                        <li key={child.id} className="form-check">
                          <input
                            id={`competence-${e.id}-${node.id}-${child.id}`}
                            type="checkbox"
                            className="form-check-input"
                            checked={chosenIds.has(child.id)}
                            onChange={() => toggleNode(child, !chosenIds.has(child.id))}
                          />
                          <label htmlFor={`competence-${e.id}-${node.id}-${child.id}`} className="form-check-label small">
                            {competenceLabel(child)}
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      ))}
    </div>
  );
}

export default DevoirFormScreen;
