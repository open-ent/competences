import { AppHeader, Breadcrumb, Layout, LoadingScreen, useEdificeClient } from '@open-ent/react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router-dom';

import * as api from '../api';
import { FamilyProvider, useFamily } from '../familyContext';

const FAMILY_MENU = [
  { path: '/devoirs/list', label: 'evaluations.test.list' },
  { path: '/releve', label: 'evaluations.releve.title' },
  { path: '/competences/eleve', label: 'evaluations.bilan.competence.title' },
  { path: '/bulletin', label: 'evaluations.bulletin' },
];

/**
 * Gabarit de l'espace des élèves et des parents (`eval_parents.html`) : choix de l'enfant pour un
 * parent, menu à gauche, écran à droite. Les chemins sont ceux de l'AngularJS (`parents.ts`).
 */
export function FamilyRoot() {
  const { init, currentApp } = useEdificeClient();
  if (!init) return <LoadingScreen position={false} />;
  return (
    <FamilyProvider>
      <Layout>
        <AppHeader>{currentApp && <Breadcrumb app={currentApp} />}</AppHeader>
        <ChildPicker />
        <div className="competences-layout mt-16">
          <FamilyMenu />
          <main className="min-w-0">
            <Outlet />
          </main>
        </div>
      </Layout>
    </FamilyProvider>
  );
}

/** Les enfants du parent, avec leur photo (`eval_parent_selectEnfants.html`). */
function ChildPicker() {
  const { t } = useTranslation(['competences', 'common']);
  const { isParent, children, child, setChildId } = useFamily();
  if (!isParent || children.length < 2) return null;
  return (
    <div className="d-flex flex-wrap gap-12 mt-16" role="group" aria-label={t('competences.react.famille.children')}>
      {children.map((c) => {
        const selected = c.id === child?.id;
        return (
          <button
            key={c.id}
            type="button"
            className={`btn d-flex align-items-center gap-8 ${selected ? 'btn-primary' : 'btn-outline-primary'}`}
            aria-pressed={selected}
            onClick={() => setChildId(c.id)}
          >
            <img
              src={api.studentPictureUrl(c)}
              alt=""
              width={32}
              height={32}
              className="rounded-circle object-fit-cover"
              onError={(e) => {
                e.currentTarget.style.visibility = 'hidden';
              }}
            />
            {c.firstName}
          </button>
        );
      })}
    </div>
  );
}

function FamilyMenu() {
  const { t } = useTranslation(['competences', 'common']);
  return (
    <nav className="competences-menu" aria-label={t('competences.react.navigation')}>
      <ul className="list-unstyled d-flex flex-column gap-4 mb-0">
        <li>
          <NavLink to="/" end>
            {t('home')}
          </NavLink>
        </li>
        {FAMILY_MENU.map((entry) => (
          <li key={entry.path}>
            <NavLink to={entry.path}>{t(entry.label)}</NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default FamilyRoot;
