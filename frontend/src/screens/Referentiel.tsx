import { useEdificeClient } from '@open-ent/react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DomaineNode, api } from '../api';
import { countDomaines } from '../utils';

/** Rend un domaine et ses sous-domaines récursivement (arbre de compétences). */
function DomaineItem({ node }: { node: DomaineNode }) {
  const children = node.domaines ?? [];
  return (
    <li>
      <div className="d-flex align-items-center gap-8 py-4">
        {node.codification && <span className="badge bg-primary">{node.codification}</span>}
        <span>{node.libelle}</span>
        {node.evaluated === false && <span className="badge bg-secondary">non évalué</span>}
      </div>
      {children.length > 0 && (
        <ul style={{ listStyle: 'none', paddingLeft: 20, borderLeft: '1px solid #e0e0e0', marginLeft: 8 }}>
          {children.map((c) => <DomaineItem key={c.id} node={c} />)}
        </ul>
      )}
    </li>
  );
}

/**
 * Référentiel — arbre de compétences (parité IHM AngularJS, CCTP 51C).
 * Sélection d'une classe, puis affichage de l'arbre des domaines du cycle (GET /competences/domaines).
 */
export function Referentiel() {
  const { t } = useTranslation(['competences', 'common']);
  const { user, init } = useEdificeClient();
  const structureId = user?.structures?.[0] ?? '';

  const classesQuery = useQuery({ queryKey: ['comp', 'classes', structureId], queryFn: () => api.getClasses(structureId), enabled: !!structureId });
  const [classId, setClassId] = useState('');

  // Sélection automatique de la première classe.
  useEffect(() => {
    if (!classId && classesQuery.data && classesQuery.data.length > 0) setClassId(classesQuery.data[0].id);
  }, [classId, classesQuery.data]);

  const arbreQuery = useQuery({
    queryKey: ['comp', 'arbre', structureId, classId],
    queryFn: () => api.getArbreDomaines(structureId, classId),
    enabled: !!structureId && !!classId,
  });
  const arbre = arbreQuery.data ?? [];

  if (init && !structureId) {
    return (
      <div>
        <h1>{t('competences.title', { defaultValue: 'Compétences' })}</h1>
        <div className="alert alert-info" role="alert">{t('competences.no.structure', { defaultValue: 'Aucun établissement associé à votre compte.' })}</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-16">
        {t('competences.referentiel.title', { defaultValue: 'Arbre de compétences' })}
        {arbre.length > 0 && <span className="text-muted" style={{ fontSize: 14 }}> ({countDomaines(arbre)})</span>}
      </h1>

      <div className="d-flex gap-12 align-items-end flex-wrap mb-16">
        <div style={{ minWidth: 240 }}>
          <label htmlFor="ref-class" className="form-label">{t('competences.class', { defaultValue: 'Classe' })}</label>
          <select id="ref-class" className="form-select" value={classId} onChange={(e) => setClassId(e.target.value)}>
            {(classesQuery.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {arbreQuery.isLoading && <p>{t('competences.loading', { defaultValue: 'Chargement…' })}</p>}
      {!arbreQuery.isLoading && arbre.length === 0 && (
        <p className="text-muted">{t('competences.referentiel.empty', { defaultValue: 'Aucun référentiel de compétences pour le cycle de cette classe.' })}</p>
      )}
      {arbre.length > 0 && (
        <div className="card p-16">
          <ul style={{ listStyle: 'none', paddingLeft: 0, marginBottom: 0 }}>
            {arbre.map((d) => <DomaineItem key={d.id} node={d} />)}
          </ul>
        </div>
      )}
    </div>
  );
}

export default Referentiel;
