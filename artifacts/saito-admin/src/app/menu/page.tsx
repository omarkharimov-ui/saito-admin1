'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus, ShoppingCart, X, Send } from 'lucide-react';

interface Product {
  id: string;
  name_az: string;
  name_en: string;
  name_ru: string;
  price: number;
  image_url?: string;
  category?: any;
}

interface CartItem extends Product {
  quantity: number;
}

export default function MenuPage({ searchParams }: { searchParams: Promise<{ table?: string }> }) {
  const [tableNumber, setTableNumber] = useState<number | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    searchParams.then(params => {
      if (params.table) setTableNumber(Number(params.table));
    });
    fetchProducts();
  }, [searchParams]);

  const fetchProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('id, name_az, name_en, name_ru, price, image_url, category:category_id(name_az, name_en, name_ru)')
      .eq('is_available', true)
      .eq('is_in_stock', true)
      .order('name_az', { ascending: true });
    if (data) setProducts(data);
    setLoading(false);
  };

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.id !== productId));
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === productId) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const sendToKitchen = async () => {
    if (!tableNumber || cart.length === 0) return;
    try {
      const items = cart.map(item => ({
        product_id: item.id,
        product_name: item.name_az || item.name_en || item.name_ru,
        quantity: item.quantity,
        unit_price: item.price,
        total_price: item.price * item.quantity,
      }));

      const res = await fetch('/api/orders/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_number: tableNumber,
          items,
          order_type: 'qr_order',
        }),
      });

      if (res.ok) {
        toast.success('Sifarişiniz qəbul edildi!');
        setCart([]);
      } else {
        toast.error('Xəta baş verdi');
      }
    } catch {
      toast.error('Xəta baş verdi');
    }
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const grouped = products.reduce((acc: any, p: any) => {
    const catName = p.category?.name_az || p.category?.name_en || p.category?.name_ru || 'Digər';
    if (!acc[catName]) acc[catName] = [];
    acc[catName].push(p);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-3xl font-bold text-center mb-2">Menyu</h1>
        {tableNumber && <p className="text-center text-gray-500 mb-6">Masa {tableNumber}</p>}

        {Object.entries(grouped).map(([cat, items]: any) => (
          <div key={cat} className="mb-8">
            <h2 className="text-xl font-semibold mb-4 pb-2 border-b">{cat}</h2>
            <div className="grid gap-4">
              {items.map((product: Product) => (
                <div key={product.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-4">
                  {product.image_url && (
                    <img src={product.image_url} alt="" className="w-16 h-16 rounded-xl object-cover" />
                  )}
                  <div className="flex-1">
                    <h3 className="font-semibold">{product.name_az || product.name_en || product.name_ru}</h3>
                    <p className="text-gold font-bold">₼{Number(product.price).toFixed(2)}</p>
                  </div>
                  <button
                    onClick={() => addToCart(product)}
                    className="w-10 h-10 rounded-full bg-gold text-black flex items-center justify-center font-bold text-xl hover:bg-yellow-500 transition-all active:scale-90"
                  >
                    +
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Cart FAB */}
      <AnimatePresence>
        {cart.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="bg-black text-white rounded-full px-6 py-4 shadow-2xl flex items-center gap-4">
              <div className="relative">
                <ShoppingCart size={24} />
                <span className="absolute -top-2 -right-2 bg-gold text-black text-xs font-black rounded-full w-5 h-5 flex items-center justify-center">
                  {cartCount}
                </span>
              </div>
              <div className="font-bold">₼{cartTotal.toFixed(2)}</div>
              <button
                onClick={sendToKitchen}
                className="bg-gold text-black px-4 py-2 rounded-full font-black text-sm hover:bg-yellow-500 transition-all active:scale-90 flex items-center gap-2"
              >
                <Send size={16} /> Göndər
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}