import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { DomaineSuivi } from '../api';
import { formatDate } from '../rules';
import { Level, UNEVALUATED_COLOR } from '../saisie';
import { CompetenceEvaluation, competenceLevels, Conversion, isMine, isShown, TeacherSubject } from '../suivi';

/*
 * Arbre des domaines du socle avec le niveau de chaque compétence : partagé par le suivi d'un
 * élève (enseignant), le bilan de compétences et la fiche d'un devoir (élève et parents).
 */

export function Legend({ levels }: { levels: Level[] }) {
  const { t } = useTranslation(['competences', 'common']);
  return (
    <ul className="list-inline small mb-0" aria-label={t('competences.react.suivi.legend')}>
      {[...levels].reverse().map((l) => (
        <li key={l.value} className="list-inline-item">
          <LevelBubble level={l} /> {l.libelle}
        </li>
      ))}
    </ul>
  );
}

export function LevelBubble({ level, label }: { level: Level | undefined; label?: string }) {
  return (
    <span
      className="d-inline-block rounded-circle align-middle"
      role={label ? 'img' : undefined}
      aria-label={label}
      style={{ width: 18, height: 18, background: level?.couleur ?? UNEVALUATED_COLOR, opacity: level ? 1 : 0.3 }}
    />
  );
}

export type BlockProps = {
  evaluations: CompetenceEvaluation[];
  teachers: TeacherSubject[];
  table: Conversion[];
  levels: Level[];
  options: { average: boolean; isYear: boolean };
  onlyMine: boolean;
  onlyEvaluated: boolean;
  finalEditable: boolean;
  onSetFinal: (competenceId: number, evals: CompetenceEvaluation[], current: number | undefined) => Promise<void>;
  /** Fiche d'un devoir : le niveau obtenu tel quel, sans table de conversion ni niveau final. */
  rawLevel?: boolean;
};

/** Un domaine, ses compétences visibles, puis ses sous-domaines ; caché s'il ne montre rien. */
export function DomaineBlock({ domaine, ...props }: BlockProps & { domaine: DomaineSuivi }) {
  const rows = (domaine.competences ?? [])
    .map((c) => ({
      competence: c,
      evals: props.evaluations.filter((e) => e.id_competence === c.id && e.id_domaine === c.id_domaine),
    }))
    .filter(({ competence, evals }) => isShown(evals, competence.masque, props.onlyEvaluated, props.onlyMine, props.teachers));
  const children = (domaine.domaines ?? []).filter((d) => hasVisible(d, props));
  if (rows.length === 0 && children.length === 0) return null;
  const Heading = domaine.niveau === 1 ? 'h3' : 'h4';
  return (
    <details open={domaine.niveau > 1}>
      <summary>
        <Heading className={`d-inline ${domaine.niveau === 1 ? 'h5' : 'h6'}`}>
          {domaine.codification} - {domaine.libelle}
        </Heading>
      </summary>
      <div className="ms-16 mt-8 d-flex flex-column gap-4">
        {rows.map(({ competence, evals }) => (
          <CompetenceRow key={competence.id} competence={competence} evals={evals} {...props} />
        ))}
        {children.map((d) => (
          <DomaineBlock key={d.id} domaine={d} {...props} />
        ))}
      </div>
    </details>
  );
}

function hasVisible(domaine: DomaineSuivi, props: BlockProps): boolean {
  const own = (domaine.competences ?? []).some((c) =>
    isShown(
      props.evaluations.filter((e) => e.id_competence === c.id && e.id_domaine === c.id_domaine),
      c.masque,
      props.onlyEvaluated,
      props.onlyMine,
      props.teachers,
    ),
  );
  return own || (domaine.domaines ?? []).some((d) => hasVisible(d, props));
}

function CompetenceRow({
  competence,
  evals,
  ...props
}: BlockProps & { competence: { id: number; nom: string }; evals: CompetenceEvaluation[] }) {
  const { t } = useTranslation(['competences', 'common']);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const levels = props.rawLevel
    ? { all: Math.max(-1, ...evals.map((e) => e.evaluation)) }
    : competenceLevels(evals, props.teachers, props.table, props.options);
  const levelOf = (value: number | undefined) => (value === undefined || value < 0 ? undefined : props.levels.find((l) => l.value === value));
  const describe = (value: number | undefined) => levelOf(value)?.libelle ?? t('competences.react.saisie.level.none');
  const shownEvals = (props.onlyMine ? evals.filter((e) => isMine(e, props.teachers)) : evals).filter((e) => e.evaluation > -1);

  return (
    <div className="border-bottom pb-4">
      <div className="d-flex align-items-center gap-12 flex-wrap">
        <button type="button" className="btn btn-link p-0 text-start flex-fill" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {competence.nom}
        </button>
        {props.onlyMine ? (
          <>
            <span className="small text-muted">{t('evaluation.suivi.niveau.atteint')}</span>
            <LevelBubble level={levelOf(levels.atteint)} label={`${t('evaluation.suivi.niveau.atteint')} : ${describe(levels.atteint)}`} />
            <span className="small text-muted">{t('evaluation.suivi.niveau.final')}</span>
            {props.finalEditable && levels.final !== undefined ? (
              <button
                type="button"
                className="btn p-0 border-0"
                disabled={busy}
                aria-label={t('competences.react.suivi.final.change', { level: describe(levels.final) })}
                onClick={async () => {
                  setBusy(true);
                  await props.onSetFinal(competence.id, evals, levels.final);
                  setBusy(false);
                }}
              >
                <LevelBubble level={levelOf(levels.final)} />
              </button>
            ) : (
              <LevelBubble level={levelOf(levels.final)} label={`${t('evaluation.suivi.niveau.final')} : ${describe(levels.final)}`} />
            )}
          </>
        ) : (
          <>
            <span className="small text-muted">{t('evaluation.suivi.niveau')}</span>
            <LevelBubble level={levelOf(levels.all)} label={`${t('evaluation.suivi.niveau')} : ${describe(levels.all)}`} />
          </>
        )}
      </div>
      {open && (
        <table className="table table-sm small mt-8 mb-0">
          <thead>
            <tr>
              <th scope="col">{t('date')}</th>
              <th scope="col">{t('viescolaire.notes.title')}</th>
              <th scope="col">{t('evaluations.test.teacher')}</th>
              <th scope="col">{t('evaluation.suivi.niveau')}</th>
            </tr>
          </thead>
          <tbody>
            {shownEvals.length === 0 && (
              <tr>
                <td colSpan={4} className="text-muted">
                  {t('competences.react.suivi.no.evaluation')}
                </td>
              </tr>
            )}
            {shownEvals.map((e) => (
              <tr key={e.id_competences_notes}>
                <td>{formatDate(e.evaluation_date)}</td>
                <td>
                  {e.evaluation_libelle}
                  {e.formative && <span className="text-muted"> ({t('competences.react.suivi.formative')})</span>}
                </td>
                <td>{e.owner_name}</td>
                <td>
                  <LevelBubble level={levelOf(e.evaluation)} label={describe(e.evaluation)} /> {describe(e.evaluation)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
