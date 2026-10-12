import { Alert, Button, Modal } from '@open-ent/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import * as api from '../api';
import type { Devoir } from '../types';

/**
 * Import des notes d'une évaluation depuis un fichier CSV d'Exercices (`import-note.directive.ts`).
 * Les élèves non reconnus sont signalés : les autres notes sont tout de même importées.
 */
export function ImportNotes({ devoir, onClose, onImported }: { devoir: Devoir; onClose: () => void; onImported: () => void }) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  const valid = async () => {
    if (missing) {
      onImported();
      onClose();
      return;
    }
    if (!file || !file.name.trim().toLowerCase().endsWith('.csv')) {
      setError('competences.error.import.type.csv');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await api.importNotesCsv(devoir, file);
    setBusy(false);
    if (result.kind === 'ok') {
      onImported();
      onClose();
    } else if (result.kind === 'missing') setMissing(true);
    else setError(result.kind === 'formate' ? 'competences.error.import.csv.formate' : 'competences.error.import.csv');
  };

  return (
    <Modal id="import-notes" isOpen size="md" onModalClose={onClose}>
      <Modal.Header onModalClose={onClose}>{t('competences.import.notes.title')}</Modal.Header>
      <Modal.Body>
        {missing ? (
          <Alert type="warning">{t('competences.import.notes.warning')}</Alert>
        ) : (
          <div className="d-flex flex-column gap-12">
            <p className="mb-0">{t('competences.import.notes.file.csv')}</p>
            <p className="mb-0">
              {t('competences.import.notes.description.divisor.part.one')}
              <strong>{devoir.diviseur}</strong>
              {t('competences.import.notes.description.divisor.part.two')}
            </p>
            <input
              type="file"
              accept=".csv,text/csv"
              className="form-control"
              aria-label={t('evaluations.import.format.csv')}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError(null);
              }}
            />
            {error && <Alert type="warning">{t(error)}</Alert>}
            <a href="/competences/public/import/skeletonExercizer.csv" download>
              {t('competences.react.import.example')}
            </a>
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        {!missing && (
          <Button color="tertiary" variant="ghost" onClick={onClose}>
            {t('competences.react.cancel')}
          </Button>
        )}
        <Button color="primary" variant="filled" isLoading={busy} disabled={!missing && (!file || !!error)} onClick={valid}>
          {t('competences.valid')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
