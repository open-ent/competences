import { Alert, AppHeader, Breadcrumb, Layout, LoadingScreen, useEdificeClient } from '@open-ent/react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import * as api from '../api';

/**
 * Journal des exports d'archives en erreur (`admin-parameter.html`), servi aux super-administrateurs
 * sur `/competences/admin/archives/report` : date, établissement, classe, élève et motif.
 */
export function AdminArchivesReport() {
  const { t } = useTranslation(['competences', 'viescolaire', 'common']);
  const { init, currentApp } = useEdificeClient();
  const query = useQuery({ queryKey: ['competences', 'admin', 'export-logs'], queryFn: api.getExportLogs });
  if (!init || query.isLoading) return <LoadingScreen position={false} />;
  const exports = query.data ?? [];
  return (
    <Layout>
      <AppHeader>{currentApp && <Breadcrumb app={currentApp} />}</AppHeader>
      <div className="d-flex flex-column gap-16 mt-16">
        <h1 className="h3 mb-0">{t('competences.react.admin.archives.title')}</h1>
        {query.isError ? (
          <Alert type="danger">{t('competences.react.loading.error')}</Alert>
        ) : exports.length === 0 ? (
          <Alert type="success">{t('no.errors.while.archive.mongo')}</Alert>
        ) : (
          <div className="table-responsive card">
            <table className="table table-sm mb-0">
              <thead>
                <tr>
                  <th scope="col">{t('parameter.archive.date')}</th>
                  <th scope="col">{t('viescolaire.utils.school')}</th>
                  <th scope="col">{t('viescolaire.utils.class')}</th>
                  <th scope="col">{t('viescolaire.utils.student')}</th>
                  <th scope="col">{t('competences.parameter.log.error.export')}</th>
                </tr>
              </thead>
              <tbody>
                {exports.map((e, i) => (
                  <tr key={i}>
                    <td>{e.created}</td>
                    <td>{e.params?.eleve?.structure}</td>
                    <td>{e.params?.eleve?.classeName}</td>
                    <td>
                      {e.params?.eleve?.firstName} - {e.params?.eleve?.lastName}
                    </td>
                    <td className="small">{e.log}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default AdminArchivesReport;
