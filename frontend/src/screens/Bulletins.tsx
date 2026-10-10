import { Alert, Button, LoadingScreen, Modal } from '@open-ent/react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import * as api from '../api';
import { BULLETIN_OPTIONS, bulletinBody, bulletinPeriodes, orientationDefaultKey, PrintOptions } from '../bulletins';
import { StructureSelect, usePeriodeLabel } from '../features/Filters';
import { isChefEtabOrHeadTeacher, sortClasses } from '../rules';
import { sortEleves } from '../saisie';
import { useStructure, useStructureData, useViewer } from '../structure';
import type { EleveDevoir } from '../types';

type Student = EleveDevoir & { idClasse: string; classeName: string };

/**
 * Génération des bulletins (`print_bulletin.html`) : classes et élèves, période, options des
 * deux pages, puis un PDF par classe, produit par le serveur. Les options choisies sont
 * mémorisées dans la même préférence que l'AngularJS (`competences.printBulletin`).
 *
 * Pas encore portés : le bilan par domaine avec ses graphiques (dessinés dans le navigateur puis
 * envoyés en images), les modèles d'options enregistrés, l'envoi du logo et de la signature (ceux
 * déjà enregistrés pour l'établissement sont bien utilisés).
 */
export function Bulletins() {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const { structureId, structures, rightsLoaded, isLoading: structuresLoading } = useStructure();
  const data = useStructureData();
  const viewer = useViewer();
  const periodeLabel = usePeriodeLabel();
  const periodeId = useId();
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set());
  const [unselected, setUnselected] = useState<Set<string>>(new Set());
  const [periodeType, setPeriodeType] = useState<number | null>(null);
  const [print, setPrint] = useState<PrintOptions>({});
  const [mention, setMention] = useState('');
  const [orientation, setOrientation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'danger' | 'warning'; text: string } | null>(null);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);

  // Bulletins : classes (pas les groupes) de la direction, du professeur principal ou du personnel d'éducation.
  const classes = useMemo(
    () =>
      viewer
        ? sortClasses(data.classes.filter((c) => c.type_groupe === 0 && (isChefEtabOrHeadTeacher(viewer, c) || viewer.isPersEducNat)))
        : [],
    [data.classes, viewer],
  );
  const chosen = classes.filter((c) => selectedClasses.has(c.id));
  const classeQueries = useQueries({
    queries: chosen.flatMap((c) => [
      { queryKey: ['competences', 'eleves-classe', c.id], queryFn: () => api.getElevesDevoir(c) },
      { queryKey: ['competences', 'periodes-classe', c.id], queryFn: () => api.getPeriodesClasse(c.id) },
    ]),
  });
  const loadingClasses = classeQueries.some((q) => q.isLoading);
  const students: Student[] = useMemo(
    () =>
      sortEleves(
        chosen.flatMap((c, i) =>
          ((classeQueries[i * 2]?.data as EleveDevoir[] | undefined) ?? []).map((e) => ({ ...e, idClasse: c.id, classeName: c.name })),
        ),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chosen.map((c) => c.id).join(','), classeQueries.map((q) => q.dataUpdatedAt).join(',')],
  );
  const periodes = useMemo(
    () => bulletinPeriodes(new Map(chosen.map((c, i) => [c.id, (classeQueries[i * 2 + 1]?.data as never) ?? []]))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chosen.map((c) => c.id).join(','), classeQueries.map((q) => q.dataUpdatedAt).join(',')],
  );
  const periode = periodes.find((p) => p.id_type === periodeType);

  const modelsQuery = useQuery({ queryKey: ['competences', structureId, 'matiere-models'], queryFn: () => api.getMatiereModels(structureId), enabled: !!structureId });
  const infosQuery = useQuery({ queryKey: ['competences', structureId, 'bulletin-infos'], queryFn: () => api.getBulletinStructureInfos(structureId), enabled: !!structureId });
  const preferenceQuery = useQuery({ queryKey: ['competences', 'preference-competences'], queryFn: api.getCompetencesPreference, staleTime: Infinity });

  // Options mémorisées, puis nom du chef d'établissement enregistré pour l'établissement.
  useEffect(() => {
    if (!preferenceQuery.data) return;
    const saved = (preferenceQuery.data.printBulletin as PrintOptions | undefined) ?? {};
    setPrint((p) => ({ ...saved, ...p, nameCE: saved.nameCE ?? infosQuery.data?.nameAndBrad?.name ?? p.nameCE }));
  }, [preferenceQuery.data, infosQuery.data]);
  useEffect(() => {
    setMention(t('conseil.avis.mention'));
  }, [t]);
  useEffect(() => {
    if (periodeType !== null) setOrientation(t(orientationDefaultKey(periodeType)));
  }, [periodeType, t]);

  if (structuresLoading || !rightsLoaded) return <LoadingScreen position={false} />;
  if (structures.length === 0) return <Alert type="info">{t('competences.react.no.structure')}</Alert>;
  if (data.isLoading || !viewer) return <LoadingScreen position={false} />;

  const selectedStudents = students.filter((s) => !unselected.has(`${s.idClasse}|${s.id}`) && periode?.classes.includes(s.idClasse));
  const flag = (k: string) => print[k] === true;
  const set = (patch: PrintOptions) => setPrint((p) => ({ ...p, ...patch }));
  const toggleClasse = (id: string) =>
    setSelectedClasses((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const nameOf = (s: Student) => `${s.displayName ?? `${s.lastName ?? ''} ${s.firstName ?? ''}`.trim()} (${s.classeName})`;

  const send = async () => {
    setConfirmDuplicate(false);
    setBusy(true);
    setMessage(null);
    const conflicts: string[] = [];
    const done: string[] = [];
    try {
      const other = data.enseignants.find((e) => e.id === print.otherTeacherId);
      for (const classe of chosen) {
        const ids = selectedStudents.filter((s) => s.idClasse === classe.id).map((s) => s.id);
        if (ids.length === 0 || !periode) continue;
        const result = await api.generateBulletins(
          bulletinBody(print, {
            structureId,
            classeId: classe.id,
            classeName: classe.name,
            periode,
            studentIds: ids,
            mentionOpinion: mention,
            orientationOpinion: orientation,
            otherTeacherName: other ? ` : ${other.displayName}` : '',
            images: { imgStructure: infosQuery.data?.imgStructure?.path, imgSignature: infosQuery.data?.nameAndBrad?.path },
          }),
        );
        if ('conflict' in result) {
          conflicts.push(...result.conflict);
          continue;
        }
        const link = document.createElement('a');
        link.href = URL.createObjectURL(result.blob);
        link.download = result.filename;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(link.href);
        }, 100);
        done.push(classe.name);
      }
      if (conflicts.length > 0) setMessage({ type: 'warning', text: `${t('competences.react.bulletins.conflict')} ${conflicts.join(', ')}` });
      else setMessage({ type: 'success', text: `${done.join(', ')} : ${t('evaluations.export.bulletin.success')}` });
    } catch {
      setMessage({ type: 'danger', text: t('competences.react.bulletins.error') });
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    if (!periode || selectedStudents.length === 0) {
      setMessage({ type: 'warning', text: t('evaluations.choose.student.for.periode') });
      return;
    }
    // Mémorisation des options, comme l'AngularJS, dans la préférence partagée.
    const preference = preferenceQuery.data ?? {};
    void api.setCompetencesPreference({ ...preference, printBulletin: print });
    try {
      setBusy(true);
      const exists = await api.bulletinsExist(
        selectedStudents.map((s) => ({ id: s.id, idClasse: s.idClasse })),
        periode.id_type,
        structureId,
      );
      setBusy(false);
      if (exists) {
        setConfirmDuplicate(true);
        return;
      }
    } catch {
      setBusy(false);
      setMessage({ type: 'danger', text: t('evaluations.export.bulletin.error.check.bulletins') });
      return;
    }
    await send();
  };

  const checkbox = ([key, label]: readonly [string, string]) => (
    <div key={key} className="col-12 col-md-4 form-check">
      <input id={`bulletin-${key}`} type="checkbox" className="form-check-input" checked={flag(key)} onChange={(e) => set({ [key]: e.target.checked })} />
      <label htmlFor={`bulletin-${key}`} className="form-check-label">
        {t(label)}
      </label>
    </div>
  );

  return (
    <div className="d-flex flex-column gap-16">
      <h1 className="h3 mb-0">{t('evaluations.generate.bulletin')}</h1>
      {message && (
        <Alert type={message.type} isDismissible onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      <section className="card p-16 d-flex flex-column gap-12">
        <h2 className="h6 mb-0">{t('viescolaire.utils.criterion')}</h2>
        <StructureSelect className="col-12 col-md-4" />
        <fieldset>
          <legend className="h6">{t('viescolaire.utils.class')}</legend>
          <div className="d-flex flex-wrap gap-8">
            {classes.map((c) => (
              <Button
                key={c.id}
                type="button"
                size="sm"
                color="primary"
                variant={selectedClasses.has(c.id) ? 'filled' : 'outline'}
                aria-pressed={selectedClasses.has(c.id)}
                onClick={() => toggleClasse(c.id)}
              >
                {c.name}
              </Button>
            ))}
            {classes.length === 0 && <span className="text-muted">{t('competences.react.bulletins.no.classe')}</span>}
          </div>
        </fieldset>
        <div className="col-12 col-md-4">
          <label htmlFor={periodeId} className="form-label">
            {t('viescolaire.utils.periode')}
          </label>
          <select
            id={periodeId}
            className="form-select"
            value={periodeType ?? ''}
            disabled={periodes.length === 0}
            onChange={(e) => setPeriodeType(e.target.value === '' ? null : Number(e.target.value))}
          >
            <option value="">—</option>
            {periodes.map((p) => (
              <option key={p.id_type} value={p.id_type}>
                {periodeLabel({ id: p.id_type, type: p.type, ordre: p.ordre })}
              </option>
            ))}
          </select>
        </div>
        {loadingClasses && <LoadingScreen position={false} />}
        {periode && (
          <fieldset>
            <legend className="h6">
              {t('viescolaire.utils.student')} ({selectedStudents.length})
            </legend>
            <div className="d-flex flex-wrap gap-8">
              {students
                .filter((s) => periode.classes.includes(s.idClasse))
                .map((s) => {
                  const key = `${s.idClasse}|${s.id}`;
                  const on = !unselected.has(key);
                  return (
                    <div key={key} className="form-check">
                      <input
                        id={`bulletin-eleve-${key}`}
                        type="checkbox"
                        className="form-check-input"
                        checked={on}
                        onChange={() =>
                          setUnselected((u) => {
                            const next = new Set(u);
                            if (on) next.add(key);
                            else next.delete(key);
                            return next;
                          })
                        }
                      />
                      <label htmlFor={`bulletin-eleve-${key}`} className="form-check-label small">
                        {nameOf(s)}
                      </label>
                    </div>
                  );
                })}
            </div>
          </fieldset>
        )}
      </section>

      <section className="card p-16 d-flex flex-column gap-12">
        <h2 className="h6 mb-0">{t('viescolaire.utils.options')}</h2>
        <fieldset>
          <legend className="h6">{t('evaluations.page.one')}</legend>
          <div className="row g-8">{BULLETIN_OPTIONS.page1.map(checkbox)}</div>
        </fieldset>
        <div className="row g-8">
          <div className="col-12 col-md-4 form-check">
            <input id="bulletin-other" type="checkbox" className="form-check-input" checked={flag('addOtherTeacher')} onChange={(e) => set({ addOtherTeacher: e.target.checked })} />
            <label htmlFor="bulletin-other" className="form-check-label">
              {t('evaluations.export.bulletin.add.function')}
            </label>
          </div>
          {flag('addOtherTeacher') && (
            <>
              <div className="col-12 col-md-4">
                <input
                  type="text"
                  className="form-control"
                  aria-label={t('evaluations.export.bulletin.add.function')}
                  value={print.functionOtherTeacher ?? ''}
                  onChange={(e) => set({ functionOtherTeacher: e.target.value })}
                />
              </div>
              <div className="col-12 col-md-4">
                <select
                  className="form-select"
                  aria-label={t('viescolaire.utils.teacher')}
                  value={print.otherTeacherId ?? ''}
                  onChange={(e) => set({ otherTeacherId: e.target.value })}
                >
                  <option value="">—</option>
                  {data.enseignants.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.displayName}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
        <fieldset>
          <legend className="h6">{t('evaluations.page.two')}</legend>
          <div className="row g-8">{BULLETIN_OPTIONS.page2.map(checkbox)}</div>
        </fieldset>
        <fieldset>
          <legend className="h6">{t('viescolaire.utils.parameter')}</legend>
          <div className="row g-8">{BULLETIN_OPTIONS.parametres.map(checkbox)}</div>
          <div className="row g-8 mt-4">
            <div className="col-12 col-md-6">
              <label htmlFor="bulletin-name-ce" className="form-label">
                {t('evaluations.export.bulletin.nameCE')}
              </label>
              <input id="bulletin-name-ce" type="text" className="form-control" value={print.nameCE ?? ''} onChange={(e) => set({ nameCE: e.target.value })} />
            </div>
            <div className="col-12 col-md-6">
              <div className="form-check mt-24">
                <input id="bulletin-use-model" type="checkbox" className="form-check-input" checked={flag('useModel')} onChange={(e) => set({ useModel: e.target.checked })} />
                <label htmlFor="bulletin-use-model" className="form-check-label">
                  {t('evaluations.use.model.libelle')}
                </label>
              </div>
              {flag('useModel') && (
                <select
                  className="form-select mt-4"
                  aria-label={t('evaluations.choose.model')}
                  value={print.idModel ?? ''}
                  onChange={(e) => set({ idModel: e.target.value === '' ? undefined : Number(e.target.value) })}
                >
                  <option value="">—</option>
                  {(modelsQuery.data ?? [])
                    .filter((m) => m.id !== undefined)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title}
                      </option>
                    ))}
                </select>
              )}
            </div>
          </div>
        </fieldset>
        <fieldset>
          <legend className="h6">{t('viescolaire.utils.edit_wording')}</legend>
          <div className="row g-8">
            <div className="col-12 col-md-6">
              <label htmlFor="bulletin-mention" className="form-label">
                {t('competences.react.bulletins.mention')}
              </label>
              <input id="bulletin-mention" type="text" className="form-control" value={mention} onChange={(e) => setMention(e.target.value)} />
            </div>
            <div className="col-12 col-md-6">
              <label htmlFor="bulletin-orientation" className="form-label">
                {t('competences.react.bulletins.orientation')}
              </label>
              <input id="bulletin-orientation" type="text" className="form-control" value={orientation} onChange={(e) => setOrientation(e.target.value)} />
            </div>
          </div>
        </fieldset>
        <div className="d-flex justify-content-end">
          <Button color="primary" variant="filled" isLoading={busy} disabled={!periode || selectedStudents.length === 0} onClick={generate}>
            {t('evaluation.lsu.export.button')}
          </Button>
        </div>
      </section>

      {confirmDuplicate && (
        <Modal id="bulletin-duplicate" isOpen onModalClose={() => setConfirmDuplicate(false)} size="sm">
          <Modal.Header onModalClose={() => setConfirmDuplicate(false)}>{t('bulletinAlert.title')}</Modal.Header>
          <Modal.Body>
            <p className="mb-0">{t('bulletinAlert.text')}</p>
          </Modal.Body>
          <Modal.Footer>
            <Button color="tertiary" variant="ghost" onClick={() => setConfirmDuplicate(false)}>
              {t('competences.react.cancel')}
            </Button>
            <Button color="primary" variant="filled" onClick={send}>
              {t('evaluations.devoir.confirmation')}
            </Button>
          </Modal.Footer>
        </Modal>
      )}
    </div>
  );
}

export default Bulletins;
