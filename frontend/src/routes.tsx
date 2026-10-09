import { Navigate, RouteObject, createHashRouter } from 'react-router-dom';

import { DevoirsList } from './screens/DevoirsList';
import { NotMigrated } from './screens/NotMigrated';
import { Root } from './screens/Root';
import { TeacherHome } from './screens/TeacherHome';

/**
 * Les chemins sont ceux de l'IHM AngularJS enseignant, à l'identique (cf. `public/ts/teachers.ts`) :
 * un lien copié dans l'une des deux interfaces reste valide dans l'autre.
 *
 * Seul l'espace ENSEIGNANT est servi par cette interface : le serveur garde élèves et parents sur
 * l'AngularJS (`CompetencesController#view`), dont les routes portent les mêmes noms avec un autre
 * sens (`/releve`, `/bulletin`…).
 *
 * Les écrans non encore portés tombent sur {@link NotMigrated}, qui renvoie vers l'ancienne IHM EN
 * CONSERVANT le chemin et sa requête.
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Root />,
    children: [
      { index: true, element: <TeacherHome /> },
      { path: 'devoirs/list', element: <DevoirsList /> },

      // ── Écrans restant à porter ───────────────────────────────────────────
      { path: 'devoir/create', element: <NotMigrated /> },
      { path: 'devoir/:idDevoir/edit', element: <NotMigrated /> },
      { path: 'devoir/:devoirId', element: <NotMigrated /> },
      { path: 'releve', element: <NotMigrated /> },
      { path: 'competences/eleve', element: <NotMigrated /> },
      { path: 'competences/classe', element: <NotMigrated /> },
      { path: 'projets', element: <NotMigrated /> },
      { path: 'conseil/de/classe', element: <NotMigrated /> },
      { path: 'export', element: <NotMigrated /> },
      { path: 'disabled', element: <NotMigrated /> },
      { path: 'bulletin', element: <NotMigrated /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];

// Hash router : l'app est servie sous `/competences` (route serveur unique `@Get("")`), le routage
// se fait dans le fragment — c'est déjà la convention de l'IHM AngularJS, dont on reprend les
// chemins.
export const router = createHashRouter(routes);
