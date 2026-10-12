import { Alert, LoadingScreen } from '@open-ent/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import * as api from '../api';
import { choisirEnseignement, choisirLangue, EleveEnsCpl, NIVEAUX_LCR } from '../bfc';
import { useStructure } from '../structure';

/**
 * Enseignement de complément de l'élève au bilan de fin de cycle (`left_side_ens_cplt.html`) :
 * l'enseignement et son niveau, et pour une langue et culture régionale, la langue et son niveau ;
 * les points du brevet que le niveau apporte, si l'établissement affiche le barème.
 */
export function EnseignementComplement({ eleveId, idCycle, showBareme }: { eleveId: string; idCycle: number; showBareme: boolean }) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const queryClient = useQueryClient();
  const { structureId, rights } = useStructure();
  const ensId = useId();
  const niveauId = useId();
  const langueId = useId();
  const niveauLcrId = useId();
  const [error, setError] = useState(false);
  const key = ['competences', structureId, 'bfc', 'ens-cpl', eleveId, idCycle];
  const ensQuery = useQuery({ queryKey: ['competences', structureId, 'ens-cpls'], queryFn: () => api.getEnsCpls(structureId) });
  const niveauxQuery = useQuery({ queryKey: ['competences', structureId, 'niveaux-ens-cpl'], queryFn: () => api.getNiveauxEnsCpl(structureId) });
  const languesQuery = useQuery({ queryKey: ['competences', structureId, 'langues-regionales'], queryFn: () => api.getLanguesRegionales(structureId) });
  const eleveQuery = useQuery({ queryKey: key, queryFn: () => api.getEleveEnsCpl(eleveId, idCycle) });

  if ([ensQuery, niveauxQuery, languesQuery, eleveQuery].some((q) => q.isLoading)) return <LoadingScreen position={false} />;
  const enseignements = ensQuery.data ?? [];
  if (enseignements.length === 0) return <Alert type="info">{t('competences.react.enscpl.none')}</Alert>;

  const niveaux = niveauxQuery.data ?? [];
  const langues = languesQuery.data ?? [];
  const current = eleveQuery.data ?? {};
  const ens = enseignements.find((e) => e.id === current.id_enscpl);
  const niveau = niveaux.find((n) => n.id === current.id_niveau);
  const langue = langues.find((l) => l.id === current.id_langue);
  const editable = rights.canUpdateNiveauEnsCpl;
  const byLibelle = <T extends { libelle: string }>(list: T[]) => [...list].sort((a, b) => a.libelle.localeCompare(b.libelle));

  const save = async (next: EleveEnsCpl) => {
    try {
      setError(false);
      await api.saveEleveEnsCpl(current.id, eleveId, idCycle, next);
    } catch {
      setError(true);
    } finally {
      await queryClient.invalidateQueries({ queryKey: key });
    }
  };

  return (
    <section className="d-flex flex-column gap-8">
      <h4 className="h6 mb-0">{t('viescolaire.utils.enseignementComplement')}</h4>
      {error && <Alert type="danger">{t('competences.react.saisie.save.error')}</Alert>}
      <div className="row g-8 align-items-end">
        <div className="col-12 col-md-6">
          <label htmlFor={ensId} className="form-label small">
            {t('viescolaire.utils.enseignements')}
          </label>
          <select
            id={ensId}
            className="form-select form-select-sm"
            value={ens?.id ?? ''}
            disabled={!editable}
            onChange={(e) => {
              const chosen = enseignements.find((x) => x.id === Number(e.target.value));
              if (chosen) void save(choisirEnseignement(chosen, niveaux, langues));
            }}
          >
            {!ens && <option value="">—</option>}
            {byLibelle(enseignements).map((x) => (
              <option key={x.id} value={x.id}>
                {x.libelle}
              </option>
            ))}
          </select>
        </div>
        {ens && ens.code !== 'AUC' && (
          <div className="col-12 col-md-6">
            <label htmlFor={niveauId} className="form-label small">
              {t('level')}
            </label>
            <select
              id={niveauId}
              className="form-select form-select-sm"
              value={niveau?.id ?? ''}
              disabled={!editable}
              onChange={(e) => save({ ...current, id_niveau: Number(e.target.value) })}
            >
              {niveaux
                .filter((n) => n.niveau > 0)
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.libelle}
                  </option>
                ))}
            </select>
          </div>
        )}
        {ens?.code === 'LCR' && (
          <>
            <div className="col-12 col-md-6">
              <label htmlFor={langueId} className="form-label small">
                {t('viescolaire.utils.langues.culture.regionale.choix')}
              </label>
              <select
                id={langueId}
                className="form-select form-select-sm"
                value={langue?.id ?? ''}
                disabled={!editable}
                onChange={(e) => {
                  const chosen = langues.find((x) => x.id === Number(e.target.value));
                  if (chosen) void save(choisirLangue(current, chosen));
                }}
              >
                {!langue && <option value="">—</option>}
                {byLibelle(langues).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.libelle}
                  </option>
                ))}
              </select>
            </div>
            {langue && langue.code !== 'AUC' && (
              <div className="col-12 col-md-6">
                <label htmlFor={niveauLcrId} className="form-label small">
                  {t('competences.react.enscpl.niveau.langue')}
                </label>
                <select
                  id={niveauLcrId}
                  className="form-select form-select-sm"
                  value={current.niveau_lcr ?? 1}
                  disabled={!editable}
                  onChange={(e) => save({ ...current, niveau_lcr: Number(e.target.value) })}
                >
                  {NIVEAUX_LCR.map((n) => (
                    <option key={n.niveau} value={n.niveau}>
                      {n.libelle}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}
      </div>
      {showBareme && niveau && niveau.niveau !== 0 && <p className="text-end small fw-bold mb-0">+ {niveau.bareme_brevet}</p>}
    </section>
  );
}
