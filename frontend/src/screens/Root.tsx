import { AppHeader, Breadcrumb, Layout, LoadingScreen, useEdificeClient } from '@open-ent/react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router-dom';

import { UiSwitchBanner } from '../features/UiSwitchBanner';
import { TEACHER_MENU } from '../rights';
import { StructureProvider, useStructure } from '../structure';

/**
 * Gabarit commun : bandeau ENT du socle, menu de l'enseignant à gauche, écran à droite.
 *
 * L'AngularJS incluait ce menu DANS l'accueil seulement (`menu_teacher.html`), et le reprenait en
 * menu latéral mobile sur toutes les pages (`eval_teacher.html`). Ici il est posé une fois, sur
 * tous les écrans : chaque entrée garde le droit de workflow qui la gardait.
 */
export function Root() {
  const { init, currentApp } = useEdificeClient();
  if (!init) return <LoadingScreen position={false} />;

  return (
    <StructureProvider>
      <Layout>
        <AppHeader>{currentApp && <Breadcrumb app={currentApp} />}</AppHeader>
        <div className="competences-layout mt-16">
          <TeacherMenu />
          <main className="min-w-0">
            <Outlet />
          </main>
        </div>
        <UiSwitchBanner />
      </Layout>
    </StructureProvider>
  );
}

function TeacherMenu() {
  const { t } = useTranslation(['competences', 'common']);
  const { rights } = useStructure();
  return (
    <nav className="competences-menu" aria-label={t('competences.react.navigation')}>
      <ul className="list-unstyled d-flex flex-column gap-4 mb-0">
        <li>
          <NavLink to="/" end>
            {t('home')}
          </NavLink>
        </li>
        {TEACHER_MENU.filter((entry) => rights[entry.right]).map((entry) => (
          <li key={entry.path}>
            <NavLink to={entry.path}>{t(entry.label)}</NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default Root;
