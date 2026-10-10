import { Alert, Button, LoadingScreen, Modal } from '@open-ent/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import * as api from '../api';
import { ClasseSelect, SimpleSelect, StructureSelect, usePeriodeLabel } from '../features/Filters';
import { AppreciationInput, NoteInput } from '../features/SaisieInputs';
import {
  formatMoyenne,
  isNoteLocked,
  isReleveLocked,
  MAX_APPRECIATION,
  moyenneFinale,
  noteOf,
  parseMoyenneFinale,
  sousMatiereMoyenne,
  yearRow,
} from '../releve';
import { isChefEtabOrHeadTeacher, isValidClasse, matieresForClasse, sortClasses } from '../rules';
import { noteWrite, parseSaisie, saisieDisplay, sortEleves } from '../saisie';
import { useStructure, useStructureData, useViewer } from '../structure';
import type { Devoir, PeriodeClasse } from '../types';

/**
 * Relevé périodique (`display_releve.html`) : pour une classe, une matière et une période, les
 * notes de chaque évaluation, la moyenne calculée par le serveur, la moyenne finale et
 * l'appréciation de l'enseignant, puis les statistiques de la classe. Sur l'année, les moyennes
 * de chaque période.
 *
 * Pas encore portés : l'export (PDF, CSV), les graphiques, la fiche détaillée d'un élève et
 * l'aide à la saisie des éléments du programme.
 */
export function Releve() {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const { structureId, structures, rightsLoaded, isLoading: structuresLoading } = useStructure();
  const data = useStructureData();
  const viewer = useViewer();
  const [classeId, setClasseId] = useState<string | null>(null);
  const [periodeKey, setPeriodeKey] = useState<string>('');
  const [matiereId, setMatiereId] = useState<string | null>(null);

  useEffect(() => {
    setClasseId(null);
    setMatiereId(null);
    setPeriodeKey('');
  }, [structureId]);

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
  // Périodes de la classe, puis l'année (`id: null`) ; la clé du sélecteur est l'id_type, « annee » pour l'année.
  // Le serveur ne renvoie pas « Année » : l'AngularJS l'ajoutait lui-même (`Classe.periodes.sync`).
  const periodes = useMemo(() => {
    if (!periodesQuery.data) return [];
    const own = periodesQuery.data.filter((p) => p.id !== null).sort((a, b) => a.id_type - b.id_type);
    const annee: PeriodeClasse = { id: null, id_type: -1, type: 0, ordre: 0, timestamp_dt: '', timestamp_fn: '', date_fin_saisie: null };
    return [...own, annee];
  }, [periodesQuery.data]);
  const periode = periodes.find((p) => (p.id === null ? periodeKey === 'annee' : String(p.id_type) === periodeKey));

  const matieres = useMemo(() => {
    if (!viewer || !classeId) return [];
    const seen = new Set<string>();
    return matieresForClasse(data.matieres, classeId, data.classes, viewer).filter((m) => !seen.has(m.id) && !!seen.add(m.id));
  }, [data.matieres, data.classes, classeId, viewer]);
  useEffect(() => {
    if (matieres.length === 1 && matiereId === null) setMatiereId(matieres[0].id);
  }, [matieres, matiereId]);

  if (structuresLoading || !rightsLoaded) return <LoadingScreen position={false} />;
  if (structures.length === 0) return <Alert type="info">{t('competences.react.no.structure')}</Alert>;
  if (data.isLoading || !viewer) return <LoadingScreen position={false} />;

  const ready = !!classe && !!periode && !!matiereId;
  const periodeLabelOf = (p: PeriodeClasse) => (p.id === null ? 'annee' : String(p.id_type));

  return (
    <div className="d-flex flex-column gap-16">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-12">
        <h1 className="h3 mb-0">{t('evaluations.releve.title')}</h1>
        <div className="d-flex gap-8">
          <Link className="btn btn-outline-primary" to="/devoir/create">
            {t('evaluations.test.new')}
          </Link>
          <Link className="btn btn-outline-primary" to="/devoirs/list">
            {t('evaluations.test.list')}
          </Link>
        </div>
      </div>

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
              setClasseId(id);
              setPeriodeKey('');
              setMatiereId(null);
            }}
          />
          <PeriodePicker periodes={periodes} value={periodeKey} onChange={setPeriodeKey} disabled={!classeId} keyOf={periodeLabelOf} />
          <SimpleSelect
            className="col-12 col-md-3"
            label={t('viescolaire.utils.subject')}
            emptyLabel="—"
            options={matieres.map((m) => ({ value: m.id, label: m.name }))}
            value={matiereId}
            onChange={setMatiereId}
          />
        </div>
      </section>

      {!ready ? (
        <Alert type="info">{t('competences.react.releve.choose')}</Alert>
      ) : periode!.id === null ? (
        <YearView classe={classe!} matiereId={matiereId!} periodes={periodes.filter((p) => p.id !== null)} />
      ) : (
        <PeriodView classe={classe!} matiereId={matiereId!} periode={periode!} periodes={periodes} />
      )}
    </div>
  );
}

function PeriodePicker({
  periodes,
  value,
  onChange,
  disabled,
  keyOf,
}: {
  periodes: PeriodeClasse[];
  value: string;
  onChange: (key: string) => void;
  disabled: boolean;
  keyOf: (p: PeriodeClasse) => string;
}) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const label = usePeriodeLabel();
  const id = useId();
  return (
    <div className="col-12 col-md-3">
      <label htmlFor={id} className="form-label">
        {t('viescolaire.utils.periode')}
      </label>
      <select id={id} className="form-select" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {periodes.map((p) => (
          <option key={keyOf(p)} value={keyOf(p)}>
            {label({ id: p.id === null ? null : p.id_type, type: p.type ?? 0, ordre: p.ordre })}
          </option>
        ))}
      </select>
    </div>
  );
}

type ViewProps = {
  classe: NonNullable<ReturnType<typeof useStructureData>['classes'][number]>;
  matiereId: string;
};

function PeriodView({ classe, matiereId, periode, periodes }: ViewProps & { periode: PeriodeClasse; periodes: PeriodeClasse[] }) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { structureId } = useStructure();
  const data = useStructureData();
  const viewer = useViewer()!;
  const today = viewer.today;
  const chefOrHead = isChefEtabOrHeadTeacher(viewer, classe);
  const key = { structureId, classe, matiereId, periode: periode.id_type };
  const queryKey = ['competences', structureId, 'releve', classe.id, matiereId, periode.id_type];
  const releveQuery = useQuery({ queryKey, queryFn: () => api.getReleve(key) });
  const annotationsQuery = useQuery({
    queryKey: ['competences', structureId, 'annotations'],
    queryFn: () => api.getAnnotations(structureId),
  });
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(true);
  const [confirmClear, setConfirmClear] = useState<{ eleveId: string; previous: string } | null>(null);

  const devoirs = useMemo(
    () =>
      data.devoirs
        .filter((d) => d.id_groupe === classe.id && d.id_matiere === matiereId && d.id_periode === periode.id_type)
        .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id),
    [data.devoirs, classe.id, matiereId, periode.id_type],
  );
  // Sans aucune évaluation notée, l'AngularJS repliait les colonnes de notes.
  const hasEvaluated = devoirs.some((d) => d.is_evaluated);
  useEffect(() => setShowNotes(hasEvaluated), [hasEvaluated]);

  if (releveQuery.isLoading || annotationsQuery.isLoading) return <LoadingScreen position={false} />;
  if (releveQuery.isError || !releveQuery.data) return <Alert type="danger">{t('evaluations.releve.sync.error')}</Alert>;

  const releve = releveQuery.data;
  const annotations = annotationsQuery.data ?? [];
  const eleves = sortEleves(releve.eleves);
  const matiere = data.matieres.find((m) => m.id === matiereId);
  const sousMatieres = matiere?.sousMatieres ?? [];
  const locked = isReleveLocked(periode, today, chefOrHead);
  const stats = (id: number) => releve.devoirs.find((d) => d.id === id);
  const sousMatiereName = (d: Devoir) =>
    d.id_sousmatiere === null ? '' : (data.sousMatieres.find((s) => s.id === Number(d.id_sousmatiere))?.libelle ?? '');

  const run = async (write: () => Promise<unknown>) => {
    try {
      setError(null);
      await write();
    } catch {
      setError(t('competences.react.saisie.save.error'));
    } finally {
      await queryClient.invalidateQueries({ queryKey });
    }
  };

  const commitNote = async (devoir: Devoir, eleveId: string, raw: string): Promise<string | null> => {
    const current = noteOf(releve.notes, eleveId, devoir.id);
    if (raw.trim().toUpperCase() === saisieDisplay(current ? { ...current, id_eleve: eleveId, id_appreciation: null, appreciation: null } : undefined, annotations).toUpperCase()) {
      return null;
    }
    const saisie = parseSaisie(raw, annotations, devoir.diviseur, devoir.is_evaluated);
    if (saisie.kind === 'outOfRange') return `${t('error.note.outbound')}${devoir.diviseur}`;
    if (saisie.kind === 'invalid') return t('competences.react.saisie.invalid', { codes: annotations.map((a) => a.libelle_court).join(', ') });
    const write = noteWrite(saisie, current);
    if (write.kind !== 'nothing') await run(() => api.applyNoteWrite(devoir.id, eleveId, write));
    return null;
  };

  const commitMoyenne = async (eleveId: string, raw: string, auto: number | null | undefined, shown: string): Promise<string | null> => {
    if (raw.trim() === shown) return null;
    const saisie = parseMoyenneFinale(raw, auto);
    if (saisie.kind === 'invalid') return t('error.average.outbound');
    await run(() =>
      saisie.kind === 'set'
        ? api.saveMoyenneFinale(key, eleveId, saisie.moyenne, false)
        : saisie.kind === 'nn'
          ? api.saveMoyenneFinale(key, eleveId, null, false)
          : api.saveMoyenneFinale(key, eleveId, auto ?? null, true),
    );
    return null;
  };

  const commitAppreciation = async (eleveId: string, value: string, previous: string) => {
    if (value === previous) return;
    if (value.trim() === '') {
      // Effacer une appréciation se confirme (`lightbox_confirm_clean_appreciation`).
      if (previous) setConfirmClear({ eleveId, previous });
      return;
    }
    await run(() => api.saveAppreciationMatiere(key, eleveId, value, previous ? 'PUT' : 'POST'));
  };

  const classeStat = (which: 'null' | 'nullFinal', field: 'moyenne' | 'min' | 'max') =>
    formatMoyenne(releve._moyenne_classe?.[which]?.[field]);

  return (
    <div className="d-flex flex-column gap-16">
      {error && <Alert type="danger">{error}</Alert>}
      {locked && <Alert type="warning">{t('end.saisie')}</Alert>}

      <div className="row g-16">
        <section className="col-12 col-lg-6">
          <div className="card p-16 h-100">
            <h2 className="h6">{t('evaluations.releve.appreciation.classe')}</h2>
            <AppreciationInput
              label={t('evaluations.releve.appreciation.classe')}
              value={(releve.appreciation_classe?.appreciation ?? '').trim()}
              disabled={locked}
              multiline
              maxLength={MAX_APPRECIATION}
              onCommit={async (value) => {
                if (value !== (releve.appreciation_classe?.appreciation ?? '').trim()) {
                  await run(() => api.saveAppreciationClasse(key, value));
                }
              }}
            />
          </div>
        </section>
        <section className="col-12 col-lg-6">
          <div className="card p-16 h-100">
            <h2 className="h6">{t('viescolaire.utils.elements.programme')}</h2>
            <AppreciationInput
              label={t('viescolaire.utils.elements.programme')}
              value={releve.elementProgramme?.texte ?? ''}
              disabled={locked}
              multiline
              maxLength={MAX_APPRECIATION}
              onCommit={async (value) => {
                if (value !== (releve.elementProgramme?.texte ?? '')) await run(() => api.saveElementProgramme(key, value));
              }}
            />
          </div>
        </section>
      </div>

      {devoirs.length > 0 && (
        <div>
          <Button type="button" size="sm" color="tertiary" variant="ghost" aria-pressed={showNotes} onClick={() => setShowNotes((v) => !v)}>
            {t(showNotes ? 'evaluations.releve.note.hide' : 'evaluations.releve.note.show')}
          </Button>
        </div>
      )}

      <div className="table-responsive card">
        <table className="table align-middle mb-0">
          <thead>
            <tr>
              <th scope="col">{t('student')}</th>
              {showNotes &&
                devoirs.map((d) => (
                  <th key={d.id} scope="col" className="text-center small">
                    <Link to={`/devoir/${d.id}`}>{d.name}</Link>
                    {sousMatiereName(d) && <div className="text-muted">({sousMatiereName(d)})</div>}
                  </th>
                ))}
              <th scope="col" className="text-center">{t('average.auto.min')}</th>
              <th scope="col" className="text-center">{t('average.final.min')}</th>
              {sousMatieres.map((s) => (
                <th key={s.id_type_sousmatiere} scope="col" className="text-center">
                  {t('average.min')} {s.libelle}
                </th>
              ))}
              <th scope="col" style={{ minWidth: 260 }}>
                {t('viescolaire.utils.appreciation')}
              </th>
            </tr>
          </thead>
          <tbody>
            {eleves.map((eleve) => {
              const name = eleve.displayName ?? `${eleve.lastName ?? ''} ${eleve.firstName ?? ''}`.trim();
              const finale = moyenneFinale(eleve);
              const appreciation = eleve.appreciation_matiere_periode ?? '';
              return (
                <tr key={eleve.id}>
                  <th scope="row" className={`fw-normal ${eleve.deleteDate ? 'text-decoration-line-through text-muted' : ''}`}>
                    {name}
                  </th>
                  {showNotes &&
                    devoirs.map((d) => {
                      const current = noteOf(releve.notes, eleve.id, d.id);
                      const devoirPeriode = periodes.find((p) => p.id_type === d.id_periode);
                      return (
                        <td key={d.id} className="text-center">
                          {d.is_evaluated || current?.id_annotation != null ? (
                            <NoteInput
                              label={`${d.name} ${name}`}
                              value={saisieDisplay(
                                current ? { ...current, id_eleve: eleve.id, id_appreciation: null, appreciation: null } : undefined,
                                annotations,
                              )}
                              annotations={annotations}
                              disabled={isNoteLocked(devoirPeriode, today, chefOrHead)}
                              onCommit={(raw) => commitNote(d, eleve.id, raw)}
                            />
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      );
                    })}
                  <td className="text-center fw-bold">{formatMoyenne(eleve.moyenne)}</td>
                  <td className="text-center">
                    <NoteInput
                      label={`${t('average.final')} ${name}`}
                      value={finale.value}
                      annotations={[]}
                      disabled={locked}
                      onCommit={(raw) => commitMoyenne(eleve.id, raw, eleve.moyenne, finale.value)}
                    />
                    {finale.isSet && <span className="visually-hidden">{t('competences.react.releve.final.changed')}</span>}
                  </td>
                  {sousMatieres.map((s) => (
                    <td key={s.id_type_sousmatiere} className="text-center">
                      {sousMatiereMoyenne(eleve, matiereId, s.id_type_sousmatiere)}
                    </td>
                  ))}
                  <td>
                    <AppreciationInput
                      label={`${t('viescolaire.utils.appreciation')} ${name}`}
                      value={appreciation}
                      disabled={locked}
                      multiline
                      maxLength={MAX_APPRECIATION}
                      onCommit={(value) => commitAppreciation(eleve.id, value, appreciation)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="table-light small">
            {(
              [
                ['viescolaire.classe.moyenne', 'moyenne', 'moyenne'],
                ['viescolaire.classe.note.min', 'noteMin', 'min'],
                ['viescolaire.classe.note.max', 'noteMax', 'max'],
              ] as const
            ).map(([label, devoirField, classeField]) => (
              <tr key={label}>
                <th scope="row">{t(label)}</th>
                {showNotes &&
                  devoirs.map((d) => (
                    <td key={d.id} className="text-center">
                      {d.is_evaluated ? formatMoyenne(stats(d.id)?.[devoirField]) : ''}
                    </td>
                  ))}
                <td className="text-center">{classeStat('null', classeField)}</td>
                <td className="text-center">{classeStat('nullFinal', classeField)}</td>
                {sousMatieres.map((s) => (
                  <td key={s.id_type_sousmatiere} className="text-center">
                    {formatMoyenne(releve._moyenne_classe?.[String(s.id_type_sousmatiere)]?.[classeField])}
                  </td>
                ))}
                <td />
              </tr>
            ))}
          </tfoot>
        </table>
      </div>

      {confirmClear && (
        <Modal id="releve-clear-appreciation" isOpen onModalClose={() => setConfirmClear(null)} size="sm">
          <Modal.Header onModalClose={() => setConfirmClear(null)}>{t('viescolaire.utils.appreciation')}</Modal.Header>
          <Modal.Body>
            <p className="mb-0">{t('competences.react.releve.clear.appreciation')}</p>
          </Modal.Body>
          <Modal.Footer>
            <Button
              color="tertiary"
              variant="ghost"
              onClick={async () => {
                setConfirmClear(null);
                // Annulation : on relit, l'appréciation d'origine revient dans la case.
                await queryClient.invalidateQueries({ queryKey });
                await queryClient.refetchQueries({ queryKey });
              }}
            >
              {t('competences.react.cancel')}
            </Button>
            <Button
              color="danger"
              variant="filled"
              onClick={async () => {
                const target = confirmClear;
                setConfirmClear(null);
                await run(() => api.saveAppreciationMatiere(key, target.eleveId, '', 'DELETE'));
              }}
            >
              {t('evaluations.devoir.confirmation')}
            </Button>
          </Modal.Footer>
        </Modal>
      )}
    </div>
  );
}

/** Vue « Année » : la moyenne de chaque période, finale si elle a été saisie, et celle de l'année. */
function YearView({ classe, matiereId, periodes }: ViewProps & { periodes: PeriodeClasse[] }) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const { structureId } = useStructure();
  const label = usePeriodeLabel();
  const key = { structureId, classe, matiereId, periode: null };
  const releveQuery = useQuery({
    queryKey: ['competences', structureId, 'releve', classe.id, matiereId, 'annee'],
    queryFn: () => api.getReleve(key),
  });
  const anneeQuery = useQuery({
    queryKey: ['competences', structureId, 'releve-annee', classe.id, matiereId],
    queryFn: () => api.getReleveAnnee(key),
  });
  if (releveQuery.isLoading || anneeQuery.isLoading) return <LoadingScreen position={false} />;
  if (!releveQuery.data || !anneeQuery.data) return <Alert type="danger">{t('evaluations.releve.sync.error')}</Alert>;

  const ordered = [...periodes].sort((a, b) => b.type - a.type || a.ordre - b.ordre);
  const eleves = sortEleves(releveQuery.data.eleves);
  return (
    <div className="table-responsive card">
      <table className="table align-middle mb-0">
        <thead>
          <tr>
            <th scope="col">{t('student')}</th>
            {ordered.map((p) => (
              <th key={p.id_type} scope="col" className="text-center">
                {label({ id: p.id_type, type: p.type, ordre: p.ordre })}
              </th>
            ))}
            <th scope="col" className="text-center">{t('viescolaire.utils.annee')}</th>
          </tr>
        </thead>
        <tbody>
          {eleves.map((eleve) => {
            const { byPeriode } = yearRow(eleve.id, anneeQuery.data.moyennes, anneeQuery.data.moyennes_finales);
            const cell = (k: number | null) => {
              const v = byPeriode.get(k);
              return (
                <td key={String(k)} className={`text-center ${v?.isSet ? 'fw-bold' : ''}`} title={v?.isSet ? t('competences.react.releve.final.changed') : undefined}>
                  {v?.value ?? 'NN'}
                </td>
              );
            };
            return (
              <tr key={eleve.id}>
                <th scope="row" className="fw-normal">
                  {eleve.displayName ?? `${eleve.lastName ?? ''} ${eleve.firstName ?? ''}`.trim()}
                </th>
                {ordered.map((p) => cell(p.id_type))}
                {cell(null)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default Releve;
