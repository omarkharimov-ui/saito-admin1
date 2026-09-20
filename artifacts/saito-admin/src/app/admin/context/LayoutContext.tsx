'use client';
import { createContext, useContext, useState, ReactNode, useCallback } from 'react';

interface LayoutContextType {
  isModalOpen: boolean;
  setIsModalOpen: (v: boolean) => void;
  /** v7.3: left edge of the main content area in px — the shell's own
      sidebar margin (290 open / 0 collapsed / 0 fullscreen), passed as
      STATE so overlays track the sidebar instantly (no polling/measuring). */
  mainEdge: number;
  mainBottom: number;
}
const LayoutContext = createContext<LayoutContextType>({
  isModalOpen: false,
  setIsModalOpen: () => {},
  mainEdge: 0,
  mainBottom: 0,
});

export function LayoutProvider({
  children,
  mainEdge = 0,
  mainBottom = 0,
}: {
  children: ReactNode;
  mainEdge?: number;
  mainBottom?: number;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  return (
    <LayoutContext.Provider value={{ isModalOpen, setIsModalOpen, mainEdge, mainBottom }}>
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  return useContext(LayoutContext);
}
