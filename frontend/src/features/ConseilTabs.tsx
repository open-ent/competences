import { Alert, Button, LoadingScreen, Modal } from '@open-ent/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import * as api from '../api';
import { Avis, avisOfType, avisSynthesePeriode, evenementsHistorique, EvenementLigne } from '../conseil';
import { appreciationsByElement, elementTitle, MAX_PROJET_APPRECIATION } from '../projets';
import { useStructure } from '../structure';
import type { Classe, PeriodeClasse } from '../types';
import { usePeriodeLabel } from './Filters';
import { AppreciationInput } from './SaisieInputs';

/** Synthèse, appréciation du CPE : 600 caractères (`LengthLimit.MAX_600`). */
const MAX_600 = 600;
const CUSTOM = '__custom__';

type Ctx = { classe: Classe; periode: PeriodeClasse; eleveId: string; periodes: PeriodeClasse[] };

const avisKey = (structureId: string, eleveId: string) => ['competences', structureId, 'avis-syntheses', eleveId];

/**
 * Avis du conseil et avis d'orientation (`left-side-bilanperiodique.html`) : un avis de la liste
 * de l'établissement, ou un nouvel avis personnalisé, créé puis posé.
 */
export function AvisPanel({ periode, eleveId, editable }: Ctx & { editable: boolean }) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const queryClient = useQueryClient();
  const { structureId } = useStructure();
  const conseilId = useId();
  const orientationId = useId();
  const [error, setError] = useState(false);
  const [custom, setCustom] = useState<'conseil' | 'orientation' | null>(null);
  const query = useQuery({ queryKey: avisKey(structureId, eleveId), queryFn: () => api.getAvisSyntheses(structureId, eleveId) });
  if (query.isLoading) return <LoadingScreen position={false} />;
  if (query.isError || !query.data) return <Alert type="danger">{t('evaluations.avis.synthses.bilan.periodique.get.error')}</Alert>;
  const current = avisSynthesePeriode(query.data, periode.id_type);
  const k = { structureId, eleveId, periode: periode.id_type };

  const save = async (kind: 'conseil' | 'orientation', value: string) => {
    if (value === CUSTOM) {
      setCustom(kind);
      return;
    }
    try {
      setError(false);
      await api.saveAvis(kind, k, value === '' ? null : Number(value));
    } catch {
      setError(true);
    } finally {
      await queryClient.invalidateQueries({ queryKey: avisKey(structureId, eleveId) });
    }
  };
  const select = (kind: 'conseil' | 'orientation', id: string, label: string, options: Avis[], value: number | null) => (
    <div className="col-12 col-md-6">
      <label htmlFor={id} className="form-label">
        {t(label)}
      </label>
      <select id={id} className="form-select" value={value ?? ''} disabled={!editable} onChange={(e) => save(kind, e.target.value)}>
        <option value="">—</option>
        {options.map((a) => (
          <option key={a.id} value={a.id}>
            {a.libelle}
          </option>
        ))}
        <option value={CUSTOM}>{t('competences.react.conseil.avis.custom')}</option>
      </select>
    </div>
  );

  return (
    <section className="card p-16 d-flex flex-column gap-8">
      <h3 className="h6 mb-0">{t('viescolaire.utils.avis')}</h3>
      {error && <Alert type="danger">{t('evaluations.avis.conseil.bilan.periodique.save.error')}</Alert>}
      <div className="row g-12">
        {select('conseil', conseilId, 'evaluations.evaluation.avis.conseil', avisOfType(query.data.libelleAvis, 1), current.avisConseil)}
        {select('orientation', orientationId, 'evaluations.evaluation.avis.orientation', avisOfType(query.data.libelleAvis, 2), current.avisOrientation)}
      </div>
      {custom && (
        <CustomAvisModal
          onClose={() => setCustom(null)}
          onSave={async (libelle) => {
            try {
              setError(false);
              const id = await api.createAvis(structureId, custom === 'conseil' ? 1 : 2, libelle);
              await api.saveAvis(custom, k, id);
            } catch {
              setError(true);
            } finally {
              setCustom(null);
              await queryClient.invalidateQueries({ queryKey: avisKey(structureId, eleveId) });
            }
          }}
        />
      )}
    </section>
  );
}

function CustomAvisModal({ onClose, onSave }: { onClose: () => void; onSave: (libelle: string) => Promise<void> }) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const [libelle, setLibelle] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!libelle.trim()) return;
    setBusy(true);
    await onSave(libelle.trim());
  };
  return (
    <Modal id="conseil-avis-custom" isOpen size="sm" onModalClose={onClose}>
      <Modal.Header onModalClose={onClose}>{t('viescolaire.utils.avis')}</Modal.Header>
      <form onSubmit={submit}>
        <Modal.Body>
          <input
            type="text"
            className="form-control"
            maxLength={150}
            aria-label={t('evaluations.evaluation.avis.personalize')}
            placeholder={t('evaluations.evaluation.avis.personalize')}
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            autoFocus
          />
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" color="tertiary" variant="ghost" onClick={onClose}>
            {t('competences.react.cancel')}
          </Button>
          <Button type="submit" color="primary" variant="filled" disabled={!libelle.trim()} isLoading={busy}>
            {t('viescolaire.utils.save')}
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

/** Synthèse du bilan périodique (`display_synthese.html`), avec l'historique des périodes. */
export function Synthese({ classe, periode, eleveId, periodes, editable }: Ctx & { editable: boolean }) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const queryClient = useQueryClient();
  const { structureId } = useStructure();
  const periodeLabel = usePeriodeLabel();
  const [history, setHistory] = useState(false);
  const [error, setError] = useState(false);
  const query = useQuery({ queryKey: avisKey(structureId, eleveId), queryFn: () => api.getAvisSyntheses(structureId, eleveId) });
  if (query.isLoading || !query.data) return null;
  const data = query.data;
  const current = avisSynthesePeriode(data, periode.id_type);
  const libelleAvis = (id: number | null) => data.libelleAvis.find((a) => a.id === id)?.libelle ?? '—';
  const label = (p: PeriodeClasse) => periodeLabel({ id: p.id_type, type: p.type, ordre: p.ordre });

  return (
    <section className="card p-16 d-flex flex-column gap-8">
      <div className="d-flex justify-content-between align-items-center gap-12">
        <h3 className="h6 mb-0">
          {t('evaluations.synthese.acquis.bilan.periodique')} {label(periode)}
        </h3>
        <Button type="button" size="sm" color="secondary" variant="outline" onClick={() => setHistory(true)}>
          {t('history')}
        </Button>
      </div>
      {error && <Alert type="danger">{t('evaluation.synthese.bilan.periodique.save.error')}</Alert>}
      <AppreciationInput
        label={t('evaluations.synthese.acquis.bilan.periodique')}
        value={current.synthese}
        disabled={!editable}
        multiline
        maxLength={MAX_600}
        onCommit={async (value) => {
          if (value === current.synthese) return;
          try {
            setError(false);
            await api.saveSynthese({ structureId, classeId: classe.id, eleveId, periode: periode.id_type }, value);
          } catch {
            setError(true);
          } finally {
            await queryClient.invalidateQueries({ queryKey: avisKey(structureId, eleveId) });
          }
        }}
      />
      {history && (
        <Modal id="conseil-synthese-history" isOpen size="lg" onModalClose={() => setHistory(false)}>
          <Modal.Header onModalClose={() => setHistory(false)}>{t('history')}</Modal.Header>
          <Modal.Body>
            <div className="d-flex flex-column gap-16">
              {periodes.map((p) => {
                const old = avisSynthesePeriode(data, p.id_type);
                return (
                  <article key={p.id_type} className="border-bottom pb-12">
                    <h4 className="h6">
                      {t('evaluations.synthese.acquis.bilan.periodique')} {label(p)}
                    </h4>
                    <p className="mb-4">{old.synthese || '—'}</p>
                    <div className="small">
                      {t('evaluations.evaluation.avis.conseil')} : {libelleAvis(old.avisConseil)}
                    </div>
                    <div className="small">
                      {t('evaluations.evaluation.avis.orientation')} : {libelleAvis(old.avisOrientation)}
                    </div>
                  </article>
                );
              })}
            </div>
          </Modal.Body>
        </Modal>
      )}
    </section>
  );
}

const PROJET_KINDS: Array<{ type: number; label: string }> = [
  { type: 1, label: 'enseignements.pratiques.interdisciplinaires' },
  { type: 2, label: 'accompagnements.personnalises' },
  { type: 3, label: 'parcours.educatifs' },
];

/** Onglet « Projets » (`display_projets.html`) : l'appréciation de l'élève sur chaque élément de la classe. */
export function ProjetsEleve({ classe, periode, eleveId, editable }: Ctx & { editable: boolean }) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const queryClient = useQueryClient();
  const { structureId } = useStructure();
  const [error, setError] = useState(false);
  const elementsQuery = useQuery({
    queryKey: ['competences', structureId, 'projet-elements', classe.id, 'tous'],
    queryFn: () => api.getProjetElements(structureId, classe.id),
  });
  const ids = (elementsQuery.data ?? []).map((e) => e.id);
  const teachersQuery = useQuery({
    queryKey: ['competences', structureId, 'projet-teachers', classe.id, ids],
    queryFn: () => api.getProjetTeachers(structureId, classe.id, ids),
    enabled: elementsQuery.isSuccess,
  });
  const appKey = ['competences', structureId, 'projet-appreciations', classe.id, periode.id_type, ids];
  const appQuery = useQuery({
    queryKey: appKey,
    queryFn: () => api.getProjetAppreciations(structureId, classe.id, periode.id_type, ids),
    enabled: elementsQuery.isSuccess,
  });
  if (elementsQuery.isLoading || appQuery.isLoading) return <LoadingScreen position={false} />;
  const elements = elementsQuery.data ?? [];
  if (elements.length === 0) return <Alert type="info">{t('evaluation.bilan.periodique.projet.empty')}</Alert>;
  const byElement = appreciationsByElement(appQuery.data ?? []);

  return (
    <div className="d-flex flex-column gap-16">
      {error && <Alert type="danger">{t('competences.react.saisie.save.error')}</Alert>}
      {PROJET_KINDS.map((kind) => {
        const list = elements.filter((e) => e.type === kind.type);
        if (list.length === 0) return null;
        return (
          <section key={kind.type} className="card p-16 d-flex flex-column gap-12">
            <h3 className="h6 mb-0">{t(kind.label)}</h3>
            {list.map((element) => {
              const previous = byElement.get(element.id)?.eleves.get(eleveId) ?? '';
              return (
                <div key={element.id} className="row g-12 align-items-start">
                  <div className="col-12 col-md-4">
                    <div className="fw-bold">{elementTitle(element)}</div>
                    {element.type === 1 && element.theme && <div className="small">{element.theme.libelle}</div>}
                    <div className="small fst-italic">{[...new Set(teachersQuery.data?.get(element.id) ?? [])].sort().join(', ')}</div>
                  </div>
                  <div className="col-12 col-md-8">
                    <AppreciationInput
                      label={`${elementTitle(element)} — ${t('viescolaire.utils.appreciation')}`}
                      value={previous}
                      disabled={!editable}
                      multiline
                      maxLength={MAX_PROJET_APPRECIATION}
                      onCommit={async (value) => {
                        if (value === previous) return;
                        try {
                          setError(false);
                          await api.saveAppreciationElementConseil(
                            { structureId, classe, periode: periode.id_type, elementId: element.id, eleveId },
                            value,
                          );
                        } catch {
                          setError(true);
                        } finally {
                          await queryClient.invalidateQueries({ queryKey: appKey });
                        }
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

const COLONNES: Array<{ key: 'retard' | 'abs_just' | 'abs_non_just' | 'abs_totale_heure'; label: string; unit?: string }> = [
  { key: 'retard', label: 'viescolaire.retards' },
  { key: 'abs_just', label: 'viescolaire.abs.justified', unit: 'half.days' },
  { key: 'abs_non_just', label: 'viescolaire.abs.not.justified', unit: 'half.days' },
  { key: 'abs_totale_heure', label: 'viescolaire.nb.courses.lost', unit: 'hours' },
];

/**
 * Onglet « Vie scolaire » (`display_vie_scolaire.html`) : retards et absences de la période —
 * modifiables sauf quand ils viennent du module Présences —, appréciation du CPE, et l'historique
 * des périodes avec le total de l'année.
 */
export function VieScolaire({
  classe,
  periode,
  eleveId,
  periodes,
  canEdit,
  canAppreciation,
}: Ctx & { canEdit: boolean; canAppreciation: boolean }) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const queryClient = useQueryClient();
  const { structureId } = useStructure();
  const periodeLabel = usePeriodeLabel();
  const [error, setError] = useState(false);
  const key = ['competences', structureId, 'evenements', classe.id, eleveId];
  const evenementsQuery = useQuery({ queryKey: key, queryFn: () => api.getEvenements(structureId, classe.id, eleveId) });
  const cpeKey = ['competences', structureId, 'appreciation-cpe', eleveId, periode.id_type];
  const cpeQuery = useQuery({ queryKey: cpeKey, queryFn: () => api.getAppreciationCPE(structureId, eleveId, periode.id_type) });
  if (evenementsQuery.isLoading || cpeQuery.isLoading) return <LoadingScreen position={false} />;

  const evenements = evenementsQuery.data ?? [];
  const fromPresences = !!evenements[0]?.from_presences;
  const lignes = evenementsHistorique(
    evenements,
    periodes.map((p) => p.id_type),
  );
  const ligne = lignes.find((l) => l.id_periode === periode.id_type)!;
  const label = (l: EvenementLigne) => {
    const p = periodes.find((x) => x.id_type === l.id_periode);
    return p ? periodeLabel({ id: p.id_type, type: p.type, ordre: p.ordre }) : t('viescolaire.utils.annee');
  };
  const run = async (write: () => Promise<unknown>, invalidate: unknown[]) => {
    try {
      setError(false);
      await write();
    } catch {
      setError(true);
    } finally {
      await queryClient.invalidateQueries({ queryKey: invalidate });
    }
  };

  return (
    <div className="d-flex flex-column gap-16">
      {error && <Alert type="danger">{t('competences.react.saisie.save.error')}</Alert>}
      <section className="card p-16 d-flex flex-column gap-12">
        <h3 className="h6 mb-0">{t('competences.on.periode')}</h3>
        {fromPresences && <p className="small text-muted mb-0">{t('competences.react.conseil.from.presences')}</p>}
        <div className="row g-12">
          {COLONNES.map((c) => (
            <div key={c.key} className="col-12 col-md-3">
              <label htmlFor={`vie-${c.key}`} className="form-label">
                {t(c.label).trim()}
                {c.unit && ` (${t(c.unit).trim()})`}
              </label>
              <input
                id={`vie-${c.key}`}
                key={`${c.key}-${ligne[c.key]}`}
                type="number"
                min={0}
                className="form-control"
                defaultValue={ligne[c.key]}
                disabled={!canEdit || fromPresences}
                onBlur={(e) => {
                  const value = Math.max(0, Number(e.target.value) || 0);
                  if (value !== ligne[c.key]) void run(() => api.saveEvenement(eleveId, periode.id_type, c.key, value), key);
                }}
              />
            </div>
          ))}
        </div>
        <AppreciationInput
          label={t('bilan.periodique.appreciationCPE.placeholder')}
          value={cpeQuery.data ?? ''}
          disabled={!canAppreciation}
          multiline
          maxLength={MAX_600}
          onCommit={async (value) => {
            if (value !== (cpeQuery.data ?? '')) await run(() => api.saveAppreciationCPE(eleveId, periode.id_type, value), cpeKey);
          }}
        />
      </section>
      <section className="card p-16">
        <h3 className="h6">{t('history')}</h3>
        <div className="table-responsive">
          <table className="table table-sm mb-0">
            <thead>
              <tr>
                <th scope="col">{t('viescolaire.utils.periode')}</th>
                {COLONNES.map((c) => (
                  <th key={c.key} scope="col">
                    {t(c.label)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.id_periode ?? 'annee'} className={l.id_periode === null ? 'fw-bold' : undefined}>
                  <th scope="row" className="fw-normal">
                    {label(l)}
                  </th>
                  {COLONNES.map((c) => (
                    <td key={c.key}>
                      {l[c.key]}
                      {c.unit && ` ${t(c.unit).trim()}`}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
