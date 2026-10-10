import { Alert, LoadingScreen } from '@open-ent/react';
import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import * as api from '../api';
import { currentPeriode, FamilyChild } from '../family';
import { todayLocal, useChildData, useFamily } from '../familyContext';
import { WithChild } from '../features/FamilyParts';
import { usePeriodeLabel } from '../features/Filters';
import { DomaineBlock, Legend } from '../features/SuiviTree';
import { levelsForCycle } from '../saisie';

/** Valeur du choix de période : un type de période, l'année, ou le cycle. */
type Choice = { kind: 'periode'; idType: number } | { kind: 'annee' } | { kind: 'cycle' };
const encode = (c: Choice) => (c.kind === 'periode' ? String(c.idType) : c.kind);
const decode = (v: string): Choice => (v === 'annee' || v === 'cycle' ? { kind: v } : { kind: 'periode', idType: Number(v) });

/**
 * Bilan de compétences de l'enfant (`content_vue_bilan_eleve.html`) : par domaine du socle, le
 * niveau de chaque compétence sur une période, l'année ou un cycle.
 *
 * Pas encore portée : la présentation par enseignement (absente aussi du suivi enseignant).
 */
export function FamilyBilan() {
  return <WithChild render={(child, data) => <BilanView child={child} data={data} />} />;
}

function BilanView({ child, data }: { child: FamilyChild; data: ReturnType<typeof useChildData> }) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const { isParent } = useFamily();
  const periodeLabel = usePeriodeLabel();
  const periodeId = useId();
  const [choice, setChoice] = useState<Choice>(() => {
    const current = currentPeriode(data.periodes, todayLocal());
    return current === null ? { kind: 'annee' } : { kind: 'periode', idType: current };
  });
  const [cycleId, setCycleId] = useState<number | null>(data.idCycle);
  const [onlyEvaluated, setOnlyEvaluated] = useState(true);

  const idCycle = choice.kind === 'cycle' ? cycleId : data.idCycle;
  const periode = choice.kind === 'periode' ? choice.idType : null;
  const isCycle = choice.kind === 'cycle';

  const domainesQuery = useQuery({
    queryKey: ['competences', 'domaines-eleve', child.idClasse, child.id, idCycle],
    queryFn: () => api.getDomainesEleve(child.idClasse, child.id, idCycle!),
    enabled: idCycle !== null,
  });
  const notesQuery = useQuery({
    queryKey: ['competences', 'famille', child.id, 'bilan', idCycle, periode ?? 'annee', isCycle],
    queryFn: () => api.getCompetenceNotesEleve(child.id, idCycle!, periode, isCycle),
    enabled: idCycle !== null,
  });
  const conversionQuery = useQuery({
    queryKey: ['competences', child.idStructure, 'conversion', child.idClasse],
    queryFn: () => api.getConversionTable(child.idStructure, child.idClasse),
  });
  const averageQuery = useQuery({
    queryKey: ['competences', child.idStructure, 'skill-average'],
    queryFn: () => api.getSkillAverageOption(child.idStructure),
  });
  const maitriseQuery = useQuery({ queryKey: ['competences', child.idStructure, 'maitrise'], queryFn: () => api.getMaitriseLevels(child.idStructure) });

  if (idCycle === null) return <Alert type="info">{t('competences.react.famille.no.cycle')}</Alert>;
  const loading = [domainesQuery, notesQuery, conversionQuery, averageQuery, maitriseQuery].some((q) => q.isLoading);
  const levels = levelsForCycle(maitriseQuery.data ?? [], idCycle);

  return (
    <div className="d-flex flex-column gap-16">
      <h1 className="h3 mb-0">
        {t('evaluations.bilan.competence.title')}
        {isParent && ` — ${child.firstName}`}
      </h1>
      <section className="card p-16">
        <h2 className="h6">{t('viescolaire.utils.criterion')}</h2>
        <div className="row g-12 align-items-end">
          <div className="col-12 col-md-4">
            <label htmlFor={periodeId} className="form-label">
              {t('viescolaire.utils.periode')}
            </label>
            <select id={periodeId} className="form-select" value={encode(choice)} onChange={(e) => setChoice(decode(e.target.value))}>
              {data.periodes.map((p) => (
                <option key={p.id_type} value={p.id_type}>
                  {periodeLabel({ id: p.id_type, type: p.type, ordre: p.ordre })}
                </option>
              ))}
              <option value="annee">{t('viescolaire.utils.annee')}</option>
              <option value="cycle">{t('viescolaire.utils.cycle')}</option>
            </select>
          </div>
          {isCycle && data.cycles.length > 1 && (
            <fieldset className="col-12 col-md-4">
              <legend className="form-label fs-6">{t('viescolaire.utils.cycle')}</legend>
              {data.cycles.map((c) => (
                <div key={c.id_cycle} className="form-check form-check-inline">
                  <input
                    id={`bilan-cycle-${c.id_cycle}`}
                    type="radio"
                    name="bilan-cycle"
                    className="form-check-input"
                    checked={cycleId === c.id_cycle}
                    onChange={() => setCycleId(c.id_cycle)}
                  />
                  <label htmlFor={`bilan-cycle-${c.id_cycle}`} className="form-check-label">
                    {c.libelle}
                  </label>
                </div>
              ))}
            </fieldset>
          )}
          <div className="col-12 col-md-4">
            <div className="form-check">
              <input
                id="bilan-only-evaluated"
                type="checkbox"
                className="form-check-input"
                checked={onlyEvaluated}
                onChange={(e) => setOnlyEvaluated(e.target.checked)}
              />
              <label htmlFor="bilan-only-evaluated" className="form-check-label">
                {t('evaluation.suivieleve.filtre.competence')}
              </label>
            </div>
          </div>
        </div>
      </section>

      <section className="card p-16 d-flex flex-column gap-12">
        {loading ? (
          <LoadingScreen position={false} />
        ) : domainesQuery.isError || notesQuery.isError ? (
          <Alert type="danger">{t('competences.react.loading.error')}</Alert>
        ) : (
          <>
            <Legend levels={levels} />
            {(notesQuery.data ?? []).length === 0 && <Alert type="info">{t('competences.react.suivi.no.evaluation')}</Alert>}
            {(domainesQuery.data ?? []).map((domaine) => (
              <DomaineBlock
                key={domaine.id}
                domaine={domaine}
                evaluations={notesQuery.data ?? []}
                teachers={[]}
                table={conversionQuery.data ?? []}
                levels={levels}
                options={{ average: !!averageQuery.data, isYear: choice.kind === 'annee' }}
                onlyMine={false}
                onlyEvaluated={onlyEvaluated}
                finalEditable={false}
                onSetFinal={async () => undefined}
              />
            ))}
          </>
        )}
      </section>
    </div>
  );
}

export default FamilyBilan;
