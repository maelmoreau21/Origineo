'use client';

import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
} from 'react';

export type TreeWorkspaceMode = 'consultation' | 'modification';

type TreeWorkspaceContextValue = {
  mode: TreeWorkspaceMode;
  setMode: Dispatch<SetStateAction<TreeWorkspaceMode>>;
  isReadOnly: boolean;
};

const TreeWorkspaceContext = createContext<TreeWorkspaceContextValue | null>(null);

export function TreeWorkspaceProvider({
  value,
  children,
}: {
  value: TreeWorkspaceContextValue;
  children: ReactNode;
}) {
  return (
    <TreeWorkspaceContext.Provider value={value}>
      {children}
    </TreeWorkspaceContext.Provider>
  );
}

export function useTreeWorkspaceMode() {
  const context = useContext(TreeWorkspaceContext);
  if (!context) {
    throw new Error('useTreeWorkspaceMode must be used inside TreeWorkspaceProvider');
  }
  return context;
}
