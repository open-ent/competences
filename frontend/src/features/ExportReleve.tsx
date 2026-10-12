import { Alert, Button, Modal } from '@open-ent/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import * as api from '../api';
import { csvOnly, defaultReleveExportOptions, releveCsv, ReleveExportData, releveExportBody, ReleveExportOptions } from '../releveExport';
import { useStructure } from '../structure';
import type { Annotation, Classe, Matiere, PeriodeClasse } from '../types';

type Flag = 'averageAuto' | 'averageFinal' | 'positionnementFinal' | 'appreciation' | 'moyenneClasse' | 'appreciationClasse' | 'withNotes' | 'previousAverages' | 'previousAppreciations';

const FLAGS: Array<{ key: Flag; label: string; csv?: boolean }> = [
  { key: 'averageAuto', label: 'average.auto' },
  { key: 'averageFinal', label: 'average.final' },
  { key: 'positionnementFinal', label: 'evaluations.releve.positionnement' },
  { key: 'appreciation', label: 'viescolaire.utils.appreciations' },
  { key: 'moyenneClasse', label: 'average.class' },
  { key: 'appreciationClasse', label: 'evaluations.releve.appreciation.classe' },
  { key: 'withNotes', label: 'competences.react.releve.export.notes', csv: true },
  { key: 'previousAverages', label: 'competences.react.releve.export.previous.averages', csv: true },
  { key: 'previousAppreciations', label: 'competences.react.releve.export.previous.appreciations', csv: true },
];

/**
 * Export du relevé périodique d'une classe dans une matière (`ReleveNote.export`) : PDF produit par
 * le serveur, ou CSV ; les notes de chaque évaluation et les périodes précédentes n'existent qu'en
 * CSV.
 */
export function ExportReleve({
  classe,
  matiere,
  periode,
  periodes,
  devoirs,
  annotations,
  onClose,
}: {
  classe: Classe;
  matiere: Matiere;
  periode: PeriodeClasse;
  periodes: PeriodeClasse[];
  devoirs: Array<{ id: number; name: string }>;
  annotations: Annotation[];
  onClose: () => void;
}) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const { structureId } = useStructure();
  const sousMatieres = (matiere.sousMatieres ?? []).map((s) => ({ id_type_sousmatiere: Number(s.id_type_sousmatiere), libelle: s.libelle }));
  const [o, setO] = useState<ReleveExportOptions>(() => defaultReleveExportOptions(sousMatieres.map((s) => s.id_type_sousmatiere)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const set = (patch: Partial<ReleveExportOptions>) => setO((v) => ({ ...v, ...patch }));
  const fileType = csvOnly(o) ? 'csv' : o.fileType;

  const run = async () => {
    setBusy(true);
    setError(false);
    try {
      const options = { ...o, fileType } as ReleveExportOptions;
      const body = releveExportBody(options, {
        idMatiere: matiere.id,
        idClasse: classe.id,
        idEtablissement: structureId,
        idPeriode: periode.id_type,
        typeClasse: classe.type_groupe,
        classeName: classe.name,
        matiere: matiere.name,
      });
      const result = await api.exportReleve(body);
      const name = `releve_periodique_${classe.name}_${matiere.name}_${periode.id_type}`;
      if (result instanceof Blob) api.saveBlob(result, `${name}.pdf`);
      else {
        const csv = releveCsv(options, result as ReleveExportData, {
          t,
          devoirs,
          annotationOf: (id) => annotations.find((a) => a.id === id)?.libelle_court ?? '',
          sousMatieres,
          previous: periodes.filter((p) => p.id !== null && p.id_type < periode.id_type),
        });
        api.saveBlob(new Blob([csv], { type: 'text/csv;charset=UTF-8' }), `${name}.csv`);
      }
      onClose();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const check = (id: string, label: string, checked: boolean, onChange: (v: boolean) => void) => (
    <div key={id} className="form-check">
      <input id={`releve-export-${id}`} type="checkbox" className="form-check-input" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={`releve-export-${id}`} className="form-check-label">
        {label}
      </label>
    </div>
  );

  return (
    <Modal id="export-releve" isOpen size="md" onModalClose={onClose}>
      <Modal.Header onModalClose={onClose}>{t('evaluations.export.file')}</Modal.Header>
      <Modal.Body>
        <div className="d-flex flex-column gap-12">
          {error && <Alert type="danger">{t('evaluations.export.err')}</Alert>}
          <fieldset>
            <legend className="h6">{t('competences.react.releve.export.format')}</legend>
            {(['pdf', 'csv'] as const).map((f) => (
              <div key={f} className="form-check form-check-inline">
                <input
                  id={`releve-export-${f}`}
                  type="radio"
                  name="releve-export-format"
                  className="form-check-input"
                  checked={fileType === f}
                  disabled={f === 'pdf' && csvOnly(o)}
                  onChange={() => set({ fileType: f })}
                />
                <label htmlFor={`releve-export-${f}`} className="form-check-label">
                  {f.toUpperCase()}
                </label>
              </div>
            ))}
          </fieldset>
          <fieldset className="d-flex flex-column gap-4">
            <legend className="h6">{t('viescolaire.utils.options')}</legend>
            {FLAGS.map((f) => check(f.key, `${t(f.label).trim()}${f.csv ? ' (CSV)' : ''}`, o[f.key], (v) => set({ [f.key]: v } as Partial<ReleveExportOptions>)))}
            {sousMatieres.map((s) =>
              check(`sm-moy-${s.id_type_sousmatiere}`, `${t('average')} ${s.libelle}`, !!o.sousMatieres.moyennes[s.id_type_sousmatiere], (v) =>
                set({ sousMatieres: { ...o.sousMatieres, moyennes: { ...o.sousMatieres.moyennes, [s.id_type_sousmatiere]: v } } }),
              ),
            )}
            {sousMatieres.map((s) =>
              check(
                `sm-pos-${s.id_type_sousmatiere}`,
                `${t('evaluations.releve.positionnement')} ${s.libelle}`,
                !!o.sousMatieres.positionnements_auto[s.id_type_sousmatiere],
                (v) => set({ sousMatieres: { ...o.sousMatieres, positionnements_auto: { ...o.sousMatieres.positionnements_auto, [s.id_type_sousmatiere]: v } } }),
              ),
            )}
          </fieldset>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button color="tertiary" variant="ghost" onClick={onClose}>
          {t('competences.react.cancel')}
        </Button>
        <Button color="primary" variant="filled" isLoading={busy} onClick={run}>
          {t('evaluations.export')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
