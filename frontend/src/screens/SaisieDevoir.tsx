import { Alert, Button, LoadingScreen, Modal } from '@open-ent/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';

import * as api from '../api';
import { usePeriodeLabel } from '../features/Filters';
import { formatDate, isChefEtabOrHeadTeacher, isHeadTeacher } from '../rules';
import {
  annotationClearsCompetences,
  bulkMessageKey,
  bulkTargets,
  competenceLabel,
  evaluatesCompetences,
  isEndSaisie,
  isEvaluable,
  Level,
  levelForKey,
  levelGrid,
  levelsForCycle,
  nextLevel,
  parseSaisie,
  saisieDisplay,
  sortEleves,
  UNEVALUATED_COLOR,
} from '../saisie';
import { useStructure, useStructureData, useViewer } from '../structure';
import type { Annotation, CompetenceDevoir, CompetenceNote, Devoir, DevoirStats, EleveDevoir, NoteDevoir, PeriodeClasse } from '../types';

/** Un niveau changé au clic n'est enregistré qu'une fois l'enseignant arrêté sur la pastille. */
const LEVEL_SAVE_DELAY = 700;

/**
 * Saisie d'une évaluation (`display_notes_devoir.html`) : une ligne par élève, avec sa note ou son
 * annotation, son niveau sur chaque compétence évaluée, et une appréciation. Rien n'est validé en
 * bloc : chaque case part dès qu'on la quitte, comme dans l'AngularJS.
 *
 * Pas encore portés : l'impression (cartouches, grille de saisie, export) et l'import de notes.
 */
export function SaisieDevoir() {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const { devoirId = '' } = useParams();
  const id = Number(devoirId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { structureId, rightsLoaded } = useStructure();
  const data = useStructureData();
  const viewer = useViewer();

  const devoir = data.devoirs.find((d) => d.id === id);
  const classe = data.classes.find((c) => c.id === devoir?.id_groupe);

  const enabled = !!devoir && !!classe;
  const key = (name: string) => ['competences', structureId, 'devoir', id, name];
  const periodesQuery = useQuery({
    queryKey: ['competences', 'periodes-classe', classe?.id],
    queryFn: () => api.getPeriodesClasse(classe!.id),
    enabled,
  });
  const elevesQuery = useQuery({
    queryKey: ['competences', 'eleves-classe', classe?.id],
    queryFn: () => api.getElevesDevoir(classe!),
    enabled,
  });
  const notesQuery = useQuery({ queryKey: key('notes'), queryFn: () => api.getNotesDevoir(id), enabled });
  const competencesQuery = useQuery({ queryKey: key('competences'), queryFn: () => api.getCompetencesDevoir(id), enabled });
  const levelNotesQuery = useQuery({ queryKey: key('niveaux'), queryFn: () => api.getCompetenceNotes(id), enabled });
  const statsQuery = useQuery({ queryKey: key('stats'), queryFn: () => api.getDevoirStats(id, structureId), enabled });
  const annotationsQuery = useQuery({
    queryKey: ['competences', structureId, 'annotations'],
    queryFn: () => api.getAnnotations(structureId),
    enabled: !!structureId,
  });
  const levelsQuery = useQuery({
    queryKey: ['competences', structureId, 'maitrise'],
    queryFn: () => api.getMaitriseLevels(structureId),
    enabled: !!structureId,
  });

  const periode = periodesQuery.data?.find((p) => p.id_type === devoir?.id_periode);
  const eleves = useMemo(
    () => sortEleves((elevesQuery.data ?? []).filter((e) => isEvaluable(e, periode))),
    [elevesQuery.data, periode],
  );

  const queries = [periodesQuery, elevesQuery, notesQuery, competencesQuery, levelNotesQuery, annotationsQuery, levelsQuery];
  if (!rightsLoaded || data.isLoading || !viewer) return <LoadingScreen position={false} />;
  if (!devoir || !classe) {
    return (
      <div className="d-flex flex-column gap-16">
        <Alert type="warning">{t('competences.react.saisie.not.found')}</Alert>
        <Link to="/devoirs/list">{t('competences.react.saisie.back')}</Link>
      </div>
    );
  }
  if (queries.some((q) => q.isLoading)) return <LoadingScreen position={false} />;

  const today = viewer.today;
  const endSaisie = isEndSaisie(periode, today, isHeadTeacher(classe, viewer));
  // `has-right="isChefEtabOrHeadTeacher()"`, appelé SANS classe : seule la direction passe outre.
  const locked = endSaisie && !isChefEtabOrHeadTeacher(viewer);

  /**
   * Après toute écriture : relire ce qui a pu bouger côté serveur (une annotation efface la note
   * et les niveaux), puis faire recalculer l'avancement, que la liste des évaluations affiche.
   */
  const refresh = async () => {
    await Promise.all(
      ['notes', 'niveaux', 'stats'].map((name) => queryClient.invalidateQueries({ queryKey: key(name) })),
    );
    const percent = await api.refreshPercent(id, structureId, eleves.length);
    queryClient.setQueryData<Devoir[]>(['competences', structureId, 'devoirs'], (list) =>
      list?.map((d) => (d.id === id ? { ...d, percent } : d)),
    );
  };

  return (
    <SaisieView
      devoir={devoir}
      classeName={classe.name}
      periode={periode}
      eleves={eleves}
      notes={notesQuery.data ?? []}
      competences={(competencesQuery.data ?? []).slice().sort((a, b) => a.index - b.index)}
      levelNotes={levelNotesQuery.data ?? []}
      annotations={annotationsQuery.data ?? []}
      levels={levelsForCycle(levelsQuery.data ?? [], classe.id_cycle)}
      stats={statsQuery.data ?? {}}
      matiere={data.matieres.find((m) => m.id === devoir.id_matiere)?.name ?? ''}
      sousMatiere={data.sousMatieres.find((s) => s.id === Number(devoir.id_sousmatiere))?.libelle ?? ''}
      showTeacher={isChefEtabOrHeadTeacher(viewer)}
      locked={locked}
      onRefresh={refresh}
      onEdit={() => navigate(`/devoir/${id}/edit`)}
    />
  );
}

type SaisieViewProps = {
  devoir: Devoir;
  classeName: string;
  periode: PeriodeClasse | undefined;
  eleves: EleveDevoir[];
  notes: NoteDevoir[];
  competences: CompetenceDevoir[];
  levelNotes: CompetenceNote[];
  annotations: Annotation[];
  levels: Level[];
  stats: DevoirStats;
  matiere: string;
  sousMatiere: string;
  showTeacher: boolean;
  locked: boolean;
  onRefresh: () => Promise<void>;
  onEdit: () => void;
};

function SaisieView(props: SaisieViewProps) {
  const { devoir, eleves, notes, competences, levelNotes, annotations, levels, locked, onRefresh } = props;
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const queryClient = useQueryClient();
  const periodeLabel = usePeriodeLabel();
  const [error, setError] = useState<string | null>(null);
  const [selectedEleves, setSelectedEleves] = useState<Set<string>>(new Set());
  const [selectedCompetences, setSelectedCompetences] = useState<Set<number>>(new Set());
  const [bulkLevel, setBulkLevel] = useState<number | null>(null);
  const [apprecVisible, setApprecVisible] = useState(!!devoir.apprec_visible);
  const [info, setInfo] = useState<string | null>(null);

  const notesByEleve = useMemo(() => new Map(notes.map((n) => [n.id_eleve, n])), [notes]);
  const grid = useMemo(() => levelGrid(levelNotes), [levelNotes]);
  const codes = annotations.map((a) => a.libelle_court).join(', ');
  const maxValue = levels[0]?.value ?? -1;

  /** Élève sorti de l'évaluation par compétences par son annotation (sauf « non noté » noté). */
  const isExcluded = (eleveId: string) => {
    const note = notesByEleve.get(eleveId);
    const annotation = annotations.find((a) => a.id === note?.id_annotation);
    return !!annotation && annotationClearsCompetences(annotation, devoir.is_evaluated);
  };

  const run = async (write: () => Promise<unknown>) => {
    try {
      setError(null);
      await write();
    } catch {
      setError(t('competences.react.saisie.save.error'));
    } finally {
      await onRefresh();
    }
  };

  /** `saveNoteDevoirEleve`, réduit à ses issues réelles. Renvoie un message si la saisie est refusée. */
  const commitNote = async (eleveId: string, raw: string): Promise<string | null> => {
    const note = notesByEleve.get(eleveId);
    if (raw.trim().toUpperCase() === saisieDisplay(note, annotations).toUpperCase()) return null;
    const saisie = parseSaisie(raw, annotations, devoir.diviseur, devoir.is_evaluated);
    switch (saisie.kind) {
      case 'outOfRange':
        return `${t('error.note.outbound')}${devoir.diviseur}`;
      case 'invalid':
        return devoir.is_evaluated
          ? t('competences.react.saisie.invalid', { codes })
          : t('competences.react.saisie.annotation.only', { codes });
      case 'empty':
        await run(async () => {
          if (note?.id_annotation != null) await api.deleteAnnotation(devoir.id, eleveId);
          else if (note?.id != null) await api.deleteNote(note.id);
        });
        return null;
      case 'annotation':
        await run(() => api.saveAnnotation(devoir.id, eleveId, saisie.annotation.id));
        return null;
      case 'note':
        await run(async () => {
          // Une note remplace l'annotation : l'AngularJS supprimait celle-ci AVANT d'écrire.
          if (note?.id_annotation != null) await api.deleteAnnotation(devoir.id, eleveId);
          await api.saveNote(devoir.id, eleveId, saisie.valeur);
        });
        if (devoir.coefficient === null) setInfo(t('evaluation.devoir.coef.is.null'));
        return null;
    }
  };

  const commitAppreciation = async (eleveId: string, value: string) => {
    const note = notesByEleve.get(eleveId);
    const before = note?.appreciation ?? '';
    if (value === before) return;
    await run(async () => {
      if (value.trim() === '') {
        if (note?.id_appreciation != null) await api.deleteAppreciation(note.id_appreciation);
      } else if (note?.id_appreciation != null) {
        await api.updateAppreciation(note.id_appreciation, devoir.id, eleveId, value);
      } else {
        await api.createAppreciation(devoir.id, eleveId, value);
      }
    });
  };

  const commitLevel = async (eleveId: string, competenceId: number, value: number) => {
    const existing = grid.get(`${eleveId}|${competenceId}`);
    if (value === (existing?.evaluation ?? -1)) return;
    await run(async () => {
      if (value === -1) {
        // L'AngularJS envoyait une création à −1 quand rien n'existait encore : on s'en abstient.
        if (existing) await api.deleteCompetenceNote(existing.id);
      } else {
        await api.saveCompetenceNote(devoir.id, eleveId, competenceId, value);
      }
    });
  };

  const applyBulk = async (value: number) => {
    const targets = bulkTargets(
      eleves.map((e) => e.id),
      [...selectedEleves],
      competences.map((c) => c.id_competence),
      [...selectedCompetences],
      isExcluded,
    );
    await run(async () => {
      if (value === -1) {
        const ids = targets
          .map((cell) => grid.get(`${cell.id_eleve}|${cell.id_competence}`)?.id)
          .filter((x): x is number => x != null);
        if (ids.length > 0) await api.deleteCompetenceNotes(ids);
      } else if (targets.length > 0) {
        await api.saveCompetenceNotes(targets.map((cell) => ({ ...cell, id_devoir: devoir.id, evaluation: value })));
      }
    });
    setSelectedEleves(new Set());
    setSelectedCompetences(new Set());
    setBulkLevel(null);
  };

  const toggleVisibility = async () => {
    await run(() => api.switchApprecVisibility(devoir.id));
    setApprecVisible((v) => !v);
    queryClient.setQueryData<Devoir[]>(['competences', devoir.id_etablissement, 'devoirs'], (list) =>
      list?.map((d) => (d.id === devoir.id ? { ...d, apprec_visible: !apprecVisible } : d)),
    );
  };

  const finish = async () => {
    await run(() => api.finishDevoir(devoir.id));
    setInfo(t('competences.react.saisie.finished'));
  };

  const selectable = eleves.filter((e) => !isExcluded(e.id));
  const allSelected = selectable.length > 0 && selectable.every((e) => selectedEleves.has(e.id));
  const hasCompetences = competences.length > 0;

  return (
    <div className="d-flex flex-column gap-16">
      <Link to="/devoirs/list">← {t('competences.react.saisie.back')}</Link>

      <div className="d-flex flex-wrap align-items-center justify-content-between gap-12">
        <h1 className="h3 mb-0">
          {t('title')} : {devoir.name}
        </h1>
        <div className="d-flex flex-wrap gap-8">
          <Button color="primary" variant="outline" onClick={finish} disabled={locked}>
            {t('evaluations.test.finish')}
          </Button>
          <Button color="primary" variant="filled" onClick={props.onEdit} disabled={locked}>
            {t('evaluations.test.edit')}
          </Button>
        </div>
      </div>

      {locked && <Alert type="warning">{t('evaluations.devoir.uncancelable')}</Alert>}
      {error && (
        <Alert type="danger" isDismissible onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {info && (
        <Alert type="info" isDismissible onClose={() => setInfo(null)}>
          {info}
        </Alert>
      )}

      <div className="row g-16">
        <aside className="col-12 col-lg-3 d-flex flex-column gap-16">
          <section className="card p-16">
            <h2 className="h6">{t('evaluations.homework.details')}</h2>
            <dl className="mb-0 small">
              {devoir.libelle && (
                <>
                  <dt>{t('viescolaire.utils.description')}</dt>
                  <dd>{devoir.libelle}</dd>
                </>
              )}
              {props.showTeacher && (
                <>
                  <dt>{t('evaluations.test.teacher')}</dt>
                  <dd>{devoir.teacher}</dd>
                </>
              )}
              <dt>{t('viescolaire.utils.class')}</dt>
              <dd>{props.classeName}</dd>
              <dt>{t('viescolaire.utils.subject')}</dt>
              <dd>
                {props.matiere}
                {props.sousMatiere && ` (${props.sousMatiere})`}
              </dd>
              <dt>{t('viescolaire.utils.periode')}</dt>
              <dd>
                {props.periode
                  ? periodeLabel({ id: props.periode.id_type, type: props.periode.type, ordre: props.periode.ordre })
                  : '—'}
              </dd>
              <dt>{t('date')}</dt>
              <dd>{formatDate(devoir.date)}</dd>
              {devoir.is_evaluated && (
                <>
                  <dt>{t('viescolaire.utils.coefficient')}</dt>
                  <dd>{devoir.coefficient}</dd>
                  <dt>{t('evaluations.test.grade.on')}</dt>
                  <dd className="mb-0">{devoir.diviseur}</dd>
                </>
              )}
            </dl>
          </section>

          <section className="card p-16">
            <h2 className="h6">{t('viescolaire.utils.stats')}</h2>
            {devoir.is_evaluated && (
              <dl className="mb-12 small">
                <dt>{t('evaluation.classe.average')}</dt>
                <dd>{formatStat(props.stats.moyenne)}</dd>
                <dt>{t('evaluations.grade.min')}</dt>
                <dd>{formatStat(props.stats.noteMin)}</dd>
                <dt>{t('evaluations.grade.max')}</dt>
                <dd className="mb-0">{formatStat(props.stats.noteMax)}</dd>
              </dl>
            )}
            <label className="small d-block" htmlFor={`progress-${devoir.id}`}>
              {t('evaluations.test.percent')} : {devoir.percent ?? 0}%
            </label>
            <progress id={`progress-${devoir.id}`} className="w-100" max={100} value={devoir.percent ?? 0} />
          </section>
        </aside>

        <section className="col-12 col-lg-9 d-flex flex-column gap-12">
          {hasCompetences && levels.length === 0 && <Alert type="warning">{t('competences.react.saisie.no.levels')}</Alert>}

          {hasCompetences && levels.length > 0 && !locked && (
            <BulkBar
              levels={levels}
              nbEleves={selectedEleves.size}
              nbCompetences={selectedCompetences.size}
              onChoose={setBulkLevel}
            />
          )}

          <p className="small text-muted mb-0">
            {t('competences.react.saisie.annotations', {
              list: annotations.map((a) => `${a.libelle_court} = ${a.libelle}`).join(' · '),
            })}
            {hasCompetences && (
              <>
                {' '}
                {t('tuto.raccourci')} 0 = {t('competences.react.saisie.level.none')}
                {levels
                  .slice()
                  .reverse()
                  .map((l) => ` · ${l.ordre} = ${l.libelle}`)}
              </>
            )}
          </p>

          {eleves.length === 0 ? (
            <Alert type="info">{t('competences.react.saisie.no.student')}</Alert>
          ) : (
            <div className="table-responsive card">
              <table className="table align-middle mb-0">
                <thead>
                  <tr>
                    {hasCompetences && (
                      <th scope="col">
                        <input
                          type="checkbox"
                          className="form-check-input"
                          aria-label={t('competences.react.saisie.select.all')}
                          checked={allSelected}
                          disabled={locked}
                          onChange={() => setSelectedEleves(allSelected ? new Set() : new Set(selectable.map((e) => e.id)))}
                        />
                      </th>
                    )}
                    <th scope="col">{t('viescolaire.utils.student')}</th>
                    <th scope="col" style={{ minWidth: 96 }}>
                      {t('evaluations.grade')}
                    </th>
                    {competences.map((c) => (
                      <th key={c.id_competence} scope="col" className="text-center" title={competenceLabel(c)}>
                        <label className="d-flex flex-column align-items-center gap-4 small fw-normal">
                          <span>{c.code_domaine ?? `C${c.index + 1}`}</span>
                          <input
                            type="checkbox"
                            className="form-check-input"
                            aria-label={t('competences.react.saisie.select.competence', { name: competenceLabel(c) })}
                            checked={selectedCompetences.has(c.id_competence)}
                            disabled={locked}
                            onChange={() => setSelectedCompetences((s) => toggle(s, c.id_competence))}
                          />
                        </label>
                      </th>
                    ))}
                    <th scope="col" style={{ minWidth: 220 }}>
                      <div className="d-flex align-items-center gap-8">
                        {t('viescolaire.utils.appreciation')}
                        <Button
                          type="button"
                          size="sm"
                          color="tertiary"
                          variant="ghost"
                          aria-pressed={apprecVisible}
                          disabled={locked}
                          onClick={toggleVisibility}
                        >
                          {t(apprecVisible ? 'evaluations.devoir.appreciation.tooltip.show' : 'evaluations.devoir.appreciation.tooltip.hide')}
                        </Button>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {eleves.map((eleve) => {
                    const note = notesByEleve.get(eleve.id);
                    const name = eleve.displayName ?? `${eleve.lastName ?? ''} ${eleve.firstName ?? ''}`.trim();
                    const excluded = isExcluded(eleve.id);
                    const showLevels = evaluatesCompetences(note, annotations);
                    return (
                      <tr key={eleve.id}>
                        {hasCompetences && (
                          <td>
                            <input
                              type="checkbox"
                              className="form-check-input"
                              aria-label={t('competences.react.saisie.select.student', { name })}
                              checked={selectedEleves.has(eleve.id)}
                              disabled={locked || excluded}
                              onChange={() => setSelectedEleves((s) => toggle(s, eleve.id))}
                            />
                          </td>
                        )}
                        <th scope="row" className={`fw-normal ${eleve.deleteDate ? 'text-decoration-line-through text-muted' : ''}`}>
                          {name}
                        </th>
                        <td>
                          <NoteInput
                            label={`${t('evaluations.grade')} ${name}`}
                            value={saisieDisplay(note, annotations)}
                            annotations={annotations}
                            disabled={locked}
                            onCommit={(raw) => commitNote(eleve.id, raw)}
                          />
                        </td>
                        {competences.map((c) =>
                          showLevels ? (
                            <td key={c.id_competence} className="text-center">
                              <LevelButton
                                competence={c}
                                eleveName={name}
                                value={grid.get(`${eleve.id}|${c.id_competence}`)?.evaluation ?? -1}
                                levels={levels}
                                maxValue={maxValue}
                                disabled={locked || levels.length === 0}
                                highlighted={selectedEleves.has(eleve.id) || selectedCompetences.has(c.id_competence)}
                                onCommit={(value) => commitLevel(eleve.id, c.id_competence, value)}
                              />
                            </td>
                          ) : (
                            <td key={c.id_competence} />
                          ),
                        )}
                        <td>
                          <AppreciationInput
                            label={`${t('viescolaire.utils.appreciation')} ${name}`}
                            value={note?.appreciation ?? ''}
                            disabled={locked}
                            onCommit={(value) => commitAppreciation(eleve.id, value)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {hasCompetences && (
            <ol className="small text-muted mb-0">
              {competences.map((c) => (
                <li key={c.id_competence}>{competenceLabel(c)}</li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {bulkLevel !== null && (
        <BulkConfirm
          level={levels.find((l) => l.value === bulkLevel)}
          messageKey={bulkMessageKey(selectedEleves.size, selectedCompetences.size)}
          onConfirm={() => applyBulk(bulkLevel)}
          onClose={() => setBulkLevel(null)}
        />
      )}
    </div>
  );
}

const toggle = <T,>(set: Set<T>, value: T) => {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
};

const formatStat = (value: number | undefined) =>
  value === undefined || value === null ? '—' : value.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

/**
 * Case « Note » : une note, ou le libellé court d'une annotation (ABS, DISP, NN, NR), proposés par
 * une liste d'aide. Enregistrée en quittant la case ou sur Entrée ; refusée, elle revient à la
 * valeur précédente et dit pourquoi.
 */
function NoteInput({
  label,
  value,
  annotations,
  disabled,
  onCommit,
}: {
  label: string;
  value: string;
  annotations: Annotation[];
  disabled: boolean;
  onCommit: (raw: string) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState(value);
  const [problem, setProblem] = useState<string | null>(null);
  const listId = useId();
  const problemId = useId();
  useEffect(() => setDraft(value), [value]);

  const commit = async () => {
    const message = await onCommit(draft);
    setProblem(message);
    if (message) setDraft(value);
  };

  return (
    <div>
      <input
        type="text"
        inputMode="decimal"
        className={`form-control form-control-sm ${problem ? 'is-invalid' : ''}`}
        style={{ width: 84 }}
        aria-label={label}
        aria-invalid={!!problem}
        aria-describedby={problem ? problemId : undefined}
        list={listId}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      <datalist id={listId}>
        {annotations.map((a) => (
          <option key={a.id} value={a.libelle_court}>
            {a.libelle}
          </option>
        ))}
      </datalist>
      {problem && (
        <div id={problemId} className="invalid-feedback d-block" style={{ maxWidth: 220 }}>
          {problem}
        </div>
      )}
    </div>
  );
}

function AppreciationInput({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onCommit: (value: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      type="text"
      className="form-control form-control-sm"
      aria-label={label}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

/**
 * Pastille de niveau (`cSkillNoteDevoir`). Clic : niveau suivant ; touches 0 à 4 : niveau direct.
 * L'enregistrement attend que l'enseignant cesse de cliquer — l'AngularJS attendait qu'il quitte
 * la pastille — pour ne pas écrire chaque étape d'un tour de cycle.
 */
function LevelButton({
  competence,
  eleveName,
  value,
  levels,
  maxValue,
  disabled,
  highlighted,
  onCommit,
}: {
  competence: CompetenceDevoir;
  eleveName: string;
  value: number;
  levels: Level[];
  maxValue: number;
  disabled: boolean;
  highlighted: boolean;
  onCommit: (value: number) => Promise<void>;
}) {
  const { t } = useTranslation(['competences', 'common']);
  const [pending, setPending] = useState<number | null>(null);
  const timer = useRef<number>();
  const shown = pending ?? value;
  const level = levels.find((l) => l.value === shown);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  // Valeur relue du serveur : l'attente est soldée.
  useEffect(() => setPending(null), [value]);

  const schedule = (next: number) => {
    setPending(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void onCommit(next);
    }, LEVEL_SAVE_DELAY);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const next = levelForKey(event.key);
    if (next === null) return;
    event.preventDefault();
    schedule(next);
  };

  const label = level?.libelle ?? t('competences.react.saisie.level.none');
  return (
    <button
      type="button"
      className={`btn p-0 rounded-circle border ${highlighted ? 'border-3 border-primary' : ''}`}
      style={{ width: 28, height: 28, background: level?.couleur ?? UNEVALUATED_COLOR, opacity: level ? 1 : 0.35 }}
      title={`${competenceLabel(competence)} — ${label}`}
      aria-label={t('competences.react.saisie.level.of', { competence: `${eleveName}, ${competenceLabel(competence)}`, level: label })}
      disabled={disabled}
      onClick={() => schedule(nextLevel(shown, maxValue))}
      onKeyDown={onKeyDown}
    >
      {level?.lettre && <span className="small fw-bold text-white">{level.lettre}</span>}
    </button>
  );
}

/** Barre de coloriage en masse (`cSkillsColorPage`) : un bouton par niveau, plus « effacer ». */
function BulkBar({
  levels,
  nbEleves,
  nbCompetences,
  onChoose,
}: {
  levels: Level[];
  nbEleves: number;
  nbCompetences: number;
  onChoose: (value: number) => void;
}) {
  const { t } = useTranslation(['competences', 'common']);
  return (
    <section className="card p-12">
      <h2 className="h6 mb-4">{t('competences.react.saisie.bulk.title')}</h2>
      <p className="small text-muted mb-8">
        {nbEleves + nbCompetences > 0
          ? t('competences.react.saisie.bulk.selection', { eleves: nbEleves, competences: nbCompetences })
          : t('competences.react.saisie.bulk.hint')}
      </p>
      <div className="d-flex flex-wrap gap-8">
        {levels
          .slice()
          .reverse()
          .map((l) => (
            <Button key={l.value} type="button" size="sm" color="tertiary" variant="outline" onClick={() => onChoose(l.value)}>
              <span
                aria-hidden="true"
                className="d-inline-block rounded-circle me-4"
                style={{ width: 12, height: 12, background: l.couleur }}
              />
              {l.libelle}
            </Button>
          ))}
        <Button type="button" size="sm" color="tertiary" variant="ghost" onClick={() => onChoose(-1)}>
          {t('competences.react.saisie.level.none')}
        </Button>
      </div>
    </section>
  );
}

function BulkConfirm({
  level,
  messageKey,
  onConfirm,
  onClose,
}: {
  level: Level | undefined;
  messageKey: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation(['competences', 'common']);
  const [busy, setBusy] = useState(false);
  return (
    <Modal id={useId()} isOpen onModalClose={onClose} size="sm">
      <Modal.Header onModalClose={onClose}>{t('competences.react.saisie.bulk.title')}</Modal.Header>
      <Modal.Body>
        <p>{t(messageKey)}</p>
        <p className="fw-bold">{level?.libelle ?? t('competences.react.saisie.level.none')}</p>
        <p className="mb-0">{t('evaluation.continue')}</p>
      </Modal.Body>
      <Modal.Footer>
        <Button color="tertiary" variant="ghost" onClick={onClose}>
          {t('competences.react.cancel')}
        </Button>
        <Button
          color="primary"
          variant="filled"
          isLoading={busy}
          onClick={async () => {
            setBusy(true);
            await onConfirm();
            setBusy(false);
          }}
        >
          {t('competences.react.saisie.bulk.confirm')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default SaisieDevoir;
