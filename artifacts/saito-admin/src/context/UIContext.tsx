/**
 * @deprecated No longer used. Will be removed in the next cleanup pass.
 */

'use client';

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';

interface UIContextType {
  selectedProductId: string | null;
  isModalOpen: boolean;
  openProduct: (id: string) => void;
  closeProduct: () => void;
  // QR Table Logic
  tableNumber: string | null;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export const UIProvider = ({ children }: { children: ReactNode }) => {
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // QR Table State
  const [tableNumber, setTableNumber] = useState<string | null>(null);

  useEffect(() => {
    // Check URL for table parameter
    const params = new URLSearchParams(window.location.search);
    const table = params.get('table');
    if (table) {
      setTableNumber(table);
      // Optional: Store in localStorage to persist across navigation
      localStorage.setItem('saito_table_number', table);
    } else {
      const storedTable = localStorage.getItem('saito_table_number');
      if (storedTable) setTableNumber(storedTable);
    }
  }, []);

  const openProduct = (id: string) => {
    setSelectedProductId(id);
    setIsModalOpen(true);
  };

  const closeProduct = () => {
    setIsModalOpen(false);
    setTimeout(() => setSelectedProductId(null), 300); // Wait for animation to finish
  };

  return (
    <UIContext.Provider value={{ 
      selectedProductId, 
      isModalOpen, 
      openProduct, 
      closeProduct,
      tableNumber
    }}>
      {children}
    </UIContext.Provider>
  );
};

export const useUI = () => {
  const context = useContext(UIContext);
  if (context === undefined) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
};
