import { Alert, Button, LoadingScreen } from '@open-ent/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import * as api from '../api';
import { bfcAction, BfcLigne, bfcLignes, isVisible } from '../bfc';
import { isChefEtabOrHeadTeacher } from '../rules';
import { levelsForCycle } from '../saisie';
import { useStructure, useViewer } from '../structure';
import type { Classe } from '../types';
import { EnseignementComplement } from './EnseignementComplement';
import { AppreciationInput } from './SaisieInputs';

/** Synthèse du bilan de fin de cycle : 1 500 caractères (`MAX_LENGTH_1500`). */
const MAX_1500 = 1500;

/**
 * Bilan de fin de cycle d'un élève (`content_vue_bilan_fin_cycle.html`) : pour chaque composante
 * du socle, le niveau calculé sur le cycle — avec sa moyenne si l'établissement l'affiche — et le
 * niveau retenu, que la direction et le professeur principal peuvent fixer ; dispense d'un
 * domaine, points du contrôle continu du brevet (cycle 4), synthèse, exports PDF.
 *
 * Au cycle 4, l'enseignement de complément de l'élève (et sa langue régionale), qui compte au brevet.
 */
export function BilanFinCycle({ classe, eleveId }: { classe: Classe; eleveId: string }) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const queryClient = useQueryClient();
  const { structureId, rights } = useStructure();
  const viewer = useViewer()!;
  const [error, setError] = useState(false);
  const idCycle = classe.id_cycle;
  const enabled = idCycle != null;
  const k = (name: string) => ['competences', structureId, 'bfc', name, eleveId, idCycle];

  const domainesQuery = useQuery({
    queryKey: ['competences', 'domaines-eleve', classe.id, eleveId, idCycle],
    queryFn: () => api.getDomainesEleve(classe.id, eleveId, idCycle!),
    enabled,
  });
  const notesQuery = useQuery({ queryKey: k('notes'), queryFn: () => api.getCompetenceNotesEleve(eleveId, idCycle!, null, true), enabled });
  const fixesQuery = useQuery({ queryKey: k('valeurs'), queryFn: () => api.getBfcValeurs(structureId, eleveId, idCycle!), enabled });
  const conversionQuery = useQuery({
    queryKey: ['competences', structureId, 'conversion', classe.id],
    queryFn: () => api.getConversionTable(structureId, classe.id),
  });
  const averageQuery = useQuery({ queryKey: ['competences', structureId, 'skill-average'], queryFn: () => api.getSkillAverageOption(structureId) });
  const moyenneVisibleQuery = useQuery({ queryKey: ['competences', structureId, 'bfc-visibility', 1], queryFn: () => api.getBfcVisibility(structureId, 1) });
  const baremeVisibleQuery = useQuery({ queryKey: ['competences', structureId, 'bfc-visibility', 2], queryFn: () => api.getBfcVisibility(structureId, 2) });
  const baremeQuery = useQuery({
    queryKey: k('bareme'),
    queryFn: () => api.getBaremeBrevet(structureId, classe.id, eleveId, idCycle!),
    enabled: enabled && idCycle === 1,
  });
  const syntheseQuery = useQuery({ queryKey: k('synthese'), queryFn: () => api.getBfcSynthese(eleveId, idCycle!), enabled });
  const levelsQuery = useQuery({ queryKey: ['competences', structureId, 'maitrise'], queryFn: () => api.getMaitriseLevels(structureId) });

  if (!enabled) return <Alert type="info">{t('competences.react.bfc.no.cycle')}</Alert>;
  const all = [domainesQuery, notesQuery, fixesQuery, conversionQuery, averageQuery, syntheseQuery, levelsQuery];
  if (all.some((q) => q.isLoading)) return <LoadingScreen position={false} />;
  if (all.some((q) => q.isError)) return <Alert type="danger">{t('competences.react.loading.error')}</Alert>;

  const table = conversionQuery.data ?? [];
  const chef = isChefEtabOrHeadTeacher(viewer, classe);
  const lignes = bfcLignes({
    domaines: domainesQuery.data ?? [],
    evaluations: notesQuery.data ?? [],
    table,
    average: !!averageQuery.data,
    fixes: fixesQuery.data ?? [],
  });
  const showMoyenne = isVisible(moyenneVisibleQuery.data, chef);
  const showBareme = idCycle === 1 && isVisible(baremeVisibleQuery.data, chef) && !!baremeQuery.data;
  // Couleur d'un niveau : celle de l'échelle de maîtrise de l'établissement pour ce cycle.
  const levels = levelsForCycle(levelsQuery.data ?? [], idCycle);
  const colorOf = (ordre: number) => levels.find((l) => l.ordre === ordre)?.couleur;
  const libelleOf = (ordre: number) => (ordre === -1 ? t('evaluations.competence.unevaluated') : (table.find((c) => c.ordre === ordre)?.libelle ?? String(ordre)));

  const run = async (write: () => Promise<unknown>, keys: unknown[][]) => {
    try {
      setError(false);
      await write();
    } catch {
      setError(true);
    } finally {
      await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    }
  };
  const setNiveau = (ligne: BfcLigne, niveau: number) => {
    const action = bfcAction(ligne, niveau);
    if (action.kind === 'none') return;
    void run(
      () =>
        action.kind === 'delete'
          ? api.deleteBfcValeur(ligne.domaine.id, eleveId)
          : api.saveBfcValeur({
              id: ligne.fixe?.id,
              id_domaine: ligne.domaine.id,
              id_eleve: eleveId,
              id_etablissement: structureId,
              owner: viewer.userId,
              valeur: action.valeur,
            }),
      [k('valeurs'), k('bareme')],
    );
  };

  return (
    <section className="card p-16 d-flex flex-column gap-12">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-12">
        <h3 className="h5 mb-0">{t('evaluations.bilan.fin.cycle.title')}</h3>
        <div className="d-flex gap-8">
          <a className="btn btn-sm btn-outline-primary" href={api.bfcPdfUrl({ structureId, idCycle, eleveId })} title={t('evaluation.bfc.export.button.eleve')}>
            {t('competences.react.bfc.pdf.eleve')}
          </a>
          <a className="btn btn-sm btn-outline-primary" href={api.bfcPdfUrl({ structureId, idCycle, classeId: classe.id })} title={t('evaluation.bfc.export.button.classe')}>
            {t('competences.react.bfc.pdf.classe')}
          </a>
        </div>
      </div>
      {error && <Alert type="danger">{t('competences.react.saisie.save.error')}</Alert>}
      {table.length === 0 && <Alert type="warning">{t('competences.react.suivi.no.conversion')}</Alert>}

      <div className="table-responsive">
        <table className="table align-middle mb-0">
          <thead>
            <tr>
              <th scope="col">{t('competences.react.bfc.domaine')}</th>
              {showMoyenne && <th scope="col">{t('competences.react.bfc.calcule')}</th>}
              <th scope="col">{t('competences.react.bfc.retenu')}</th>
              {rights.createDispenseDomaineEleve && <th scope="col" />}
            </tr>
          </thead>
          <tbody>
            {lignes.map((ligne) => {
              const d = ligne.domaine;
              const dispense = !!d.dispense_eleve;
              const label = `${d.codification} - ${d.libelle}`;
              return (
                <tr key={d.id} className={dispense ? 'text-muted' : undefined}>
                  <th scope="row" className="fw-normal">
                    {label}
                  </th>
                  {showMoyenne && (
                    <td className="small">
                      {ligne.moyenne === -1 ? t('evaluations.competence.unevaluated') : `${libelleOf(ligne.calcule)} (${ligne.moyenne.toFixed(1).replace('.', ',')})`}
                    </td>
                  )}
                  <td>
                    <div className="d-flex align-items-center gap-8">
                      <span
                        className="d-inline-block rounded-circle flex-shrink-0"
                        style={{ width: 14, height: 14, background: ligne.retenu > 0 ? colorOf(ligne.retenu) : 'transparent', border: '1px solid currentColor', opacity: ligne.retenu > 0 ? 1 : 0.3 }}
                      />
                      {chef && !dispense ? (
                        <select
                          className="form-select form-select-sm"
                          aria-label={`${t('competences.react.bfc.retenu')} ${label}`}
                          value={ligne.retenu}
                          onChange={(e) => setNiveau(ligne, Number(e.target.value))}
                        >
                          {ligne.calcule === -1 && <option value={-1}>{t('evaluations.competence.unevaluated')}</option>}
                          {[...table]
                            .sort((a, b) => a.ordre - b.ordre)
                            .map((c) => (
                              <option key={c.ordre} value={c.ordre}>
                                {c.libelle}
                                {c.ordre === ligne.calcule ? ` — ${t('competences.react.bfc.calcule').toLowerCase()}` : ''}
                              </option>
                            ))}
                        </select>
                      ) : (
                        <span>{libelleOf(ligne.retenu)}</span>
                      )}
                      {ligne.fixe && <span className="badge bg-secondary-subtle text-body">{t('competences.react.bfc.fixe')}</span>}
                    </div>
                  </td>
                  {rights.createDispenseDomaineEleve && (
                    <td className="text-end">
                      {d.dispensable && (
                        <Button
                          type="button"
                          size="sm"
                          color="secondary"
                          variant="outline"
                          onClick={() => run(() => api.setDispenseDomaine(structureId, d.id, eleveId, !dispense), [['competences', 'domaines-eleve', classe.id, eleveId, idCycle]])}
                        >
                          {t(dispense ? 'evaluation.not.dispense.eleve' : 'evaluation.dispense.eleve')}
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showBareme && (
        <p className="text-end fw-bold mb-0">
          {t('evaluation.bfc.controle.continu')} {baremeQuery.data!.controlesContinus_brevet} / {baremeQuery.data!.totalMaxBaremeBrevet}
        </p>
      )}

      {idCycle === 1 && <EnseignementComplement eleveId={eleveId} idCycle={idCycle} showBareme={isVisible(baremeVisibleQuery.data, chef)} />}

      <div>
        <h4 className="h6">{t('evaluations.bilan.fin.cycle.tilte.synthese')}</h4>
        <AppreciationInput
          label={t('evaluations.bilan.fin.cycle.tilte.synthese')}
          value={syntheseQuery.data?.texte ?? ''}
          disabled={!(rights.canUpdateBFCSynthese || chef)}
          multiline
          maxLength={MAX_1500}
          onCommit={async (value) => {
            if (value === (syntheseQuery.data?.texte ?? '')) return;
            await run(() => api.saveBfcSynthese(syntheseQuery.data ?? {}, eleveId, idCycle, value), [k('synthese')]);
          }}
        />
      </div>
    </section>
  );
}
