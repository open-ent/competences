import { Navigate, RouteObject, createHashRouter } from 'react-router-dom';

import { ConseilDeClasse } from './screens/ConseilDeClasse';
import { FamilyBilan } from './screens/FamilyBilan';
import { FamilyBulletin } from './screens/FamilyBulletin';
import { FamilyDevoir } from './screens/FamilyDevoir';
import { FamilyDevoirs, FamilyHome } from './screens/FamilyDevoirs';
import { FamilyReleve } from './screens/FamilyReleve';
import { FamilyRoot } from './screens/FamilyRoot';
import { DevoirFormScreen } from './screens/DevoirFormScreen';
import { DevoirsList } from './screens/DevoirsList';
import { Bulletins } from './screens/Bulletins';
import { Exports } from './screens/Exports';
import { NotMigrated } from './screens/NotMigrated';
import { Projets } from './screens/Projets';
import { Releve } from './screens/Releve';
import { Root } from './screens/Root';
import { SaisieDevoir } from './screens/SaisieDevoir';
import { SuiviClasse } from './screens/SuiviClasse';
import { SuiviEleve } from './screens/SuiviEleve';
import { TeacherHome } from './screens/TeacherHome';

/**
 * Les chemins sont ceux de l'IHM AngularJS enseignant, à l'identique (cf. `public/ts/teachers.ts`) :
 * un lien copié dans l'une des deux interfaces reste valide dans l'autre.
 *
 * Élèves et parents ont leur propre jeu de routes ({@link familyRoutes}) : les leurs portent les
 * mêmes noms avec un autre sens (`/releve`, `/bulletin`…). Le serveur les garde encore sur
 * l'AngularJS sauf `?ui=react` (`CompetencesController#view`), tant que leur espace n'est pas porté.
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
      { path: 'devoir/:devoirId', element: <SaisieDevoir /> },
      { path: 'devoir/create', element: <DevoirFormScreen mode="create" /> },
      { path: 'devoir/:idDevoir/edit', element: <DevoirFormScreen mode="edit" /> },
      { path: 'releve', element: <Releve /> },
      { path: 'competences/eleve', element: <SuiviEleve /> },
      { path: 'competences/classe', element: <SuiviClasse /> },
      { path: 'conseil/de/classe', element: <ConseilDeClasse /> },
      { path: 'projets', element: <Projets /> },

      // ── Écrans restant à porter ───────────────────────────────────────────
      { path: 'export', element: <Exports /> },
      { path: 'disabled', element: <NotMigrated /> },
      { path: 'bulletin', element: <Bulletins /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];

/**
 * Espace des élèves et des parents : mêmes chemins que l'AngularJS `parents.ts`, qui portent les
 * mêmes noms que ceux de l'enseignant avec un autre sens — d'où un jeu de routes à part.
 */
export const familyRoutes: RouteObject[] = [
  {
    path: '/',
    element: <FamilyRoot />,
    children: [
      { index: true, element: <FamilyHome /> },
      { path: 'devoirs/list', element: <FamilyDevoirs /> },
      { path: 'devoir/:devoirId', element: <FamilyDevoir /> },
      { path: 'competences/eleve', element: <FamilyBilan /> },
      { path: 'releve', element: <FamilyReleve /> },
      { path: 'bulletin', element: <FamilyBulletin /> },
      // Retiré du menu de l'AngularJS, encore joignable par lien.
      { path: 'bilan/periodique', element: <NotMigrated /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];

/** Profils servis par l'espace famille (`model.me.type` de l'AngularJS). */
export const isFamilyType = (type: string | undefined) => type === 'ELEVE' || type === 'PERSRELELEVE';

// Hash router : l'app est servie sous `/competences` (route serveur unique `@Get("")`), le routage
// se fait dans le fragment — c'est déjà la convention de l'IHM AngularJS, dont on reprend les
// chemins. Créé à la demande : un routeur créé écoute aussitôt le fragment.
export const createRouter = (family: boolean) => createHashRouter(family ? familyRoutes : routes);
