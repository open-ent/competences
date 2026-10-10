import { useEffect, useId, useState } from 'react';

import type { Annotation } from '../types';

/**
 * Case « Note » : une note, ou le libellé court d'une annotation (ABS, DISP, NN, NR), proposés par
 * une liste d'aide. Enregistrée en quittant la case ou sur Entrée ; refusée, elle revient à la
 * valeur précédente et dit pourquoi.
 */
export function NoteInput({
  label,
  value,
  annotations,
  disabled,
  onCommit,
}: {
  label: string;
  value: string;
  annotations: Annotation[];
  disabled: boolean;
  onCommit: (raw: string) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState(value);
  const [problem, setProblem] = useState<string | null>(null);
  const listId = useId();
  const problemId = useId();
  useEffect(() => setDraft(value), [value]);

  const commit = async () => {
    const message = await onCommit(draft);
    setProblem(message);
    if (message) setDraft(value);
  };

  return (
    <div>
      <input
        type="text"
        inputMode="decimal"
        className={`form-control form-control-sm ${problem ? 'is-invalid' : ''}`}
        style={{ width: 84 }}
        aria-label={label}
        aria-invalid={!!problem}
        aria-describedby={problem ? problemId : undefined}
        list={listId}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      <datalist id={listId}>
        {annotations.map((a) => (
          <option key={a.id} value={a.libelle_court}>
            {a.libelle}
          </option>
        ))}
      </datalist>
      {problem && (
        <div id={problemId} className="invalid-feedback d-block" style={{ maxWidth: 220 }}>
          {problem}
        </div>
      )}
    </div>
  );
}

/** Appréciation : enregistrée en quittant la case ; zone de texte et longueur maximale au besoin. */
export function AppreciationInput({
  label,
  value,
  disabled,
  multiline,
  maxLength,
  onCommit,
}: {
  label: string;
  value: string;
  disabled: boolean;
  multiline?: boolean;
  maxLength?: number;
  onCommit: (value: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const common = {
    className: 'form-control form-control-sm',
    'aria-label': label,
    value: draft,
    disabled,
    maxLength,
    onBlur: () => onCommit(draft),
  };
  return multiline ? (
    <textarea {...common} rows={2} onChange={(e) => setDraft(e.target.value)} />
  ) : (
    <input
      {...common}
      type="text"
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
