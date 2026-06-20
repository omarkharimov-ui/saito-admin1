'use client';
import { createContext, useContext, useState, ReactNode, useCallback } from 'react';

interface LayoutContextType {
  isModalOpen: boolean;
  setIsModalOpen: (v: boolean) => void;
}
const LayoutContext = createContext<LayoutContextType>({
  isModalOpen: false,
  setIsModalOpen: () => {},
});

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  return (
    <LayoutContext.Provider value={{ isModalOpen, setIsModalOpen }}>
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  return useContext(LayoutContext);
}
