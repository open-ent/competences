import { RouteObject, createHashRouter } from 'react-router-dom';

import { Dashboard } from './screens/Dashboard';
import { Evaluations } from './screens/Evaluations';
import { Root } from './screens/Root';
import { SaisieNotes } from './screens/SaisieNotes';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Root />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'evaluations', element: <Evaluations /> },
      { path: 'evaluations/:devoirId/notes', element: <SaisieNotes /> },
    ],
  },
];

// Hash router : app servie sous `/competences` (route serveur unique), routage dans le fragment. CCTP 51C.
export const router = createHashRouter(routes);
