import { useEdificeClient, useHasWorkflow } from '@open-ent/react';
import { useQuery } from '@tanstack/react-query';
import { createContext, ReactNode, useContext, useMemo, useState } from 'react';

import * as api from './api';
import { ALL_WORKFLOWS, WORKFLOW, WorkflowKey } from './rights';
import { attachServices, Viewer } from './rules';
import type { Structure } from './types';

/**
 * L'établissement courant est un état PARTAGÉ par tous les écrans, comme `evaluations.structure`
 * dans l'AngularJS : changer d'établissement depuis l'accueil vaut aussi pour la liste.
 */
interface StructureContextValue {
  structures: Structure[];
  structureId: string;
  setStructureId: (id: string) => void;
  rights: Record<WorkflowKey, boolean>;
  /** `undefined` tant que les droits ne sont pas lus. */
  rightsLoaded: boolean;
  isLoading: boolean;
}

const StructureContext = createContext<StructureContextValue | null>(null);

/** Date LOCALE du jour (`moment()` de l'AngularJS), et non celle de Greenwich. */
const today = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

export function StructureProvider({ children }: { children: ReactNode }) {
  const { user } = useEdificeClient();

  // Seuls les établissements où le module « notes » est actif sont proposés, dans l'ordre de la
  // session et sous leur nom de session (`model.ts` de l'AngularJS).
  const activeQuery = useQuery({ queryKey: ['competences', 'active-structures'], queryFn: api.getActiveStructureIds });
  const structures = useMemo<Structure[]>(() => {
    const active = new Set(activeQuery.data ?? []);
    return (user?.structures ?? [])
      .map((id, i) => ({ id, name: user?.structureNames?.[i] ?? id }))
      .filter((s) => active.has(s.id));
  }, [activeQuery.data, user]);

  const [chosen, setStructureId] = useState('');
  const structureId = structures.some((s) => s.id === chosen) ? chosen : (structures[0]?.id ?? '');

  const granted = useHasWorkflow(ALL_WORKFLOWS) as Record<string, boolean> | undefined;
  const rights = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(WORKFLOW) as WorkflowKey[]).map((key) => [key, !!granted?.[WORKFLOW[key]]]),
      ) as Record<WorkflowKey, boolean>,
    [granted],
  );

  const value = useMemo<StructureContextValue>(
    () => ({
      structures,
      structureId,
      setStructureId,
      rights,
      rightsLoaded: granted !== undefined,
      isLoading: activeQuery.isLoading,
    }),
    [structures, structureId, rights, granted, activeQuery.isLoading],
  );

  return <StructureContext.Provider value={value}>{children}</StructureContext.Provider>;
}

export function useStructure(): StructureContextValue {
  const value = useContext(StructureContext);
  if (!value) throw new Error('useStructure hors de StructureProvider');
  return value;
}

/** Qui regarde : identité, droit de direction, classes de professeur principal. */
export function useViewer(): Viewer | undefined {
  const { user } = useEdificeClient();
  const { rights } = useStructure();
  const detailsQuery = useQuery({
    queryKey: ['competences', 'user-details', user?.userId],
    queryFn: () => api.getUserDetails(user!.userId),
    enabled: !!user?.userId,
    staleTime: Infinity,
  });
  return useMemo(() => {
    if (!user || detailsQuery.isLoading) return undefined;
    return {
      userId: user.userId,
      isAdmin: rights.adminChefEtab,
      isPersEducNat: user.type === 'PERSEDUCNAT',
      // Fiche illisible : on perd la reconnaissance du professeur principal, pas tout l'écran.
      details: detailsQuery.data ?? {},
      today: today(),
    };
  }, [user, detailsQuery.data, detailsQuery.isLoading, rights.adminChefEtab]);
}

/**
 * Référentiels de l'établissement courant, chargés en parallèle comme `Structure.sync` le faisait.
 * Chacun est mis en cache par établissement : revenir sur un établissement déjà ouvert est
 * instantané.
 */
export function useStructureData() {
  const { structureId } = useStructure();
  const enabled = !!structureId;
  const key = (name: string) => ['competences', structureId, name];

  const classes = useQuery({
    queryKey: key('classes'),
    queryFn: async () => {
      const [raw, services] = await Promise.all([api.getClasses(structureId), api.getServices(structureId)]);
      return attachServices(raw, services);
    },
    enabled,
  });
  const matieres = useQuery({ queryKey: key('matieres'), queryFn: () => api.getMatieres(structureId), enabled });
  const types = useQuery({ queryKey: key('types'), queryFn: () => api.getTypes(structureId), enabled });
  const periodes = useQuery({ queryKey: ['competences', 'type-periodes'], queryFn: api.getTypePeriodes, staleTime: Infinity });
  const sousMatieres = useQuery({ queryKey: key('sous-matieres'), queryFn: () => api.getTypeSousMatieres(structureId), enabled });
  const enseignants = useQuery({ queryKey: key('enseignants'), queryFn: () => api.getEnseignants(structureId), enabled });
  const devoirs = useQuery({ queryKey: key('devoirs'), queryFn: () => api.getDevoirs(structureId), enabled });

  const all = [classes, matieres, types, periodes, sousMatieres, enseignants, devoirs];
  return {
    classes: classes.data ?? [],
    matieres: matieres.data ?? [],
    types: types.data ?? [],
    periodes: periodes.data ?? [],
    sousMatieres: sousMatieres.data ?? [],
    enseignants: enseignants.data ?? [],
    devoirs: devoirs.data ?? [],
    isLoading: all.some((q) => q.isLoading),
    isError: all.some((q) => q.isError),
  };
}
