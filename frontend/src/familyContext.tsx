import { useEdificeClient } from '@open-ent/react';
import { useQuery } from '@tanstack/react-query';
import { createContext, ReactNode, useContext, useMemo, useState } from 'react';

import * as api from './api';
import { FamilyChild, selfChild } from './family';
import { levelsForCycle } from './saisie';

interface FamilyContextValue {
  isParent: boolean;
  children: FamilyChild[];
  child: FamilyChild | undefined;
  setChildId: (id: string) => void;
  isLoading: boolean;
}

const FamilyContext = createContext<FamilyContextValue | null>(null);

/** Date LOCALE du jour, comme la comparaient les écrans AngularJS (`moment()`). */
export const todayLocal = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/**
 * L'enfant suivi : l'élève lui-même, ou celui qu'a choisi le parent parmi les siens (le premier
 * par défaut, comme `Evaluations.sync`).
 */
export function FamilyProvider({ children: content }: { children: ReactNode }) {
  const { user } = useEdificeClient();
  const isParent = user?.type === 'PERSRELELEVE';
  const enfantsQuery = useQuery({ queryKey: ['competences', 'enfants'], queryFn: api.getEnfants, enabled: isParent });
  const children = useMemo<FamilyChild[]>(() => {
    if (isParent) return enfantsQuery.data ?? [];
    const self = user ? selfChild(user as Parameters<typeof selfChild>[0]) : null;
    return self ? [self] : [];
  }, [isParent, enfantsQuery.data, user]);
  const [chosen, setChildId] = useState('');
  const child = children.find((c) => c.id === chosen) ?? children[0];

  const value = useMemo(
    () => ({ isParent, children, child, setChildId, isLoading: isParent && enfantsQuery.isLoading }),
    [isParent, children, child, enfantsQuery.isLoading],
  );
  return <FamilyContext.Provider value={value}>{content}</FamilyContext.Provider>;
}

export function useFamily(): FamilyContextValue {
  const value = useContext(FamilyContext);
  if (!value) throw new Error('useFamily hors de FamilyProvider');
  return value;
}

/** Ce qu'il faut pour afficher les devoirs de l'enfant : devoirs, matières, enseignants, périodes. */
export function useChildData(child: FamilyChild) {
  const key = (name: string) => ['competences', 'famille', child.id, name];
  const devoirs = useQuery({ queryKey: key('devoirs'), queryFn: () => api.getStudentDevoirs(child) });
  const matieres = useQuery({
    queryKey: ['competences', child.idStructure, 'matieres-eleve'],
    queryFn: () => api.getStudentMatieres(child.idStructure),
  });
  const teachers = useQuery({
    queryKey: ['competences', child.idStructure, 'enseignants-eleve'],
    queryFn: () => api.getStudentTeachers(child.idStructure),
  });
  const periodes = useQuery({ queryKey: ['competences', 'periodes-classe', child.idClasse], queryFn: () => api.getPeriodesClasse(child.idClasse) });
  const cycles = useQuery({ queryKey: key('cycles'), queryFn: () => api.getCyclesEleve(child.id) });
  const maitrise = useQuery({ queryKey: ['competences', child.idStructure, 'maitrise'], queryFn: () => api.getMaitriseLevels(child.idStructure) });

  return useMemo(() => {
    const matiereNames = new Map((matieres.data ?? []).map((m) => [m.id, m.name]));
    const sousMatiere = (idMatiere: string, idSous: number | null | undefined) =>
      idSous == null
        ? ''
        : ((matieres.data ?? []).find((m) => m.id === idMatiere)?.sous_matieres ?? []).find((s) => s.id_type_sousmatiere === Number(idSous))
            ?.libelle ?? '';
    const teacherNames = new Map((teachers.data ?? []).map((t) => [t.id, t.displayName]));
    const idCycle = cycles.data?.[0]?.id_cycle ?? null;
    return {
      devoirs: devoirs.data ?? [],
      matiereNames,
      sousMatiere,
      teacherOf: (d: { owner: string; teacher?: string }) => d.teacher ?? teacherNames.get(d.owner) ?? '',
      periodes: (periodes.data ?? []).filter((p) => p.id !== null).sort((a, b) => a.id_type - b.id_type),
      cycles: cycles.data ?? [],
      idCycle,
      levels: levelsForCycle(maitrise.data ?? [], idCycle),
      isLoading: [devoirs, matieres, teachers, periodes, cycles, maitrise].some((q) => q.isLoading),
      isError: devoirs.isError,
    };
  }, [devoirs.data, devoirs.isError, matieres.data, teachers.data, periodes.data, cycles.data, maitrise.data, devoirs.isLoading, matieres.isLoading, teachers.isLoading, periodes.isLoading, cycles.isLoading, maitrise.isLoading]);
}
