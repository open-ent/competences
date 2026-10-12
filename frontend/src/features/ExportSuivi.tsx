import { Alert, Button, Modal } from '@open-ent/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import * as api from '../api';
import { useStructure, useStructureData, useViewer } from '../structure';
import type { Classe, PeriodeClasse } from '../types';

type Kind = 'recapEval' | 'releveComp' | 'tabMoys' | 'recapAppreciations' | 'classeReleve';

const KINDS: Array<{ kind: Kind; label: string }> = [
  { kind: 'recapEval', label: 'evaluations.recapEval' },
  { kind: 'releveComp', label: 'evaluations.releveComp.classe' },
  { kind: 'tabMoys', label: 'evaluations.tab.moys' },
  { kind: 'recapAppreciations', label: 'evaluations.recapAppreciations.classe' },
  { kind: 'classeReleve', label: 'evaluation.releve.classe' },
];

/**
 * Exports PDF du suivi (`suivi_competences_classe/content.html`, `exportRecapEval`,
 * `exportReleveComp`). Pour une classe : récapitulatif des niveaux par domaine, relevé de
 * compétences, tableau des moyennes, appréciations des professeurs, relevé de notes. Pour un
 * élève (`eleveId`) : son relevé de compétences.
 *
 * Pas encore portés : les exports CSV et le tableau des moyennes composé dans le navigateur.
 */
export function ExportSuivi({ classe, periode, eleveId, onClose }: { classe: Classe; periode: PeriodeClasse | null; eleveId?: string; onClose: () => void }) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const { structureId } = useStructure();
  const data = useStructureData();
  const viewer = useViewer()!;
  const [kind, setKind] = useState<Kind>(eleveId ? 'releveComp' : 'recapEval');
  const [text, setText] = useState(false);
  const [byEnseignement, setByEnseignement] = useState(false);
  const [moy, setMoy] = useState({ withMoyGeneraleByEleve: true, withMoyMinMaxByMat: true, withAppreciations: false });
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idPeriode = periode?.id_type ?? null;
  const matieres = [...data.matieres].sort((a, b) => a.name.localeCompare(b.name));

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const usePerso = await api.getUsePerso(viewer.userId);
      const fallbackName = `${kind}-${classe.name}.pdf`;
      if (kind === 'classeReleve') await api.downloadClasseReleve({ structureId, classe, periode });
      else {
        const url =
          kind === 'recapEval'
            ? api.suiviExportUrl.recapEval({ structureId, classeId: classe.id, text, usePerso, idPeriode })
            : kind === 'recapAppreciations'
              ? api.suiviExportUrl.recapAppreciations({ structureId, classeId: classe.id, text, idPeriode })
              : kind === 'tabMoys'
                ? api.suiviExportUrl.tabMoys({ structureId, classe, text, idPeriode, ...moy })
                : api.suiviExportUrl.releveComp({
                    structureId,
                    text,
                    usePerso,
                    matiereIds: matieres.filter((m) => !excluded.has(m.id)).map((m) => m.id),
                    idPeriode,
                    byEnseignement,
                    eleveId,
                    classeId: eleveId ? undefined : classe.id,
                  });
        // Le tableau des moyennes ne connaît pas la demande « à blanc » : son refus arrive avec le fichier.
        await api.downloadExport(url, { check: kind !== 'tabMoys', fallbackName });
      }
      onClose();
    } catch (e) {
      setError(t(api.exportErrorKey(e instanceof api.ExportError ? e.message : '')));
    } finally {
      setBusy(false);
    }
  };

  const check = (id: string, label: string, checked: boolean, onChange: (v: boolean) => void) => (
    <div className="form-check">
      <input id={`export-${id}`} type="checkbox" className="form-check-input" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={`export-${id}`} className="form-check-label">
        {label}
      </label>
    </div>
  );

  return (
    <Modal id="export-suivi" isOpen size="lg" onModalClose={onClose}>
      <Modal.Header onModalClose={onClose}>{t('evaluations.export.file')}</Modal.Header>
      <Modal.Body>
        <div className="d-flex flex-column gap-12">
          {error && <Alert type="warning">{error}</Alert>}
          {!eleveId && (
            <fieldset>
              <legend className="h6">{t('evaluations.export.format.pdf')}</legend>
              {KINDS.map((k) => (
                <div key={k.kind} className="form-check">
                  <input
                    id={`export-kind-${k.kind}`}
                    type="radio"
                    name="export-kind"
                    className="form-check-input"
                    checked={kind === k.kind}
                    onChange={() => {
                      setKind(k.kind);
                      setError(null);
                    }}
                  />
                  <label htmlFor={`export-kind-${k.kind}`} className="form-check-label">
                    {t(k.label)}
                  </label>
                </div>
              ))}
            </fieldset>
          )}
          {kind !== 'classeReleve' && check('text', t('competences.react.export.text'), text, setText)}
          {kind === 'tabMoys' && (
            <div className="d-flex flex-column gap-4">
              {check('moy-generale', t('competences.react.export.moy.generale'), moy.withMoyGeneraleByEleve, (v) => setMoy((m) => ({ ...m, withMoyGeneraleByEleve: v })))}
              {check('moy-minmax', t('competences.react.export.moy.minmax'), moy.withMoyMinMaxByMat, (v) => setMoy((m) => ({ ...m, withMoyMinMaxByMat: v })))}
              {check('moy-appreciations', t('viescolaire.utils.appreciation'), moy.withAppreciations, (v) => setMoy((m) => ({ ...m, withAppreciations: v })))}
            </div>
          )}
          {kind === 'releveComp' && (
            <>
              <fieldset>
                <legend className="h6">{t('viescolaire.utils.export.choose')}</legend>
                {(
                  [
                    [false, 'viescolaire.utils.export.choose.domaine'],
                    [true, 'viescolaire.utils.export.choose.enseignement'],
                  ] as const
                ).map(([value, label]) => (
                  <div key={String(value)} className="form-check">
                    <input
                      id={`export-by-${value}`}
                      type="radio"
                      name="export-by"
                      className="form-check-input"
                      checked={byEnseignement === value}
                      onChange={() => setByEnseignement(value)}
                    />
                    <label htmlFor={`export-by-${value}`} className="form-check-label">
                      {t(label)}
                    </label>
                  </div>
                ))}
              </fieldset>
              <fieldset>
                <legend className="h6">{t('matieres')}</legend>
                <div className="d-flex flex-wrap gap-12">
                  {matieres.map((m) =>
                    check(`matiere-${m.id}`, m.name, !excluded.has(m.id), (v) =>
                      setExcluded((s) => {
                        const next = new Set(s);
                        if (v) next.delete(m.id);
                        else next.add(m.id);
                        return next;
                      }),
                    ),
                  )}
                </div>
              </fieldset>
            </>
          )}
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
