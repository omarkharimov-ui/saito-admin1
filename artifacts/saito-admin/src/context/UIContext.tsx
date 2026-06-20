/**
 * @deprecated No longer used. Will be removed in the next cleanup pass.
 */

'use client';

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';

interface UIContextType {
  selectedProductId: string | null;
  isModalOpen: boolean;
  openProduct: (id: string) => void;
  closeProduct: () => void;
  // Smart Happy Hour Global State
  isHappyHourActive: boolean;
  happyHourProductId: string | null;
  setHappyHourState: (active: boolean, productId: string | null) => void;
  // QR Table Logic
  tableNumber: string | null;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export const UIProvider = ({ children }: { children: ReactNode }) => {
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Smart Happy Hour State
  const [isHappyHourActive, setIsHappyHourActive] = useState(false);
  const [happyHourProductId, setHappyHourProductId] = useState<string | null>(null);

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

    const checkHappyHour = async () => {
      const { data } = await supabase
        .from('campaigns')
        .select('*')
        .eq('type', 'HAPPY_HOUR')
        .eq('status', 'active')
        .maybeSingle();
      
      if (data) {
        const now = new Date();
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        
        const isStarted = !data.start_time || currentTime >= data.start_time;
        const isEnded = data.end_time && currentTime >= data.end_time;

        if (isStarted && !isEnded) {
          setIsHappyHourActive(true);
          setHappyHourProductId(data.target_id);
        } else {
          // If it's ended or hasn't started, we should deactivate it in DB too if it's currently active
          if (isEnded) {
            await supabase.from('campaigns').update({ status: 'inactive' }).eq('id', data.id);
            if (data.target_type === 'product') {
              await supabase.from('products').update({ discount_price: null }).eq('id', data.target_id);
            }
          }
          setIsHappyHourActive(false);
          setHappyHourProductId(null);
        }
      } else {
        setIsHappyHourActive(false);
        setHappyHourProductId(null);
      }
    };

    checkHappyHour();

    // Subscribe to changes
    const channel = createRealtimeChannel('campaigns_changes')
      .on('postgres_changes' as any, { event: '*', table: 'campaigns', schema: 'public' }, () => {
        checkHappyHour();
      })
      .subscribe();

    return () => {
      removeRealtimeChannel(channel);
    };
  }, []);

  const openProduct = (id: string) => {
    setSelectedProductId(id);
    setIsModalOpen(true);
  };

  const closeProduct = () => {
    setIsModalOpen(false);
    setTimeout(() => setSelectedProductId(null), 300); // Wait for animation to finish
  };

  const setHappyHourState = (active: boolean, productId: string | null) => {
    setIsHappyHourActive(active);
    setHappyHourProductId(productId);
  };

  return (
    <UIContext.Provider value={{ 
      selectedProductId, 
      isModalOpen, 
      openProduct, 
      closeProduct,
      isHappyHourActive,
      happyHourProductId,
      setHappyHourState,
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
