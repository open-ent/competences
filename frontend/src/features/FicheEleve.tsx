import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import * as api from '../api';
import { evenementsHistorique } from '../conseil';
import { formatDate } from '../rules';
import { levelsForCycle } from '../saisie';
import { useStructure } from '../structure';
import type { Classe, EleveDevoir, PeriodeClasse } from '../types';
import { ProportionBar } from './SuiviCharts';

/**
 * Fiche de l'élève (`informations/display_eleve.html`) : photo, date de naissance, répartition de ses niveaux sur la période
 * et, hors vue du cycle, ses retards et absences avec le commentaire de la vie scolaire. Partagée par le suivi d'un élève
 * et la saisie des notes.
 */
export function FicheEleve({
  classe,
  eleve,
  periode,
  periodes,
  withProportions = true,
}: {
  classe: Classe;
  eleve: EleveDevoir & { birthDate?: string | null };
  periode: PeriodeClasse | null;
  periodes: PeriodeClasse[];
  withProportions?: boolean;
}) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const { structureId } = useStructure();
  const idCycle = classe.id_cycle ?? null;
  const periodeId = periode?.id_type ?? null;

  const evenementsQuery = useQuery({ queryKey: ['competences', structureId, 'evenements', classe.id, eleve.id], queryFn: () => api.getEvenements(structureId, classe.id, eleve.id) });
  const cpeQuery = useQuery({
    queryKey: ['competences', structureId, 'cpe', eleve.id, periodeId],
    queryFn: () => api.getAppreciationCPE(structureId, eleve.id, periodeId!),
    enabled: periodeId !== null,
  });
  // Mêmes clés que le suivi des compétences : une seule requête pour les deux.
  const notesQuery = useQuery({
    queryKey: ['competences', structureId, 'suivi', eleve.id, idCycle, periodeId ?? 'annee'],
    queryFn: () => api.getCompetenceNotesEleve(eleve.id, idCycle!, periodeId),
    enabled: withProportions && idCycle !== null,
  });
  const levelsQuery = useQuery({ queryKey: ['competences', structureId, 'maitrise'], queryFn: () => api.getMaitriseLevels(structureId), enabled: withProportions && idCycle !== null });
  const levels = idCycle === null ? [] : levelsForCycle(levelsQuery.data ?? [], idCycle);

  const ligne = evenementsHistorique(evenementsQuery.data ?? [], periodes.map((p) => p.id_type)).find((l) => l.id_periode === periodeId);
  const stat = (label: string, value: number | undefined, unit?: string) => (
    <div className="d-flex justify-content-between gap-8">
      <span>{t(label)}</span>
      <strong>
        {value ?? 0}
        {unit ? t(unit) : ''}
      </strong>
    </div>
  );

  return (
    <aside className="card p-16 d-flex flex-column gap-8" aria-label={t('competences.react.fiche.eleve')} data-fiche-eleve>
      <div className="d-flex align-items-center gap-12">
        <img
          src={`/viescolaire/structures/${structureId}/students/${eleve.id}/picture`}
          alt=""
          width={56}
          height={56}
          className="rounded-circle"
          onError={(e) => {
            e.currentTarget.style.visibility = 'hidden';
          }}
        />
        <div>
          <strong className={eleve.deleteDate ? 'text-decoration-line-through' : ''}>{eleve.displayName ?? `${eleve.lastName ?? ''} ${eleve.firstName ?? ''}`.trim()}</strong>
          <div className="small text-muted">
            {eleve.birthDate ? `${t('viescolaire.utils.user.birthdate')} : ${formatDate(eleve.birthDate)}` : t('viescolaire.utils.user.birthdate.undefined')}
          </div>
        </div>
      </div>
      {withProportions && (notesQuery.data?.length ?? 0) > 0 && <ProportionBar evals={notesQuery.data!} levels={levels} />}
      <div className="small d-flex flex-column gap-4">
        {stat('viescolaire.retards', ligne?.retard)}
        {stat('viescolaire.abs.justified', ligne?.abs_just, 'half.days')}
        {stat('viescolaire.abs.not.justified', ligne?.abs_non_just, 'half.days')}
        {stat('viescolaire.nb.courses.lost', ligne?.abs_totale_heure, 'hours')}
        {cpeQuery.data ? (
          <div>
            <span>{t('viescolaire.commentaire')} : </span>
            <strong>{cpeQuery.data}</strong>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

export default FicheEleve;
