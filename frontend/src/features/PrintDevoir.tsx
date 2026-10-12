import { Alert, Button, Modal } from '@open-ent/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import * as api from '../api';

type FileType = 'cartouche' | 'formSaisie' | 'devoir';

/** Message d'un export refusé (`errorResultExportDevoir`). */
function errorKey(message: string): string {
  if (message.includes('empty result')) return 'evaluations.export.empty';
  if (message.includes('no level')) return 'evaluations.export.errorLevel';
  if (message.includes('can not get students')) return 'competences.react.print.no.student';
  return 'evaluations.export.err';
}

/**
 * Impression d'une évaluation (`display_notes_devoir.html`) : cartouches à coller sur les copies,
 * grille de saisie, ou export de l'évaluation avec ses résultats.
 */
export function PrintDevoir({ devoirId, hasCompetences, userId, onClose }: { devoirId: number; hasCompetences: boolean; userId: string; onClose: () => void }) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const [fileType, setFileType] = useState<FileType>('formSaisie');
  const [o, setO] = useState<api.CartoucheOptions>({ byEleve: false, inColor: false, nbr: 1, image: false, withResult: false, withAppreciations: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<api.CartoucheOptions>) => setO((v) => ({ ...v, ...patch }));

  const print = async () => {
    setBusy(true);
    setError(null);
    try {
      if (fileType === 'formSaisie') await api.downloadExport(api.devoirPrintUrl.formSaisie(devoirId), { fallbackName: 'grille-de-saisie.pdf' });
      else {
        const usePerso = await api.getUsePerso(userId);
        const url = fileType === 'cartouche' ? api.devoirPrintUrl.cartouche(devoirId, o, usePerso) : api.devoirPrintUrl.devoir(devoirId, !o.inColor, usePerso);
        await api.downloadExport(url, { check: true, fallbackName: fileType === 'cartouche' ? 'cartouches.pdf' : 'evaluation.pdf' });
      }
      onClose();
    } catch (e) {
      setError(t(errorKey(e instanceof api.ExportError ? e.message : '')));
    } finally {
      setBusy(false);
    }
  };

  const check = (id: string, label: string, checked: boolean, onChange: (v: boolean) => void, disabled = false) => (
    <div className="form-check">
      <input id={`print-${id}`} type="checkbox" className="form-check-input" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={`print-${id}`} className="form-check-label">
        {t(label)}
      </label>
    </div>
  );

  return (
    <Modal id="print-devoir" isOpen size="md" onModalClose={onClose}>
      <Modal.Header onModalClose={onClose}>{t('competences.react.print')}</Modal.Header>
      <Modal.Body>
        <div className="d-flex flex-column gap-12">
          {error && <Alert type="warning">{error}</Alert>}
          <fieldset>
            <legend className="visually-hidden">{t('competences.react.print')}</legend>
            {(
              [
                ['cartouche', 'evaluation.devoir.print.cartouches'],
                ['formSaisie', 'evaluation.devoir.print.form.saisie'],
                ['devoir', 'evaluations.devoir.print'],
              ] as const
            ).map(([value, label]) => (
              <div key={value} className="form-check">
                <input
                  id={`print-type-${value}`}
                  type="radio"
                  name="print-type"
                  className="form-check-input"
                  checked={fileType === value}
                  onChange={() => {
                    setFileType(value);
                    setError(null);
                  }}
                />
                <label htmlFor={`print-type-${value}`} className="form-check-label">
                  {t(label)}
                </label>
              </div>
            ))}
          </fieldset>
          {fileType === 'cartouche' && (
            <div className="d-flex flex-column gap-4 ms-16">
              {/* Une image par cartouche et une cartouche par élève s'excluent. */}
              {check('image', 'evaluations.export.image', o.image, (v) => set({ image: v, byEleve: false }))}
              {check('eleve', 'evaluation.devoir.cartouche.eleve', o.byEleve, (v) => set({ byEleve: v }), o.image)}
              {o.byEleve && (
                <div className="ms-16">
                  {check('results', 'evaluation.devoir.cartouche.results', o.withResult, (v) => set({ withResult: v }))}
                  {o.withResult && check('appreciations', 'evaluation.devoir.cartouche.appreciation', o.withAppreciations, (v) => set({ withAppreciations: v }))}
                </div>
              )}
              {check('couleur', 'evaluation.devoir.cartouche.couleur', o.inColor, (v) => set({ inColor: v }))}
              <div className="d-flex align-items-center gap-8">
                <label htmlFor="print-nbr" className="form-label mb-0">
                  {t('evaluation.devoir.cartouche.number')}
                </label>
                <input
                  id="print-nbr"
                  type="number"
                  min={1}
                  max={80}
                  className="form-control form-control-sm"
                  style={{ width: 90 }}
                  value={o.nbr}
                  disabled={o.byEleve || o.image}
                  onChange={(e) => set({ nbr: Math.min(80, Math.max(1, Number(e.target.value) || 1)) })}
                />
              </div>
            </div>
          )}
          {fileType === 'devoir' && hasCompetences && <div className="ms-16">{check('couleur-devoir', 'evaluation.devoir.cartouche.couleur', o.inColor, (v) => set({ inColor: v }))}</div>}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button color="tertiary" variant="ghost" onClick={onClose}>
          {t('competences.react.cancel')}
        </Button>
        <Button color="primary" variant="filled" isLoading={busy} onClick={print}>
          {t('evaluations.export.format.pdf')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
