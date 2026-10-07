import { useEdificeClient } from '@open-ent/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';

import { api, Note } from '../api';
import { noteIsValid } from '../utils';

/**
 * Saisie de notes pour un devoir : liste des élèves de la classe du devoir, avec la note
 * de chacun (édition inline). Enregistre chaque note via POST /competences/note
 * (ou PUT si la note existe déjà). Nécessite d'être propriétaire du devoir.
 */
export function SaisieNotes() {
  const { t } = useTranslation(['competences', 'common']);
  const { devoirId = '' } = useParams();
  const id = Number(devoirId);
  const qc = useQueryClient();
  const { user } = useEdificeClient();
  const structureId = user?.structures?.[0] ?? '';

  const devoirsQuery = useQuery({ queryKey: ['comp', 'devoirs', structureId], queryFn: () => api.getDevoirs(structureId), enabled: !!structureId });
  const devoir = (devoirsQuery.data ?? []).find((d) => d.id === id);

  const studentsQuery = useQuery({
    queryKey: ['comp', 'students', devoir?.id_groupe],
    queryFn: () => api.getClassStudents(devoir!.id_groupe!),
    enabled: !!devoir?.id_groupe,
  });
  const notesQuery = useQuery({ queryKey: ['comp', 'notes', id], queryFn: () => api.getDevoirNotes(id), enabled: !!id });

  const students = studentsQuery.data ?? [];
  const notesByEleve = new Map<string, Note>((notesQuery.data ?? []).map((n) => [n.id_eleve, n]));
  const diviseur = devoir?.diviseur ?? 20;

  // Brouillon local des valeurs saisies (chaîne, pour gérer la saisie et le vide).
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    const init: Record<string, string> = {};
    (notesQuery.data ?? []).forEach((n) => { init[n.id_eleve] = n.valeur != null ? String(n.valeur) : ''; });
    setDraft(init);
  }, [notesQuery.data]);

  const [savedId, setSavedId] = useState('');
  const [errorId, setErrorId] = useState('');

  const saveMut = useMutation({
    mutationFn: (eleveId: string) =>
      api.saveNote({ id: notesByEleve.get(eleveId)?.id, id_eleve: eleveId, id_devoir: id, valeur: draft[eleveId] }),
    onSuccess: (_r, eleveId) => { setSavedId(eleveId); setErrorId(''); qc.invalidateQueries({ queryKey: ['comp', 'notes', id] }); },
    onError: (_e, eleveId) => setErrorId(eleveId),
  });

  const onSave = (eleveId: string) => {
    if (!noteIsValid(draft[eleveId] ?? '', diviseur)) { setErrorId(eleveId); return; }
    saveMut.mutate(eleveId);
  };

  return (
    <div>
      <div className="mb-16">
        <Link to="/evaluations" className="btn btn-link p-0">← {t('competences.notes.back', { defaultValue: 'Retour aux évaluations' })}</Link>
      </div>

      <h1 className="mb-8">{t('competences.notes.title', { defaultValue: 'Saisie des notes' })}</h1>
      {devoir && (
        <p className="text-muted mb-16">
          {devoir.name} · {devoir.libelle_matiere ?? devoir.matiere ?? ''} · {t('competences.notes.over', { defaultValue: 'sur' })} {diviseur}
        </p>
      )}

      {studentsQuery.isLoading && <p>{t('competences.loading', { defaultValue: 'Chargement…' })}</p>}
      {!studentsQuery.isLoading && students.length === 0 && (
        <p className="text-muted">{t('competences.notes.noStudents', { defaultValue: 'Aucun élève dans la classe de ce devoir.' })}</p>
      )}

      {students.length > 0 && (
        <table className="table" style={{ maxWidth: 640 }}>
          <thead>
            <tr>
              <th>{t('competences.notes.student', { defaultValue: 'Élève' })}</th>
              <th style={{ width: 160 }}>{t('competences.notes.value', { defaultValue: 'Note' })} /{diviseur}</th>
              <th style={{ width: 120 }} />
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id}>
                <td>{s.displayName}</td>
                <td>
                  <input
                    type="number"
                    className="form-control"
                    min={0}
                    max={diviseur}
                    step={0.5}
                    value={draft[s.id] ?? ''}
                    aria-label={`${t('competences.notes.value', { defaultValue: 'Note' })} ${s.displayName}`}
                    onChange={(e) => setDraft((d) => ({ ...d, [s.id]: e.target.value }))}
                  />
                </td>
                <td>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={saveMut.isPending} onClick={() => onSave(s.id)}>
                    {notesByEleve.has(s.id) ? t('competences.notes.update', { defaultValue: 'Modifier' }) : t('competences.notes.save', { defaultValue: 'Enregistrer' })}
                  </button>
                  {savedId === s.id && <span className="text-success ms-8" role="status">✓</span>}
                  {errorId === s.id && <span className="text-danger ms-8" role="alert">✗</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default SaisieNotes;
