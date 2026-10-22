import { Alert, Button, Modal } from '@open-ent/react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import * as api from '../api';
import {
  canEditSelection,
  duplicationTargets,
  evaluatedMessage,
  evaluatedSplit,
  splitDeletable,
  type EvaluatedSplit,
  type PeriodesByClasse,
} from '../devoirActions';
import { isValidClasse } from '../rules';
import type { Viewer } from '../rules';
import type { Classe, Devoir } from '../types';
import { PrintDevoir } from './PrintDevoir';

type Step = 'none' | 'duplicate' | 'delete1' | 'delete2' | 'print';

/**
 * Barre d'actions de la sélection (`toggle-buttons` de `display_devoirs_structure.html`) : modifier et exporter
 * un seul devoir, dupliquer vers d'autres classes, supprimer — avec la double confirmation quand des notes ou
 * des compétences évaluées vont disparaître.
 */
export function DevoirActions({
  selected,
  classes,
  viewer,
  structureId,
  onEdit,
  onDone,
}: {
  selected: Devoir[];
  classes: Classe[];
  viewer: Viewer;
  structureId: string;
  onEdit: (id: number) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('none');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [targets, setTargets] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [evaluated, setEvaluated] = useState<EvaluatedSplit>({ skills: [], marks: [] });

  // Les périodes des classes sélectionnées donnent la fin de saisie (même clé que le formulaire d'évaluation).
  const classIds = [...new Set(selected.map((d) => d.id_groupe))];
  const periodes: PeriodesByClasse = {};
  useQueries({
    queries: classIds.map((id) => ({ queryKey: ['competences', 'periodes-classe', id], queryFn: () => api.getPeriodesClasse(id), staleTime: 5 * 60_000 })),
    combine: (results) => results.forEach((r, i) => (periodes[classIds[i]] = r.data)),
  });

  const { deletable, uncancelable } = splitDeletable(selected, periodes, classes, viewer);
  const single = selected.length === 1 ? selected[0] : null;
  const close = () => {
    setStep('none');
    setError(null);
    setTargets([]);
    setSearch('');
  };

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['competences', structureId] });
    onDone();
  };

  const duplicate = async () => {
    if (!single) return;
    setBusy(true);
    setError(null);
    try {
      await api.duplicateDevoir(single.id, targets);
      close();
      await refresh();
    } catch {
      setError(t('evaluation.duplicate.devoir.error'));
    } finally {
      setBusy(false);
    }
  };

  /** Première confirmation : on demande au serveur si des notes ou compétences évaluées sont en jeu. */
  const firstConfirm = async () => {
    setBusy(true);
    setError(null);
    let split: EvaluatedSplit;
    try {
      split = evaluatedSplit(await api.getEvaluatedDevoirs(deletable.map((d) => d.id)), deletable);
    } catch {
      setError(t('evaluation.delete.devoir.error'));
      setBusy(false);
      return;
    }
    setEvaluated(split);
    if (evaluatedMessage(split)) {
      setStep('delete2');
      setBusy(false);
    } else await remove();
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      // Un par un, comme l'AngularJS : une erreur n'empêche pas de supprimer les suivants.
      const results = await Promise.allSettled(deletable.map((d) => api.deleteDevoir(d.id)));
      await refresh();
      if (results.some((r) => r.status === 'rejected')) {
        setStep('delete1');
        setError(t('evaluation.delete.devoir.error'));
      } else close();
    } finally {
      setBusy(false);
    }
  };

  const names = (list: Devoir[]) => (
    <ul>
      {list.map((d) => (
        <li key={d.id}>{d.name}</li>
      ))}
    </ul>
  );
  const message = evaluatedMessage(evaluated);
  const dup = duplicationTargets(classes, search, (c) => isValidClasse(c.id, undefined, classes, viewer));
  const checkbox = (c: Classe) => (
    <div key={c.id} className="form-check col-6 col-md-3">
      <input
        id={`dup-${c.id}`}
        type="checkbox"
        className="form-check-input"
        checked={targets.includes(c.id)}
        onChange={(e) => setTargets((l) => (e.target.checked ? [...l, c.id] : l.filter((x) => x !== c.id)))}
      />
      <label htmlFor={`dup-${c.id}`} className="form-check-label">
        {c.name}
      </label>
    </div>
  );

  return (
    <div className="d-flex flex-wrap gap-8 align-items-center" data-devoir-actions>
      <span className="text-muted small" role="status">
        {t('competences.react.devoirs.selected', { count: selected.length })}
      </span>
      {canEditSelection(selected, periodes, classes, viewer) && (
        <Button type="button" color="secondary" variant="outline" size="sm" onClick={() => onEdit(single!.id)} data-action="edit">
          {t('evaluations.test.edit')}
        </Button>
      )}
      {single && (
        <Button type="button" color="secondary" variant="outline" size="sm" onClick={() => setStep('duplicate')} data-action="duplicate">
          {t('evaluations.toaster.duplication')}
        </Button>
      )}
      <Button type="button" color="danger" variant="outline" size="sm" onClick={() => setStep('delete1')} data-action="delete">
        {t('evaluations.test.delete')}
      </Button>
      {single && (
        <Button type="button" color="secondary" variant="outline" size="sm" onClick={() => setStep('print')} data-action="export">
          {t('evaluations.export')}
        </Button>
      )}

      {step === 'print' && single && <PrintDevoir devoirId={single.id} hasCompetences={Number(single.nbcompetences) > 0} userId={viewer.userId} onClose={close} />}

      {step === 'duplicate' && single && (
        <Modal id="duplicate-devoir" isOpen size="lg" onModalClose={close}>
          <Modal.Header onModalClose={close}>{t('evaluations.test.duplication.title')}</Modal.Header>
          <Modal.Body>
            <div className="d-flex flex-column gap-12">
              <p className="mb-0">
                {t('evaluations.lightbox.duplication.mid')} <strong>{single.name}</strong>
              </p>
              <Alert type="info">{t('evaluations.lightbox.duplication.top')}</Alert>
              {error && <Alert type="danger">{error}</Alert>}
              <label htmlFor="duplicate-search" className="visually-hidden">
                {t('search.groups')}
              </label>
              <input id="duplicate-search" type="search" className="form-control" placeholder={t('search.groups')} value={search} onChange={(e) => setSearch(e.target.value)} />
              {dup.classes.length > 0 && (
                <fieldset>
                  <legend className="h6">{t('viescolaire.utils.class')}</legend>
                  <div className="row g-8">{dup.classes.map(checkbox)}</div>
                </fieldset>
              )}
              {dup.groupes.length > 0 && (
                <fieldset>
                  <legend className="h6">{t('viescolaire.utils.groupeEnseignement')}</legend>
                  <div className="row g-8">{dup.groupes.map(checkbox)}</div>
                </fieldset>
              )}
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button color="tertiary" variant="ghost" onClick={close}>
              {t('competences.cancel')}
            </Button>
            <Button color="primary" variant="filled" disabled={targets.length === 0 || busy} onClick={duplicate} data-duplicate-confirm>
              {t('evaluations.devoir.confirmation')}
            </Button>
          </Modal.Footer>
        </Modal>
      )}

      {step === 'delete1' && (
        <Modal id="delete-devoir-1" isOpen size="md" onModalClose={close}>
          <Modal.Header onModalClose={close}>{t('evaluations.test.delete')}</Modal.Header>
          <Modal.Body>
            {error && <Alert type="danger">{error}</Alert>}
            {uncancelable.length > 0 && (
              <div data-delete-uncancelable>
                <p>{t('evaluations.devoir.recaputilatif.suppression.uncancelable')} :</p>
                {names(uncancelable)}
              </div>
            )}
            {deletable.length > 0 && (
              <>
                <p>{t('evaluations.devoir.information.suppression')} :</p>
                {names(deletable)}
                <p className="mb-0">{t('evaluations.devoir.confirmation.question')}</p>
              </>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button color="tertiary" variant="ghost" onClick={close}>
              {t('competences.cancel')}
            </Button>
            {deletable.length > 0 && (
              <Button color="danger" variant="filled" disabled={busy} onClick={firstConfirm} data-delete-confirm-1>
                {t('evaluations.devoir.confirmation')}
              </Button>
            )}
          </Modal.Footer>
        </Modal>
      )}

      {step === 'delete2' && message && (
        <Modal id="delete-devoir-2" isOpen size="md" onModalClose={close}>
          <Modal.Header onModalClose={close}>{t('evaluations.devoir.recaputilatif')}</Modal.Header>
          <Modal.Body>
            <p>{t(message.key)}</p>
            {message.listed && evaluated.skills.length > 0 && (
              <>
                <p>{t('evaluations.devoir.recaputilatif.EvaluatedSkills')} :</p>
                {names(evaluated.skills)}
              </>
            )}
            {message.listed && evaluated.marks.length > 0 && (
              <>
                <p>{t('evaluations.devoir.recaputilatif.EvaluatedMarks')} :</p>
                {names(evaluated.marks)}
              </>
            )}
            <p className="mb-0">{t('evaluations.devoir.recaputilatif.suppression.confirmation')}</p>
          </Modal.Body>
          <Modal.Footer>
            <Button color="tertiary" variant="ghost" onClick={close}>
              {t('competences.cancel')}
            </Button>
            <Button color="danger" variant="filled" disabled={busy} onClick={remove} data-delete-confirm-2>
              {t('evaluations.devoir.confirmation')}
            </Button>
          </Modal.Footer>
        </Modal>
      )}
    </div>
  );
}

export default DevoirActions;
