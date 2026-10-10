import { Alert, Button, LoadingScreen, Modal } from '@open-ent/react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import * as api from '../api';
import { bulletinPeriodes } from '../bulletins';
import { StructureSelect, usePeriodeLabel } from '../features/Filters';
import {
  allErrorsIgnored,
  archiveYears,
  canExportLsu,
  errorClasse,
  hasBlockingErrors,
  ignoreKey,
  LSU_TYPE,
  lsuBody,
  LsuErrors,
  LsuType,
  NO_STUDENT_ERROR,
  parseStsIndividus,
  UnheededStudent,
  unheededPeriode,
} from '../lsu';
import { isChefEtabOrHeadTeacher, sortClasses } from '../rules';
import { useStructure, useStructureData, useViewer } from '../structure';

type Message = { type: 'success' | 'danger' | 'warning' | 'info'; text: string } | null;

function download(blob: Blob, filename: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }, 100);
}

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
};

/**
 * Exports (`exports.html`) : l'export LSU — bilan de fin de cycle ou bilan périodique — avec son
 * fichier STS, puis, pour la direction, les archives des bulletins et des bilans de fin de cycle.
 */
export function Exports() {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const { structures, rights, rightsLoaded, isLoading: structuresLoading } = useStructure();
  const data = useStructureData();
  const viewer = useViewer();

  if (structuresLoading || !rightsLoaded) return <LoadingScreen position={false} />;
  if (structures.length === 0) return <Alert type="info">{t('competences.react.no.structure')}</Alert>;
  if (data.isLoading || !viewer) return <LoadingScreen position={false} />;

  return (
    <div className="d-flex flex-column gap-16">
      <h1 className="h3 mb-0">{t('evaluations.exports')}</h1>
      <StructureSelect className="col-12 col-md-4" />
      {rights.exportLSU && <LsuExport />}
      {isChefEtabOrHeadTeacher(viewer) && <ArchivesExport />}
    </div>
  );
}

// ── Export LSU ────────────────────────────────────────────────────────────────

function LsuExport() {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const queryClient = useQueryClient();
  const { structureId } = useStructure();
  const data = useStructureData();
  const periodeLabel = usePeriodeLabel();
  const stsId = useId();
  const [type, setType] = useState<LsuType>(LSU_TYPE.BILAN_PERIODIQUE);
  const [stsChoice, setStsChoice] = useState<number | null>(null);
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set());
  const [responsables, setResponsables] = useState<Set<string>>(new Set());
  const [periodeTypes, setPeriodeTypes] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [unheeded, setUnheeded] = useState<UnheededStudent[] | null>(null);
  const [errors, setErrors] = useState<LsuErrors | null>(null);
  const [ignored, setIgnored] = useState<Set<string>>(new Set());

  const classes = useMemo(() => sortClasses(data.classes.filter((c) => c.type_groupe === 0)), [data.classes]);
  const chosen = classes.filter((c) => selectedClasses.has(c.id));
  const stsQuery = useQuery({ queryKey: ['competences', structureId, 'sts-files'], queryFn: () => api.getStsFiles(structureId) });
  const responsablesQuery = useQuery({
    queryKey: ['competences', structureId, 'responsables-direction'],
    queryFn: () => api.getResponsablesDirection(structureId),
  });
  const periodesQueries = useQueries({
    queries: chosen.map((c) => ({ queryKey: ['competences', 'periodes-classe', c.id], queryFn: () => api.getPeriodesClasse(c.id) })),
  });
  const periodes = useMemo(
    () => bulletinPeriodes(new Map(chosen.map((c, i) => [c.id, periodesQueries[i]?.data ?? []]))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chosen.map((c) => c.id).join(','), periodesQueries.map((q) => q.dataUpdatedAt).join(',')],
  );
  const loadingPeriodes = periodesQueries.some((q) => q.isLoading);

  // Le fichier STS le plus récent est proposé d'office, comme dans l'AngularJS.
  useEffect(() => {
    if (stsChoice === null && stsQuery.data?.[0]) setStsChoice(stsQuery.data[0].id);
  }, [stsQuery.data, stsChoice]);
  const sts = stsQuery.data?.find((f) => f.id === stsChoice);
  const exportedPeriodes = periodes.filter((p) => periodeTypes.has(p.id_type)).map((p) => p.id_type);
  const ready = canExportLsu({
    type,
    classes: chosen.length,
    responsables: responsables.size,
    periodes: exportedPeriodes.length,
    hasSts: !!sts,
  });
  // Périodes sur lesquelles un élève peut être écarté : le cycle (null) en fin de cycle.
  const ignorablePeriodes: Array<number | null> = type === LSU_TYPE.BFC ? [null] : exportedPeriodes;

  const toggle = <T,>(set: React.Dispatch<React.SetStateAction<Set<T>>>, value: T) =>
    set((s) => {
      const next = new Set(s);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setMessage(null);
    const individus = parseStsIndividus(new DOMParser().parseFromString(await file.text(), 'application/xml'));
    if (!individus) {
      setMessage({ type: 'danger', text: t('competences.react.lsu.sts.invalid') });
      return;
    }
    try {
      const saved = await api.saveStsFile(structureId, file.name, individus);
      await queryClient.invalidateQueries({ queryKey: ['competences', structureId, 'sts-files'] });
      if (saved?.id) setStsChoice(saved.id);
      setMessage({ type: 'success', text: t('evaluation.lsu.confirm.save.sts.file') });
    } catch {
      setMessage({ type: 'danger', text: t('evaluation.lsu.error.sts.file.create') });
    }
  };

  const runExport = async () => {
    if (!sts) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.exportLsu(
        lsuBody({
          type,
          structureId,
          classeIds: chosen.map((c) => c.id),
          responsableIds: [...responsables],
          periodeTypes: exportedPeriodes,
          sts: JSON.parse(sts.content) as unknown[],
        }),
      );
      if ('errors' in result) {
        if (hasBlockingErrors(result.errors)) {
          setIgnored(new Set());
          setErrors(result.errors);
        } else if (result.errors.message?.includes(NO_STUDENT_ERROR)) {
          setMessage({ type: 'info', text: t('evaluation.lsu.error.getEleves.no.student') });
        } else setMessage({ type: 'danger', text: t('evaluation.lsu.export.error') });
        return;
      }
      download(result.blob, result.filename);
    } catch {
      setMessage({ type: 'danger', text: t('evaluation.lsu.export.error') });
    } finally {
      setBusy(false);
    }
  };

  /** D'abord les élèves déjà écartés, à confirmer ; puis l'export (`exportLSU(true)`). */
  const start = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const students = await api.getUnheededStudents(
        structureId,
        chosen.map((c) => c.id),
        type === LSU_TYPE.BFC ? null : exportedPeriodes,
      );
      if (students.length > 0) {
        setIgnored(new Set(students.flatMap((s) => s.ignoredInfos.map((i) => ignoreKey(s.idEleve, s.idClasse, unheededPeriode(i.id_periode))))));
        setUnheeded(students);
        setBusy(false);
        return;
      }
    } catch {
      setBusy(false);
      setMessage({ type: 'danger', text: t('evaluation.lsu.export.error') });
      return;
    }
    await runExport();
  };

  /** Écarte ou réintègre un élève pour une période (`null` = le cycle), côté serveur aussi. */
  const setIgnore = async (idEleve: string, idClasse: string, periodes: Array<number | null>, ignore: boolean) => {
    const keys = periodes.map((p) => ignoreKey(idEleve, idClasse, p));
    setIgnored((s) => {
      const next = new Set(s);
      keys.forEach((k) => (ignore ? next.add(k) : next.delete(k)));
      return next;
    });
    try {
      await Promise.all(periodes.map((p) => api.setUnheededStudent(ignore, idEleve, idClasse, p)));
    } catch {
      setMessage({ type: 'danger', text: t('evaluation.lsu.export.error') });
    }
  };

  const ignoreToggle = (label: string, on: boolean, onChange: (v: boolean) => void, key: string) => (
    <div key={key} className="form-check">
      <input id={`lsu-ignore-${key}`} type="checkbox" className="form-check-input" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={`lsu-ignore-${key}`} className="form-check-label small">
        {label}
      </label>
    </div>
  );

  return (
    <section className="card p-16 d-flex flex-column gap-12" aria-labelledby="lsu-title">
      <h2 id="lsu-title" className="h5 mb-0">
        {t('evaluations.export.lsu')}
      </h2>
      {message && (
        <Alert type={message.type} isDismissible onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      <fieldset>
        <legend className="h6">{t('evaluations.choice.export')}</legend>
        {[
          [LSU_TYPE.BFC, 'evaluations.bilan.fin.cycle.title'],
          [LSU_TYPE.BILAN_PERIODIQUE, 'evaluations.bilan.periodique'],
        ].map(([value, label]) => (
          <div key={value} className="form-check">
            <input
              id={`lsu-type-${value}`}
              type="radio"
              name="lsu-type"
              className="form-check-input"
              checked={type === value}
              onChange={() => setType(value as LsuType)}
            />
            <label htmlFor={`lsu-type-${value}`} className="form-check-label">
              {t(label)}
            </label>
          </div>
        ))}
      </fieldset>

      <fieldset className="d-flex flex-column gap-8">
        <legend className="h6">{t('evaluations.data.to.export')}</legend>
        <div className="row g-8 align-items-end">
          <div className="col-12 col-md-6">
            <label htmlFor={stsId} className="form-label">
              {t('competences.react.lsu.sts')}
            </label>
            <select
              id={stsId}
              className="form-select"
              value={stsChoice ?? ''}
              disabled={!stsQuery.data?.length}
              onChange={(e) => setStsChoice(e.target.value === '' ? null : Number(e.target.value))}
            >
              {!stsQuery.data?.length && <option value="">{t('competences.react.lsu.sts.none')}</option>}
              {(stsQuery.data ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name_file} — {formatDate(f.creation_date)}
                </option>
              ))}
            </select>
          </div>
          <div className="col-12 col-md-6">
            <label htmlFor="lsu-sts-upload" className="form-label">
              {t('competences.react.lsu.sts.upload')}
            </label>
            <input
              id="lsu-sts-upload"
              type="file"
              accept=".xml,application/xml,text/xml"
              className="form-control"
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
        </div>
        {stsQuery.isError && <Alert type="warning">{t('evaluation.lsu.error.sts.files.get')}</Alert>}

        <div>
          <div className="form-label">{t('viescolaire.utils.class')}</div>
          <div className="d-flex flex-wrap gap-8" role="group" aria-label={t('viescolaire.utils.class')}>
            {classes.map((c) => (
              <Button
                key={c.id}
                type="button"
                size="sm"
                color="primary"
                variant={selectedClasses.has(c.id) ? 'filled' : 'outline'}
                aria-pressed={selectedClasses.has(c.id)}
                onClick={() => toggle(setSelectedClasses, c.id)}
              >
                {c.name}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <div className="form-label">{t('competences.react.lsu.responsables')}</div>
          <div className="d-flex flex-wrap gap-12">
            {(responsablesQuery.data ?? []).map((r) => (
              <div key={r.id} className="form-check">
                <input
                  id={`lsu-resp-${r.id}`}
                  type="checkbox"
                  className="form-check-input"
                  checked={responsables.has(r.id)}
                  onChange={() => toggle(setResponsables, r.id)}
                />
                <label htmlFor={`lsu-resp-${r.id}`} className="form-check-label">
                  {r.displayName}
                </label>
              </div>
            ))}
            {responsablesQuery.isSuccess && responsablesQuery.data.length === 0 && (
              <span className="text-muted">{t('competences.react.lsu.responsables.none')}</span>
            )}
          </div>
        </div>

        {type === LSU_TYPE.BILAN_PERIODIQUE && (
          <div>
            <div className="form-label">{t('viescolaire.utils.periode')}</div>
            {loadingPeriodes ? (
              <LoadingScreen position={false} />
            ) : chosen.length > 0 && periodes.length === 0 ? (
              <Alert type="info">{t('evaluations.classes.are.not.initialized')}</Alert>
            ) : (
              <div className="d-flex flex-wrap gap-12">
                {periodes.map((p) => (
                  <div key={p.id_type} className="form-check">
                    <input
                      id={`lsu-periode-${p.id_type}`}
                      type="checkbox"
                      className="form-check-input"
                      checked={periodeTypes.has(p.id_type)}
                      onChange={() => toggle(setPeriodeTypes, p.id_type)}
                    />
                    <label htmlFor={`lsu-periode-${p.id_type}`} className="form-check-label">
                      {periodeLabel({ id: p.id_type, type: p.type, ordre: p.ordre })}
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </fieldset>

      <div className="d-flex justify-content-end">
        <Button color="primary" variant="filled" isLoading={busy} disabled={!ready} onClick={start}>
          {t('evaluation.lsu.export.button')}
        </Button>
      </div>

      {unheeded && (
        <Modal id="lsu-unheeded" isOpen size="lg" onModalClose={() => setUnheeded(null)}>
          <Modal.Header onModalClose={() => setUnheeded(null)}>{t('evaluation.lsu.unheeded.students')}</Modal.Header>
          <Modal.Body>
            <table className="table align-middle mb-0">
              <thead>
                <tr>
                  <th scope="col">{t('viescolaire.utils.name')}</th>
                  <th scope="col">{t('evaluation.lsu.lightBox.errors.firstName')}</th>
                  <th scope="col">{t('viescolaire.utils.class')}</th>
                  <th scope="col">{t('competences.react.lsu.ignored')}</th>
                </tr>
              </thead>
              <tbody>
                {[...unheeded]
                  .sort((a, b) => a.classeName.localeCompare(b.classeName) || a.lastName.localeCompare(b.lastName))
                  .map((s) => {
                    const ps = s.ignoredInfos.map((i) => unheededPeriode(i.id_periode));
                    return (
                      <tr key={`${s.idEleve}|${s.idClasse}`}>
                        <td>{s.lastName}</td>
                        <td>{s.firstName}</td>
                        <td>{s.classeName}</td>
                        <td>
                          {ps.map((p) =>
                            ignoreToggle(
                              p === null ? t('viescolaire.utils.cycle') : periodeLabelOf(periodes, p, periodeLabel),
                              ignored.has(ignoreKey(s.idEleve, s.idClasse, p)),
                              (v) => setIgnore(s.idEleve, s.idClasse, [p], v),
                              ignoreKey(s.idEleve, s.idClasse, p),
                            ),
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </Modal.Body>
          <Modal.Footer>
            <Button color="tertiary" variant="ghost" onClick={() => setUnheeded(null)}>
              {t('competences.cancel')}
            </Button>
            <Button
              color="primary"
              variant="filled"
              onClick={() => {
                setUnheeded(null);
                void runExport();
              }}
            >
              {t('continue')}
            </Button>
          </Modal.Footer>
        </Modal>
      )}

      {errors && (
        <Modal id="lsu-errors" isOpen size="lg" onModalClose={() => setErrors(null)}>
          <Modal.Header onModalClose={() => setErrors(null)}>{t('evaluation.lsu.export.error')}</Modal.Header>
          <Modal.Body>
            <div className="d-flex flex-column gap-12">
              {errors.emptyDiscipline && <Alert type="danger">{t('evaluation.lsu.error.no.discipline')}</Alert>}
              {errors.codes.length > 0 && (
                <div>
                  <h3 className="h6">{t('evaluations.lsu.errors.errorCode.bilan.periodique.title')}</h3>
                  <table className="table table-sm mb-0">
                    <thead>
                      <tr>
                        <th scope="col">{t('competences.code')}</th>
                        <th scope="col">{t('evaluations.libelle')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {errors.codes.map((c) => (
                        <tr key={c.code}>
                          <td>{c.code}</td>
                          <td>{c.libelle}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {errors.epiTeachers.length > 0 && (
                <div>
                  <h3 className="h6">{t('evaluations.lsu.errors.errorEPITeachers.title')}</h3>
                  <table className="table table-sm mb-0">
                    <thead>
                      <tr>
                        <th scope="col">{t('evaluations.enseignements.pratiques.interdisciplinaires')}</th>
                        <th scope="col">{t('evaluations.intervenants')}</th>
                        <th scope="col">{t('evaluations.classe.groupe')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...errors.epiTeachers]
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((epi) => (
                          <tr key={epi.name}>
                            <td>{epi.name}</td>
                            <td>
                              {(epi.intervenantsMatieres ?? [])
                                .map((im) => `${im.intervenant?.displayName ?? ''} (${im.matiere?.name ?? ''})`)
                                .join(' - ')}
                            </td>
                            <td>{(epi.groupes ?? []).map((g) => g.name).join(', ')}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
              {errors.eleves.length > 0 && (
                <div>
                  <h3 className="h6">{t('evaluations.lsu.errors.eleves.bilan.periodique.title')}</h3>
                  <p className="small text-muted">{t('competences.react.lsu.errors.hint')}</p>
                  <div className="d-flex justify-content-end mb-8">
                    <Button
                      size="sm"
                      color="secondary"
                      variant="outline"
                      onClick={() =>
                        void Promise.all(errors.eleves.map((e) => setIgnore(e.idEleve, errorClasse(e), ignorablePeriodes, true)))
                      }
                    >
                      {t('competences.react.lsu.ignore.all')}
                    </Button>
                  </div>
                  <table className="table table-sm align-middle mb-0">
                    <thead>
                      <tr>
                        <th scope="col">{t('viescolaire.utils.name')}</th>
                        <th scope="col">{t('evaluation.lsu.lightBox.errors.firstName')}</th>
                        <th scope="col">{t('viescolaire.utils.class')}</th>
                        <th scope="col">{t('evaluation.lsu.lightBox.errors.messages')}</th>
                        <th scope="col">{t('competences.react.lsu.ignored')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {errors.eleves.map((e) => (
                        <tr key={e.idEleve}>
                          <td>{e.lastName}</td>
                          <td>{e.firstName}</td>
                          <td>{e.nameClass}</td>
                          <td className="small">
                            {(e.errorsMessages ?? []).map((m, i) => (
                              <div key={i}>{m}</div>
                            ))}
                          </td>
                          <td>
                            {ignorablePeriodes.map((p) =>
                              ignoreToggle(
                                p === null ? t('viescolaire.utils.cycle') : periodeLabelOf(periodes, p, periodeLabel),
                                ignored.has(ignoreKey(e.idEleve, errorClasse(e), p)),
                                (v) => setIgnore(e.idEleve, errorClasse(e), [p], v),
                                `${ignoreKey(e.idEleve, errorClasse(e), p)}|err`,
                              ),
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button color="tertiary" variant="ghost" onClick={() => setErrors(null)}>
              {t('competences.cancel')}
            </Button>
            {errors.eleves.length > 0 && errors.codes.length === 0 && !errors.emptyDiscipline && errors.epiTeachers.length === 0 && (
              <Button
                color="primary"
                variant="filled"
                disabled={!allErrorsIgnored(errors.eleves, ignorablePeriodes, ignored)}
                onClick={() => {
                  setErrors(null);
                  void runExport();
                }}
              >
                {t('continue')}
              </Button>
            )}
          </Modal.Footer>
        </Modal>
      )}
    </section>
  );
}

function periodeLabelOf(
  periodes: Array<{ id_type: number; type: number; ordre: number }>,
  idType: number,
  label: (p: { id: number; type: number; ordre?: number }) => string,
) {
  const p = periodes.find((x) => x.id_type === idType);
  return p ? label({ id: p.id_type, type: p.type, ordre: p.ordre }) : String(idType);
}

// ── Archives ──────────────────────────────────────────────────────────────────

function ArchivesExport() {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const { structureId } = useStructure();
  const data = useStructureData();
  const yearId = useId();
  const [type, setType] = useState<'bfc' | 'bulletins'>('bfc');
  const [year, setYear] = useState('');
  const [unchecked, setUnchecked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const yearsQuery = useQuery({ queryKey: ['competences', structureId, 'archive-years', type], queryFn: () => api.getArchiveYears(structureId, type) });
  const bfcQuery = useQuery({ queryKey: ['competences', structureId, 'archives-bfc'], queryFn: () => api.getArchivesBfc(structureId) });
  const bulletinsQuery = useQuery({ queryKey: ['competences', structureId, 'archives-bulletins'], queryFn: () => api.getArchivesBulletins(structureId) });
  const levelsQuery = useQuery({ queryKey: ['competences', structureId, 'maitrise'], queryFn: () => api.getMaitriseLevels(structureId) });

  const years = useMemo(() => (yearsQuery.data ? archiveYears(yearsQuery.data, t('competences.react.archives.current.year')) : []), [yearsQuery.data, t]);
  useEffect(() => {
    if (years[0] && !years.some((y) => y.id === year)) setYear(years[0].id);
  }, [years, year]);
  // Types de période de l'année en cours (`currentYearTypesPeriodes`), tous cochés par défaut.
  const currentTypes = useMemo(
    () =>
      data.periodes
        .filter((p): p is typeof p & { id: number } => p.id !== null && !!yearsQuery.data?.active_year.periodes.includes(p.id))
        .sort((a, b) => a.id - b.id),
    [data.periodes, yearsQuery.data],
  );
  const cycles = useMemo(() => {
    const byCycle = new Map<number, string>();
    for (const l of levelsQuery.data ?? []) if (!byCycle.has(l.id_cycle)) byCycle.set(l.id_cycle, l.cycle ?? String(l.id_cycle));
    return [...byCycle.entries()].sort((a, b) => a[0] - b[0]);
  }, [levelsQuery.data]);
  const typeLabel = (p: { type: number; ordre?: number }) => `${t(`viescolaire.periode.${p.type}`)} ${p.ordre ?? ''}`.trim();
  const isCurrentYear = year !== '' && year === years[0]?.id;

  const generate = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const periodes = type === 'bulletins' && isCurrentYear ? currentTypes.filter((p) => !unchecked.has(p.id)).map((p) => p.id) : undefined;
      const result = await api.downloadArchives(structureId, type, year, periodes);
      if (result.status === 200) download(result.blob, result.filename);
      if (result.status === 204) setMessage({ type: 'info', text: t('no.data.to.export') });
      else if (type === 'bulletins') setMessage({ type: 'info', text: t('evaluations.archives.done') });
    } catch {
      setMessage({ type: 'danger', text: t('evaluation.archives.generation.error') });
    } finally {
      setBusy(false);
    }
  };

  const archivedBulletins = (bulletinsQuery.data ?? []).filter((a) => a.id_annee === year);
  const archivedBfc = (bfcQuery.data ?? []).filter((a) => a.id_annee === year);

  return (
    <section className="card p-16 d-flex flex-column gap-12" aria-labelledby="archives-title">
      <h2 id="archives-title" className="h5 mb-0">
        {t('evaluations.title.archivesBulletinsBFC')}
      </h2>
      {message && (
        <Alert type={message.type} isDismissible onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}
      <fieldset>
        <legend className="h6">{t('evaluations.archives.choice.type')}</legend>
        {(
          [
            ['bfc', 'evaluations.bilan.fin.cycle.title'],
            ['bulletins', 'evaluations.bulletin'],
          ] as const
        ).map(([value, label]) => (
          <div key={value} className="form-check">
            <input
              id={`archive-type-${value}`}
              type="radio"
              name="archive-type"
              className="form-check-input"
              checked={type === value}
              onChange={() => setType(value)}
            />
            <label htmlFor={`archive-type-${value}`} className="form-check-label">
              {t(label)}
            </label>
          </div>
        ))}
      </fieldset>
      <div className="row g-8">
        <div className="col-12 col-md-4">
          <label htmlFor={yearId} className="form-label">
            {t('viescolaire.utils.annee')}
          </label>
          <select id={yearId} className="form-select" value={year} onChange={(e) => setYear(e.target.value)} disabled={years.length === 0}>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.libelle}
              </option>
            ))}
          </select>
        </div>
        {type === 'bulletins' && isCurrentYear && (
          <div className="col-12 col-md-8 d-flex flex-wrap gap-12 align-items-end">
            {currentTypes.map((p) => (
              <div key={p.id} className="form-check">
                <input
                  id={`archive-periode-${p.id}`}
                  type="checkbox"
                  className="form-check-input"
                  checked={!unchecked.has(p.id)}
                  onChange={() =>
                    setUnchecked((s) => {
                      const next = new Set(s);
                      if (next.has(p.id)) next.delete(p.id);
                      else next.add(p.id);
                      return next;
                    })
                  }
                />
                <label htmlFor={`archive-periode-${p.id}`} className="form-check-label">
                  {typeLabel(p)}
                </label>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="d-flex justify-content-end">
        <Button color="primary" variant="filled" isLoading={busy} disabled={!year} onClick={generate}>
          {t('evaluations.archives.button')}
        </Button>
      </div>

      <div className="border rounded p-12">
        <h3 className="h6">{t('evaluations.archives.rapport')}</h3>
        <div className="row g-12 small">
          <div className="col-12 col-md-6">
            <div className="fw-bold">{t('evaluations.archives.bulletins')}</div>
            {currentTypes.map((p) => (
              <div key={p.id}>
                {typeLabel(p)} : {archivedBulletins.filter((a) => a.id_periode === p.id).length}
                {t('evaluations.archives.bulletins.archived')}
              </div>
            ))}
          </div>
          <div className="col-12 col-md-6">
            <div className="fw-bold">{t('evaluations.archives.bfc')}</div>
            {cycles.map(([id, libelle]) => (
              <div key={id}>
                {libelle} : {archivedBfc.filter((a) => a.id_cycle === id).length}
                {t('evaluations.archives.bfc.archived')}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default Exports;
