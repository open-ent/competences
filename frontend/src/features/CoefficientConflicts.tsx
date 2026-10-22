import { Button, Modal } from '@open-ent/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { CoefficientConflict } from '../conseil';

/**
 * Bandeau d'alerte et fenêtre de détail des matières ayant plusieurs coefficients (comme l'AngularJS) : tant que le
 * conflit existe, les moyennes calculées ne sont pas fiables, l'administrateur doit corriger le paramétrage des services.
 */
export function CoefficientConflicts({ conflicts }: { conflicts: CoefficientConflict[] }) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const [open, setOpen] = useState(false);
  if (conflicts.length === 0) return null;
  return (
    <div data-coefficient-conflict>
      <div className="alert alert-warning d-flex justify-content-between align-items-center gap-12 mb-0" role="alert">
        <span>{t('evaluations.coefficient.conflict.warning')}</span>
        <Button color="tertiary" variant="outline" onClick={() => setOpen(true)} data-conflict-details>
          {t('show.details')}
        </Button>
      </div>
      {open && (
        <Modal id="coefficient-conflict" isOpen onModalClose={() => setOpen(false)} size="md">
          <Modal.Header onModalClose={() => setOpen(false)}>{t('evaluations.coefficient.conflict.list')}</Modal.Header>
          <Modal.Body>
            <p>{t('evaluations.coefficient.conflict.info')}</p>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('viescolaire.utils.subject')}</th>
                  <th className="text-center">{t('evaluations.test.coefficient')}</th>
                </tr>
              </thead>
              <tbody>
                {conflicts.flatMap((c) =>
                  c.entries.map((e) => (
                    <tr key={`${c.libelle}-${e.coefficient}`} data-conflict-row>
                      <td>
                        <strong>{e.libelle}</strong>
                        {e.teachers.map((name) => (
                          <div key={name}>{name}</div>
                        ))}
                      </td>
                      <td className="text-center">{e.coefficient}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </Modal.Body>
          <Modal.Footer>
            <Button color="primary" variant="filled" onClick={() => setOpen(false)}>
              {t('competences.react.close')}
            </Button>
          </Modal.Footer>
        </Modal>
      )}
    </div>
  );
}

export default CoefficientConflicts;
