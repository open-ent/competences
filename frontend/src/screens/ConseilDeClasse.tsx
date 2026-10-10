import { Alert, Button, LoadingScreen, Modal } from '@open-ent/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import * as api from '../api';
import { acquisRow, conseilRights, isEmptyRow, moyenneGenerale } from '../conseil';
import { AvisPanel, Graphiques, ProjetsEleve, Synthese, VieScolaire } from '../features/ConseilTabs';
import { ClasseSelect, StructureSelect, usePeriodeLabel } from '../features/Filters';
import { AppreciationInput } from '../features/SaisieInputs';
import { formatMoyenne, MAX_APPRECIATION } from '../releve';
import { isChefEtabOrHeadTeacher, sortClasses, userHasService } from '../rules';
import { levelsForCycle, sortEleves } from '../saisie';
import { useStructure, useStructureData, useViewer } from '../structure';
import type { PeriodeClasse } from '../types';

/**
 * Conseil de classe (`display_bilan_periodique.html`), onglet « Suivi des acquis » : pour un élève
 * et une période, chaque matière avec ses enseignants, les éléments du programme travaillés,
 * l'appréciation, les moyennes de l'élève et de la classe, le positionnement et le taux de
 * compétences validées.
 *
 * Onglets portés : suivi des acquis (avec la synthèse), projets, vie scolaire ; avis du conseil
 * et d'orientation à côté ; graphiques. Le bilan de fin de cycle renvoie vers la version
 * précédente.
 */
export function ConseilDeClasse() {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const { structures, rightsLoaded, isLoading: structuresLoading } = useStructure();
  const data = useStructureData();
  const viewer = useViewer();
  const periodeLabel = usePeriodeLabel();
  const periodeId = useId();
  const eleveSelectId = useId();
  const [classeId, setClasseId] = useState<string | null>(null);
  const [periodeKey, setPeriodeKey] = useState('');
  const [eleveId, setEleveId] = useState<string | null>(null);

  // Le conseil de classe concerne toutes les classes de l'établissement pour la direction et le
  // professeur principal ; les autres n'y voient que les leurs.
  const classes = useMemo(
    () =>
      viewer
        ? sortClasses(data.classes.filter((c) => isChefEtabOrHeadTeacher(viewer, c) || (c.services ?? []).some((s) => s.id_enseignant === viewer.userId)))
        : [],
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
    const current = periodes.find((p) => p.timestamp_dt.slice(0, 10) <= today && today <= p.timestamp_fn.slice(0, 10)) ?? periodes[0];
    if (current) setPeriodeKey(String(current.id_type));
  }, [periodesQuery.data, periodes, periodeKey, viewer?.today]);
  const periode = periodes.find((p) => String(p.id_type) === periodeKey);

  const elevesQuery = useQuery({ queryKey: ['competences', 'eleves-classe', classeId], queryFn: () => api.getElevesDevoir(classe!), enabled: !!classe });
  const eleves = useMemo(() => sortEleves(elevesQuery.data ?? []), [elevesQuery.data]);
  useEffect(() => {
    if (eleves.length > 0 && !eleves.some((e) => e.id === eleveId)) setEleveId(eleves[0].id);
  }, [eleves, eleveId]);
  const index = eleves.findIndex((e) => e.id === eleveId);
  const eleve = eleves[index];

  if (structuresLoading || !rightsLoaded) return <LoadingScreen position={false} />;
  if (structures.length === 0) return <Alert type="info">{t('competences.react.no.structure')}</Alert>;
  if (data.isLoading || !viewer) return <LoadingScreen position={false} />;

  const nameOf = (e: (typeof eleves)[number]) => e.displayName ?? `${e.lastName ?? ''} ${e.firstName ?? ''}`.trim();

  return (
    <div className="d-flex flex-column gap-16">
      <h1 className="h3 mb-0">{t('evaluations.conseil.de.classe')}</h1>
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
              setEleveId(null);
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
            </select>
          </div>
          <div className="col-12 col-md-3">
            <label htmlFor={eleveSelectId} className="form-label">
              {t('viescolaire.utils.student')}
            </label>
            <select id={eleveSelectId} className="form-select" value={eleveId ?? ''} disabled={!classeId} onChange={(e) => setEleveId(e.target.value || null)}>
              {eleves.map((e) => (
                <option key={e.id} value={e.id}>
                  {nameOf(e)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {!classe || !periode || !eleve ? (
        <Alert type="info">{t('evaluation.bilan.periodique.empty')}</Alert>
      ) : (
        <>
          <div className="d-flex align-items-center justify-content-between gap-12">
            <Button type="button" color="tertiary" variant="ghost" disabled={index <= 0} onClick={() => setEleveId(eleves[index - 1].id)}>
              ← {index > 0 ? nameOf(eleves[index - 1]) : ''}
            </Button>
            <h2 className={`h4 mb-0 ${eleve.deleteDate ? 'text-decoration-line-through' : ''}`}>{nameOf(eleve)}</h2>
            <Button
              type="button"
              color="tertiary"
              variant="ghost"
              disabled={index >= eleves.length - 1}
              onClick={() => setEleveId(eleves[index + 1].id)}
            >
              {index < eleves.length - 1 ? nameOf(eleves[index + 1]) : ''} →
            </Button>
          </div>
          <ConseilEleve key={`${eleve.id}-${periode.id_type}`} classe={classe} periode={periode} periodes={periodes} eleveId={eleve.id} />
        </>
      )}
    </div>
  );
}

type ConseilTab = 'acquis' | 'projets' | 'vie' | 'graphiques';
const TABS: Array<{ id: ConseilTab; label: string }> = [
  { id: 'acquis', label: 'evaluation.bilan.periodique.suivi.acquis' },
  { id: 'projets', label: 'evaluation.bilan.periodique.projets' },
  { id: 'vie', label: 'evaluation.bilan.periodique.vie.scolaire' },
  { id: 'graphiques', label: 'evaluation.bilan.periodique.graphiques' },
];
/** Onglets non portés : ils ouvrent l'AngularJS sur le conseil de classe. */
const OLD_TABS = ['evaluations.bilan.fin.cycle.title'];

/** Un élève au conseil : onglets, avis, et droits de saisie de la période. */
function ConseilEleve({
  classe,
  periode,
  periodes,
  eleveId,
}: {
  classe: NonNullable<ReturnType<typeof useStructureData>['classes'][number]>;
  periode: PeriodeClasse;
  periodes: PeriodeClasse[];
  eleveId: string;
}) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const { rights } = useStructure();
  const viewer = useViewer()!;
  const [tab, setTab] = useState<ConseilTab>('acquis');
  const can = conseilRights({
    published: !!periode.publication_bulletin,
    chefOrHeadTeacher: isChefEtabOrHeadTeacher(viewer, classe),
    hasService: userHasService(classe, viewer),
    workflow: rights,
  });
  const ctx = { classe, periode, periodes, eleveId };

  return (
    <div className="d-flex flex-column gap-16">
      {periode.publication_bulletin && <Alert type="info">{t('competences.react.conseil.published')}</Alert>}
      <AvisPanel {...ctx} editable={can.avis} />
      <div className="d-flex flex-wrap gap-8 align-items-center" role="tablist" aria-label={t('evaluations.conseil.de.classe')}>
        {TABS.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            className={`btn ${tab === x.id ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setTab(x.id)}
          >
            {t(x.label)}
          </button>
        ))}
        {OLD_TABS.map((label) => (
          <a key={label} className="btn btn-outline-secondary" href="/competences?ui=angular#/conseil/de/classe" title={t('competences.switch.notmigrated.action')}>
            {t(label)} ↗
          </a>
        ))}
      </div>
      {tab === 'acquis' && (
        <>
          <SuiviAcquis classe={classe} periode={periode} eleveId={eleveId} editable={can.suiviAcquis} />
          <Synthese {...ctx} editable={can.synthese} />
        </>
      )}
      {tab === 'projets' && <ProjetsEleve {...ctx} editable={can.appreciationsProjets} />}
      {tab === 'vie' && <VieScolaire {...ctx} canEdit={can.vieScolaire} canAppreciation={can.appreciationCPE} />}
      {tab === 'graphiques' && (
        <>
          <Graphiques {...ctx} />
          <Synthese {...ctx} editable={can.synthese} />
        </>
      )}
    </div>
  );
}

function SuiviAcquis({
  classe,
  periode,
  eleveId,
  editable,
}: {
  classe: NonNullable<ReturnType<typeof useStructureData>['classes'][number]>;
  periode: PeriodeClasse;
  eleveId: string;
  editable: boolean;
}) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const queryClient = useQueryClient();
  const { structureId } = useStructure();
  const [error, setError] = useState(false);
  const [confirmClear, setConfirmClear] = useState<{ matiereId: string } | null>(null);
  const key = ['competences', structureId, 'conseil', classe.id, eleveId, periode.id_type];

  const acquisQuery = useQuery({ queryKey: key, queryFn: () => api.getAcquis(eleveId, structureId, classe.id, periode.id_type) });
  const conversionQuery = useQuery({ queryKey: ['competences', structureId, 'conversion', classe.id], queryFn: () => api.getConversionTable(structureId, classe.id) });
  const skillsQuery = useQuery({
    queryKey: ['competences', structureId, 'skills-validated', eleveId, periode.id_type],
    queryFn: () => api.getSkillsValidated(structureId, eleveId, periode.id_type, classe.id),
  });
  const levelsQuery = useQuery({ queryKey: ['competences', structureId, 'maitrise'], queryFn: () => api.getMaitriseLevels(structureId) });

  if ([acquisQuery, conversionQuery, levelsQuery].some((q) => q.isLoading)) return <LoadingScreen position={false} />;
  if (acquisQuery.isError) return <Alert type="danger">{t('bilan.periodique.suivis.des.acquis.error.get')}</Alert>;

  const table = conversionQuery.data ?? [];
  const nbLevels = levelsForCycle(levelsQuery.data ?? [], classe.id_cycle).length || 4;
  const rows = (acquisQuery.data ?? [])
    .map((raw) => ({ raw, row: acquisRow(raw, periode.id_type, table) }))
    .filter(({ raw, row }) => !isEmptyRow(row, raw, periode.id_type))
    .sort((a, b) => (a.raw.rank ?? 0) - (b.raw.rank ?? 0));

  const run = async (write: () => Promise<unknown>) => {
    try {
      setError(false);
      await write();
    } catch {
      setError(true);
    } finally {
      await queryClient.invalidateQueries({ queryKey: key });
    }
  };
  const releveKey = (matiereId: string) => ({ structureId, classe, matiereId, periode: periode.id_type });

  if (rows.length === 0) return <Alert type="info">{t('competences.react.conseil.empty')}</Alert>;

  return (
    <section className="card p-16 d-flex flex-column gap-12">
      <h3 className="h5 mb-0">{t('evaluation.bilan.periodique.suivi.acquis')}</h3>
      {error && <Alert type="danger">{t('competences.react.saisie.save.error')}</Alert>}
      <div className="table-responsive">
        <table className="table align-middle mb-0">
          <thead>
            <tr>
              <th scope="col">{t('matieres')}</th>
              <th scope="col" style={{ minWidth: 200 }}>{t('bilan.perodique.elements.programme.travailles')}</th>
              <th scope="col" style={{ minWidth: 240 }}>{t('appreciation')}</th>
              <th scope="col" className="text-center">{t('average.min.eleve')}</th>
              <th scope="col" className="text-center">{t('average.min.classe')}</th>
              <th scope="col" className="text-center">{t('evaluations.releve.positionnement')}</th>
              <th scope="col" className="text-center">{t('evaluations.validated.skills')} (%)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ row }) => (
              <tr key={row.idMatiere}>
                <th scope="row" className="fw-normal">
                  <div className="fw-bold">{row.libelle}</div>
                  <div className="small text-muted">{row.teachers.join(', ')}</div>
                </th>
                <td>
                  {editable ? (
                    <AppreciationInput
                      disabled={false}
                      label={`${t('bilan.perodique.elements.programme.travailles')} ${row.libelle}`}
                      value={row.elementsProgramme}
                      multiline
                      maxLength={MAX_APPRECIATION}
                      onCommit={async (value) => {
                        if (value !== row.elementsProgramme) await run(() => api.saveElementProgramme(releveKey(row.idMatiere), value));
                      }}
                    />
                  ) : (
                    <span className="small">{row.elementsProgramme}</span>
                  )}
                </td>
                <td>
                  {editable ? (
                    <AppreciationInput
                      disabled={false}
                      label={`${t('viescolaire.utils.appreciation')} ${row.libelle}`}
                      value={row.appreciation}
                      multiline
                      maxLength={MAX_APPRECIATION}
                      onCommit={async (value) => {
                        if (value === row.appreciation) return;
                        if (value.trim() === '') {
                          if (row.appreciation) setConfirmClear({ matiereId: row.idMatiere });
                          return;
                        }
                        await run(() => api.saveAppreciationMatiere(releveKey(row.idMatiere), eleveId, value, row.appreciation ? 'PUT' : 'POST'));
                      }}
                    />
                  ) : (
                    <span className="small">{row.appreciation}</span>
                  )}
                </td>
                <td className="text-center">{formatMoyenne(row.moyenneEleve)}</td>
                <td className="text-center">{formatMoyenne(row.moyenneClasse)}</td>
                <td className="text-center">
                  <PositionnementSelect
                    label={`${t('evaluations.releve.positionnement')} ${row.libelle}`}
                    value={row.positionnement}
                    auto={row.positionnementAuto}
                    nbLevels={nbLevels}
                    disabled={!editable}
                    onChange={(value) =>
                      run(() => api.savePositionnement({ structureId, classeId: classe.id, matiereId: row.idMatiere, periode: periode.id_type }, eleveId, value, value === row.positionnementAuto))
                    }
                  />
                </td>
                <td className="text-center">{skillsQuery.data?.has(row.idMatiere) ? `${skillsQuery.data.get(row.idMatiere)}%` : ''}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="table-light">
            <tr>
              <th scope="row" colSpan={3}>
                {t('competences.react.conseil.moyenne.generale')}
              </th>
              <td className="text-center fw-bold">{formatMoyenne(moyenneGenerale(rows.map(({ row }) => row.moyenneEleve)))}</td>
              <td className="text-center fw-bold">{formatMoyenne(moyenneGenerale(rows.map(({ row }) => row.moyenneClasse)))}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

      {confirmClear && (
        <Modal id="conseil-clear-appreciation" isOpen onModalClose={() => setConfirmClear(null)} size="sm">
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
                await queryClient.refetchQueries({ queryKey: key });
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
                await run(() => api.saveAppreciationMatiere(releveKey(target.matiereId), eleveId, '', 'DELETE'));
              }}
            >
              {t('evaluations.devoir.confirmation')}
            </Button>
          </Modal.Footer>
        </Modal>
      )}
    </section>
  );
}

/** Positionnement : « NN » (0) puis 1 à N ; le positionnement calculé est signalé. */
function PositionnementSelect({
  label,
  value,
  auto,
  nbLevels,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  auto: number;
  nbLevels: number;
  disabled: boolean;
  onChange: (value: number) => Promise<void>;
}) {
  const { t } = useTranslation(['competences', 'common']);
  return (
    <select
      className="form-select form-select-sm"
      aria-label={label}
      value={String(value)}
      disabled={disabled}
      onChange={(e) => void onChange(Number(e.target.value))}
    >
      {Array.from({ length: nbLevels + 1 }, (_, i) => i).map((i) => (
        <option key={i} value={i}>
          {i === 0 ? 'NN' : i}
          {i === auto ? ` (${t('competences.react.conseil.calcule')})` : ''}
        </option>
      ))}
    </select>
  );
}

export default ConseilDeClasse;
