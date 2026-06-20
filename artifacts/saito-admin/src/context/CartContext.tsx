/**
 * @deprecated No longer used. Will be removed in the next cleanup pass.
 */

'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { Product, ProductVariant } from '@/types';

export interface CartItem {
  id: string; // Unique ID for each cart item (allows duplicates)
  product: Product;
  variant: ProductVariant | null;
  quantity: number;
  unitPrice: number;
}

interface CartContextType {
  items: CartItem[];
  addItem: (product: Product, variant: ProductVariant | null, price: number) => void;
  removeItem: (id: string) => void;
  updateQty: (id: string, qty: number) => void;
  clearCart: () => void;
  totalCount: number;
  totalPrice: number;
  isCartOpen: boolean;
  setIsCartOpen: (v: boolean) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider = ({ children }: { children: React.ReactNode }) => {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  const addItem = useCallback((product: Product, variant: ProductVariant | null, price: number) => {
    // Hər əlavə etmə ayrıca səbət item-i yaradır (miqdar birləşdirməyi söndür)
    // Beləliklə, mətbəx hər sifarişi ayrıca görə bilər
    const newItem: CartItem = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      product,
      variant,
      quantity: 1,
      unitPrice: price
    };
    setItems(prev => [...prev, newItem]);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const updateQty = useCallback((id: string, qty: number) => {
    if (qty <= 0) { removeItem(id); return; }
    setItems(prev => prev.map(i =>
      i.id === id ? { ...i, quantity: qty } : i
    ));
  }, [removeItem]);

  const clearCart = useCallback(() => setItems([]), []);

  const totalCount = items.reduce((s, i) => s + i.quantity, 0);
  const totalPrice = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  return (
    <CartContext.Provider value={{
      items, addItem, removeItem, updateQty, clearCart,
      totalCount, totalPrice, isCartOpen, setIsCartOpen
    }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
};
