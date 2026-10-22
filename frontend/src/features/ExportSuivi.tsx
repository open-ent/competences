import { Alert, Button, Modal } from '@open-ent/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import * as api from '../api';
import { canExportCsv } from '../rules';
import { recapEvalCsv, tableauMoyennesCsv } from '../releveExport';
import { usePeriodeLabel } from './Filters';
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
 * En CSV : le récapitulatif des niveaux et le tableau des moyennes (moyennes et/ou positionnements,
 * appréciation et avis du conseil).
 */
export function ExportSuivi({
  classe,
  periode,
  eleveId,
  initialKind,
  onClose,
}: {
  classe: Classe;
  periode: PeriodeClasse | null;
  eleveId?: string;
  /** Export proposé d'abord : celui qui correspond à l'onglet affiché. */
  initialKind?: 'recapEval' | 'tabMoys' | 'recapAppreciations';
  onClose: () => void;
}) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const { structureId } = useStructure();
  const data = useStructureData();
  const viewer = useViewer()!;
  // Le CSV n'est proposé qu'à la direction, au professeur principal et au personnel d'éducation
  const csvAllowed = canExportCsv(viewer, classe);
  const [kind, setKind] = useState<Kind>(eleveId ? 'releveComp' : (initialKind ?? 'recapEval'));
  const [text, setText] = useState(false);
  const [csv, setCsv] = useState(false);
  const [tab, setTab] = useState({ moyenneMat: true, positionnementFinal: false, appreciation: false, avisConseil: false, avisOrientation: false });
  const periodeLabel = usePeriodeLabel();
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
      if (kind === 'recapEval' && csv && csvAllowed) {
        const data = await api.getRecapEvalData(structureId, classe.id, idPeriode);
        api.saveBlob(new Blob([recapEvalCsv(data, t)], { type: 'text/csv;charset=UTF-8' }), `positioning_${classe.name}.csv`);
      } else if (kind === 'tabMoys' && csv && csvAllowed) {
        const tableau = await api.getTableauMoyennes(structureId, classe, matieres.map((m) => m.id), idPeriode);
        const teachersOf = (matiereId: string) =>
          [...new Set(data.devoirs.filter((d) => d.id_groupe === classe.id && d.id_matiere === matiereId).map((d) => (d as { teacher?: string }).teacher).filter(Boolean))].join('  ');
        const periodeName = periode ? periodeLabel({ id: periode.id_type, type: periode.type, ordre: periode.ordre }) : t('viescolaire.utils.annee');
        const content = tableau
          ? tableauMoyennesCsv(tableau, matieres, { ...tab, averageFinal: moy.withMoyGeneraleByEleve, statistiques: moy.withMoyMinMaxByMat }, { t, classeName: classe.name, periodeName, teachersOf })
          : null;
        if (!content) throw new api.ExportError('no score');
        api.saveBlob(new Blob([content], { type: 'text/csv;charset=UTF-8' }), `tableau_moyenne_toutes_matieres_${classe.name}_${periodeName}.csv`);
      } else if (kind === 'classeReleve') await api.downloadClasseReleve({ structureId, classe, periode });
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
          {(kind === 'recapEval' || kind === 'tabMoys') && !eleveId && csvAllowed && check('csv', t('competences.react.export.csv'), csv, setCsv)}
          {kind !== 'classeReleve' && !((kind === 'recapEval' || kind === 'tabMoys') && csv) && check('text', t('competences.react.export.text'), text, setText)}
          {kind === 'tabMoys' && csv && (
            <div className="d-flex flex-column gap-4">
              {check('tab-moyenne', t('average'), tab.moyenneMat, (v) => setTab((x) => ({ ...x, moyenneMat: v || !x.positionnementFinal })))}
              {check('tab-positionnement', t('evaluations.releve.positionnement').trim(), tab.positionnementFinal, (v) => setTab((x) => ({ ...x, positionnementFinal: v || !x.moyenneMat })))}
              {check('tab-avis-conseil', t('evaluations.evaluation.avis.conseil'), tab.avisConseil, (v) => setTab((x) => ({ ...x, avisConseil: v })))}
              {check('tab-avis-orientation', t('evaluations.evaluation.avis.orientation'), tab.avisOrientation, (v) => setTab((x) => ({ ...x, avisOrientation: v })))}
              {check('tab-synthese', t('evaluations.synthese.acquis.bilan.periodique'), tab.appreciation, (v) => setTab((x) => ({ ...x, appreciation: v })))}
            </div>
          )}
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
