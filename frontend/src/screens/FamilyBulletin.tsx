import { Alert, LoadingScreen, useEdificeClient } from '@open-ent/react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import * as api from '../api';
import { currentPeriode, FamilyChild } from '../family';
import { todayLocal, useChildData, useFamily } from '../familyContext';
import { WithChild } from '../features/FamilyParts';
import { usePeriodeLabel } from '../features/Filters';

/**
 * Bulletin de l'enfant (`eval_parent_dispbulletin.html`) : le PDF que la direction a généré pour
 * la période, quand la publication des bulletins de cette période est ouverte.
 */
export function FamilyBulletin() {
  return <WithChild render={(child, data) => <BulletinView child={child} data={data} />} />;
}

function BulletinView({ child, data }: { child: FamilyChild; data: ReturnType<typeof useChildData> }) {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const { user } = useEdificeClient();
  const { isParent } = useFamily();
  const periodeLabel = usePeriodeLabel();
  const periodeId = useId();
  const [periode, setPeriode] = useState<number | null>(() => currentPeriode(data.periodes, todayLocal()) ?? data.periodes[0]?.id_type ?? null);
  const selected = data.periodes.find((p) => p.id_type === periode);

  const bulletinQuery = useQuery({
    queryKey: ['competences', 'famille', child.id, 'bulletin', periode],
    queryFn: () =>
      api.seeBulletin({
        idEleve: child.id,
        idPeriode: periode!,
        idStructure: child.idStructure,
        idClasse: child.idClasse,
        idParent: isParent ? ((user as { externalId?: string } | undefined)?.externalId ?? null) : null,
      }),
    enabled: !!selected?.publication_bulletin,
  });
  const url = useMemo(() => (bulletinQuery.data ? URL.createObjectURL(bulletinQuery.data) : null), [bulletinQuery.data]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  return (
    <div className="d-flex flex-column gap-16">
      <h1 className="h3 mb-0">
        {t('evaluations.bulletin')}
        {isParent && ` — ${child.firstName}`}
      </h1>
      <div className="d-flex flex-wrap gap-12 align-items-end">
        <div>
          <label htmlFor={periodeId} className="form-label">
            {t('viescolaire.utils.periode')}
          </label>
          <select id={periodeId} className="form-select" value={periode ?? ''} onChange={(e) => setPeriode(Number(e.target.value))}>
            {data.periodes.map((p) => (
              <option key={p.id_type} value={p.id_type}>
                {periodeLabel({ id: p.id_type, type: p.type, ordre: p.ordre })}
              </option>
            ))}
          </select>
        </div>
        {url && (
          <a className="btn btn-outline-primary" href={url} download={`bulletin-${child.lastName}-${child.firstName}.pdf`}>
            {t('evaluations.bulletin.open.pdf')}
          </a>
        )}
      </div>
      {bulletinQuery.isLoading && selected?.publication_bulletin ? (
        <LoadingScreen position={false} />
      ) : url ? (
        <iframe title={t('evaluations.bulletin')} src={url} className="w-100 border rounded" style={{ height: '80vh' }} />
      ) : (
        <Alert type="info">{t('evaluations.no.summary.bulletin')}</Alert>
      )}
    </div>
  );
}

export default FamilyBulletin;
