import { Alert, Button } from '@open-ent/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import * as api from '../api';
import { modelPreferences, ReportModel } from '../bulletins';
import type { PrintOptions } from '../bulletins';
import { useStructure, useViewer } from '../structure';

/**
 * Modèles d'options des bulletins (`lightbox-select-report-model.html`) : jeux d'options nommés,
 * partagés dans l'établissement. Choisir un modèle applique ses options ; chacun crée, renomme ou
 * supprime les siens. Le modèle choisi est mémorisé dans la préférence `competences`.
 */
export function ReportModels({
  selectedId,
  print,
  texts,
  onSelect,
}: {
  selectedId: string | null;
  print: PrintOptions;
  texts: { mentionClass: string; orientationOpinion: string };
  onSelect: (model: ReportModel | null) => void;
}) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const queryClient = useQueryClient();
  const { structureId } = useStructure();
  const viewer = useViewer()!;
  const selectId = useId();
  const [title, setTitle] = useState('');
  const [error, setError] = useState(false);
  const key = ['competences', structureId, 'report-models'];
  const modelsQuery = useQuery({ queryKey: key, queryFn: () => api.getReportModels(structureId) });
  const models = modelsQuery.data ?? [];
  const selected = models.find((m) => m._id === selectedId) ?? null;
  const own = selected?.userId === viewer.userId;
  const titleTaken = models.some((m) => m.title.trim().toLowerCase() === title.trim().toLowerCase());

  const run = async (write: () => Promise<void>) => {
    try {
      setError(false);
      await write();
    } catch {
      setError(true);
    } finally {
      await queryClient.invalidateQueries({ queryKey: key });
    }
  };

  return (
    <fieldset className="d-flex flex-column gap-8">
      <legend className="h6">{t('competences.react.bulletins.models')}</legend>
      {error && <Alert type="danger">{t('competences.react.saisie.save.error')}</Alert>}
      <div className="row g-8 align-items-end">
        <div className="col-12 col-md-6">
          <label htmlFor={selectId} className="form-label">
            {t('competences.report.model.title.select')}
          </label>
          <select id={selectId} className="form-select" value={selectedId ?? ''} onChange={(e) => onSelect(models.find((m) => m._id === e.target.value) ?? null)}>
            <option value="">—</option>
            {models.map((m) => (
              <option key={m._id} value={m._id}>
                {m.title}
              </option>
            ))}
          </select>
        </div>
        {selected && own && (
          <div className="col-12 col-md-6 d-flex gap-8">
            <Button
              type="button"
              size="sm"
              color="secondary"
              variant="outline"
              onClick={() => run(async () => void (await api.updateReportModel(selected._id, modelPreferences(print, texts))))}
            >
              {t('competences.react.bulletins.model.update')}
            </Button>
            <Button
              type="button"
              size="sm"
              color="danger"
              variant="outline"
              onClick={() =>
                run(async () => {
                  await api.deleteReportModel(selected._id);
                  onSelect(null);
                })
              }
            >
              {t('competences.react.bulletins.model.delete')}
            </Button>
          </div>
        )}
      </div>
      <div className="row g-8 align-items-end">
        <div className="col-12 col-md-6">
          <label htmlFor="report-model-title" className="form-label">
            {t('competences.report.model.add')}
          </label>
          <input id="report-model-title" className="form-control" placeholder={t('competences.report.model.name')} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="col-12 col-md-6">
          <Button
            type="button"
            size="sm"
            color="primary"
            variant="outline"
            disabled={!title.trim() || titleTaken}
            onClick={() =>
              run(async () => {
                const id = await api.createReportModel({ structureId, title: title.trim(), ...modelPreferences(print, texts) });
                setTitle('');
                onSelect({ _id: id, userId: viewer.userId, structureId, title: title.trim(), preferencesCheckbox: [], preferencesText: {} });
              })
            }
          >
            {t('viescolaire.utils.save')}
          </Button>
          {titleTaken && <div className="small text-danger mt-4">{t('competences.reportModel.info.problem.title')}</div>}
        </div>
      </div>
    </fieldset>
  );
}
