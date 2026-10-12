import { Alert, Button, Modal } from '@open-ent/react';
import { FormEvent, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import * as api from '../api';
import { matieresForClasse } from '../rules';
import type { Level } from '../saisie';
import { useStructure, useStructureData, useViewer } from '../structure';
import type { Classe, PeriodeClasse } from '../types';
import { usePeriodeLabel } from './Filters';

const isoDay = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * Évaluation libre (`display_creation_eval_libre.html`, `initEvaluationLibre`) : un niveau posé
 * sur une compétence pour un seul élève, hors de toute évaluation de classe. Le serveur crée un
 * devoir sans classe ni note, et y enregistre le niveau.
 */
export function EvaluationLibre({
  classe,
  eleveId,
  competence,
  periodes,
  levels,
  onClose,
  onSaved,
}: {
  classe: Classe;
  eleveId: string;
  competence: { id: number; nom: string };
  periodes: PeriodeClasse[];
  levels: Level[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const { structureId } = useStructure();
  const data = useStructureData();
  const viewer = useViewer()!;
  const periodeLabel = usePeriodeLabel();
  const ids = { name: useId(), libelle: useId(), matiere: useId(), sous: useId(), periode: useId(), date: useId(), publi: useId(), niveau: useId() };
  const matieres = useMemo(() => matieresForClasse(data.matieres, classe.id, data.classes, viewer), [data.matieres, data.classes, classe.id, viewer]);
  const today = isoDay(new Date());
  const current = periodes.find((p) => p.timestamp_dt.slice(0, 10) <= today && today <= p.timestamp_fn.slice(0, 10)) ?? periodes[0];
  const [form, setForm] = useState({
    name: '',
    libelle: '',
    id_matiere: matieres.length === 1 ? matieres[0].id : '',
    id_sousmatiere: '',
    id_periode: current?.id_type ?? null,
    date: today,
    date_publication: today,
    evaluation: -1,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const sousMatieres = matieres.find((m) => m.id === form.id_matiere)?.sousMatieres ?? [];
  const periode = periodes.find((p) => p.id_type === form.id_periode);
  // Dates contrôlées comme `controleDate` : dans la période, publication au plus tôt le jour du devoir.
  const dateError =
    periode && (form.date < periode.timestamp_dt.slice(0, 10) || form.date > periode.timestamp_fn.slice(0, 10))
      ? 'devoir.errDateDevoir'
      : form.date_publication < form.date
        ? 'devoir.errDatePubli'
        : null;
  const valid = form.name.trim() !== '' && form.id_matiere !== '' && form.id_periode !== null && form.evaluation > -1 && !dateError;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await api.createDevoir({
        name: form.name.trim(),
        owner: viewer.userId,
        libelle: form.libelle,
        id_groupe: null,
        type_groupe: -1,
        id_sousmatiere: form.id_sousmatiere === '' ? null : Number(form.id_sousmatiere),
        id_periode: form.id_periode,
        id_type: 1,
        id_matiere: form.id_matiere,
        id_etat: 1,
        date_publication: form.date_publication,
        id_etablissement: structureId,
        diviseur: 20,
        coefficient: 1,
        date: form.date,
        ramener_sur: false,
        is_evaluated: false,
        apprec_visible: false,
        competences: [competence.id],
        competenceEvaluee: { evaluation: form.evaluation, id_competence: competence.id, id_eleve: eleveId, owner: viewer.userId },
      });
      onSaved();
      onClose();
    } catch {
      setError(t('competences.react.saisie.save.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal id="evaluation-libre" isOpen size="md" onModalClose={onClose}>
      <Modal.Header onModalClose={onClose}>{t('evaluations.evaluation.libre.add')}</Modal.Header>
      <form onSubmit={submit}>
        <Modal.Body>
          <div className="d-flex flex-column gap-12">
            {error && <Alert type="danger">{error}</Alert>}
            <p className="mb-0 fw-bold">{competence.nom}</p>
            <div>
              <label htmlFor={ids.name} className="form-label">
                {t('evaluations.test.title')}
              </label>
              <input id={ids.name} className="form-control" required value={form.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
            <div>
              <label htmlFor={ids.libelle} className="form-label">
                {t('viescolaire.utils.description')}
              </label>
              <input id={ids.libelle} className="form-control" value={form.libelle} onChange={(e) => set({ libelle: e.target.value })} />
            </div>
            <div className="row g-8">
              <div className="col-12 col-md-6">
                <label htmlFor={ids.matiere} className="form-label">
                  {t('viescolaire.utils.subject')}
                </label>
                <select id={ids.matiere} className="form-select" value={form.id_matiere} onChange={(e) => set({ id_matiere: e.target.value, id_sousmatiere: '' })}>
                  <option value="">—</option>
                  {matieres.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              {sousMatieres.length > 0 && (
                <div className="col-12 col-md-6">
                  <label htmlFor={ids.sous} className="form-label">
                    {t('viescolaire.utils.undersubject')}
                  </label>
                  <select id={ids.sous} className="form-select" value={form.id_sousmatiere} onChange={(e) => set({ id_sousmatiere: e.target.value })}>
                    <option value="">—</option>
                    {sousMatieres.map((s) => (
                      <option key={s.id_type_sousmatiere} value={s.id_type_sousmatiere}>
                        {s.libelle}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div>
              <label htmlFor={ids.niveau} className="form-label">
                {t('evaluations.competence.evaluate')}
              </label>
              <select id={ids.niveau} className="form-select" value={form.evaluation} onChange={(e) => set({ evaluation: Number(e.target.value) })}>
                <option value={-1}>—</option>
                {levels.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.libelle}
                  </option>
                ))}
              </select>
            </div>
            <div className="row g-8">
              <div className="col-12 col-md-4">
                <label htmlFor={ids.periode} className="form-label">
                  {t('viescolaire.utils.periode')}
                </label>
                <select id={ids.periode} className="form-select" value={form.id_periode ?? ''} onChange={(e) => set({ id_periode: Number(e.target.value) })}>
                  {periodes.map((p) => (
                    <option key={p.id_type} value={p.id_type}>
                      {periodeLabel({ id: p.id_type, type: p.type, ordre: p.ordre })}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-12 col-md-4">
                <label htmlFor={ids.date} className="form-label">
                  {t('evaluations.test.date')}
                </label>
                <input id={ids.date} type="date" className="form-control" value={form.date} onChange={(e) => set({ date: e.target.value })} />
              </div>
              <div className="col-12 col-md-4">
                <label htmlFor={ids.publi} className="form-label">
                  {t('evaluations.test.grade.publication.date')}
                </label>
                <input id={ids.publi} type="date" className="form-control" value={form.date_publication} onChange={(e) => set({ date_publication: e.target.value })} />
              </div>
            </div>
            {dateError && <Alert type="warning">{t(dateError)}</Alert>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" color="tertiary" variant="ghost" onClick={onClose}>
            {t('competences.react.cancel')}
          </Button>
          <Button type="submit" color="primary" variant="filled" isLoading={busy} disabled={!valid}>
            {t('viescolaire.utils.save')}
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
