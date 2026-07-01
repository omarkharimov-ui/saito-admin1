'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import { toast } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { MeshBroadcaster } from '@/lib/mesh/Broadcaster';
import { localStore } from '@/lib/sync/OfflineStore';
import type {
  PosProduct,
  PosTable,
  PosCart,
  PosCartItem,
  PosModifier,
  PosModifierSelection,
  PaymentInfo,
  FloorConfig,
  TableStatus,
} from '../types/shared';

const POS_CACHE_KEY = 'saito_pos_cache';
const POS_CART_KEY = 'saito_pos_cart';
const POS_DATA_KEY = 'saito_pos_data';

function loadCache<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; } catch { return fallback; }
}

function saveCache(key: string, data: unknown) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
}

export function usePos() {
  const { t, language } = useLanguage();
  const [, forceUpdate] = useState(0);
  const languageRef = useRef(language);
  languageRef.current = language;

  /* ── State ── */
  const cached = typeof window !== 'undefined' ? loadCache<{ tables: PosTable[]; floors: FloorConfig[]; products: PosProduct[]; categories: { id: string; name: string }[]; combos: any[] } | null>(POS_DATA_KEY, null) : null;
  const [tables, setTables] = useState<PosTable[]>(cached?.tables || []);
  const [floors, setFloors] = useState<FloorConfig[]>(cached?.floors || []);
  const [products, setProducts] = useState<PosProduct[]>(cached?.products || []);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>(cached?.categories || []);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [variants, setVariants] = useState<any[]>([]);
  const [combos, setCombos] = useState<any[]>([]);
  const [loading, setLoading] = useState(!cached);
  const [selectedTable, setSelectedTable] = useState<PosTable | null>(null);
  const [lastUndo, setLastUndo] = useState<{ action: string; data: any; message: string } | null>(null);
  const [cart, setCart] = useState<PosCart | null>(null);
  const cartRef = useRef<PosCart | null>(null);
  const [activeView, setActiveView] = useState<'floor' | 'order' | 'billing'>('floor');
  const [orderHistory, setOrderHistory] = useState<any[]>([]);
  const orderFingerprintRef = useRef<Record<number, string>>({});

  // Keep cartRef in sync
  cartRef.current = cart;

  /* ── Data Fetching ── */
  const fetchData = useCallback(async () => {
    try {
      const [tablesRes, productsRes] = await Promise.all([
        fetch('/api/pos/tables').catch(() => ({ ok: false })),
        fetch('/api/pos/products').catch(() => ({ ok: false })),
      ]);

      let newTables: PosTable[] = [];
      let newFloors: FloorConfig[] = [];
      let newProducts: PosProduct[] = [];
      let newCategories: { id: string; name: string }[] = [];
      let newCombos: any[] = [];

      if (tablesRes && 'ok' in tablesRes && tablesRes.ok) {
        const data = await (tablesRes as Response).json();
        newTables = data.tables || [];
        newFloors = data.floors || [];
        setTables(newTables);
        setFloors(newFloors);
      }
      
      if (productsRes && 'ok' in productsRes && productsRes.ok) {
        const data = await (productsRes as Response).json();
        newProducts = data.products || [];
        newCategories = data.categories || [];
        newCombos = data.combos || [];
        setProducts(newProducts);
        setCategories(newCategories);
        setCombos(newCombos);
        if (data.ingredients) setIngredients(data.ingredients);
        if (data.recipes) setRecipes(data.recipes);
        if (data.variants) setVariants(data.variants);
      }

      // If we got valid data, save to cache
      if (newTables.length > 0 || newProducts.length > 0) {
        saveCache(POS_DATA_KEY, { tables: newTables, floors: newFloors, products: newProducts, categories: newCategories, combos: newCombos });
      } else {
        // If fetch failed or returned empty (offline), try to load from cache immediately
        const cachedData = loadCache<{ tables: PosTable[]; floors: FloorConfig[]; products: PosProduct[]; categories: { id: string; name: string }[]; combos: any[] } | null>(POS_DATA_KEY, null);
        if (cachedData) {
          setTables(cachedData.tables);
          setFloors(cachedData.floors);
          setProducts(cachedData.products);
          setCategories(cachedData.categories);
          setCombos(cachedData.combos || []);
        }
      }
    } catch (e) {
      console.error('POS fetch error:', e);
      // Fallback to cache on any error
      const cachedData = loadCache<{ tables: PosTable[]; floors: FloorConfig[]; products: PosProduct[]; categories: { id: string; name: string }[]; combos: any[] } | null>(POS_DATA_KEY, null);
      if (cachedData) {
        setTables(cachedData.tables);
        setFloors(cachedData.floors);
        setProducts(cachedData.products);
        setCategories(cachedData.categories);
        setCombos(cachedData.combos || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  /* ── Background Sync ── */
  const syncOfflineLogs = useCallback(async () => {
    if (!navigator.onLine) return;
    
    const unsynced = await localStore.getUnsyncedLogs();
    if (unsynced.length === 0) return;

    console.log(`[Sync] Attempting to sync ${unsynced.length} offline actions...`);

    for (const log of unsynced) {
      try {
        if (log.type === 'ORDER_NEW') {
          const res = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(log.data),
          });
          if (res.ok) await localStore.markAsSynced(log.timestamp);
        }
        // Add other sync types here (payments, status updates)
      } catch (e) {
        console.error('[Sync] Failed to sync log:', log, e);
      }
    }
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const handler = () => syncOfflineLogs();
    window.addEventListener('online', handler);
    // Periodically check every 30s
    const interval = setInterval(syncOfflineLogs, 30000);
    return () => {
      window.removeEventListener('online', handler);
      clearInterval(interval);
    };
  }, [syncOfflineLogs]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── Realtime (debounced: batch rapid changes into one call) ── */
  useEffect(() => {
    const timerRef = { current: null as ReturnType<typeof setTimeout> | null };
    const debouncedFetch = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(fetchData, 300);
    };

    const channel = createRealtimeChannel(`pos-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_floors' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_logs' }, debouncedFetch)
      .subscribe();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); removeRealtimeChannel(channel); };
  }, [fetchData]);

  /* ── Polling fallback ── */
  useEffect(() => {
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  /* ── Cart persistence ── */
  useEffect(() => {
    const saved = loadCache<PosCart | null>(POS_CART_KEY, null);
    if (saved) setCart(saved);
  }, []);

  // Removed auto-save useEffect to prevent saving unsaved changes on back navigation

  /* ── Table Selection ── */
  const selectTable = useCallback((table: PosTable) => {
    setSelectedTable(table);
    setActiveView('order');
    const existing = loadCache<Record<number, PosCart>>(POS_CART_KEY + '_all', {});
    const saved = existing[table.table_number];
    
    // If we have a saved cart with items, use it regardless of table status
    if (saved && (saved.items.length > 0 || table.status !== 'empty')) {
      setCart(saved);
    } else {
      // If table is reserved, pull info from the table object
      setCart({
        table_id: table.id,
        table_number: table.table_number,
        guest_count: table.guest_count || 1,
        items: [],
        notes: table.reservation_name ? `Rezervasiya: ${table.reservation_name}` : '',
        order_type: 'dine_in',
      });
    }
  }, []);

  const activateReservedTable = useCallback(async (table: PosTable) => {
    if (!table.id) {
      throw new Error('Masa ID-si tapılmadı. Səhifəni yeniləyin.');
    }
    try {
      setLoading(true);
      const res = await fetch('/api/tables/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_id: table.id }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || "Aktivləşdirmə xətası");
      }
      await fetchData();
      const updatedTable = tables.find(t => t.table_number === table.table_number);
      if (updatedTable) {
        const cart: PosCart = {
          table_id: updatedTable.id,
          table_number: updatedTable.table_number,
          guest_count: updatedTable.guest_count || 1,
          items: [],
          notes: '',
          order_type: 'dine_in',
        };
        // Load pre-order items into cart from the created order
        if (Array.isArray(result.items)) {
          cart.items = result.items.map((oi: any) => ({
            id: oi.product_id,
            name: oi.product_name,
            quantity: oi.quantity,
            unit_price: oi.unit_price,
            total_price: oi.total_price,
            modifiers: typeof oi.modifiers === 'string' ? JSON.parse(oi.modifiers) : (oi.modifiers || []),
            special_notes: oi.special_notes || '',
            kitchen_status: oi.kitchen_status || 'pending',
            category_id: '',
          }));
        }
        setCart(cart);
        setSelectedTable({ ...updatedTable, status: 'occupied' });
        setActiveView('order');
      }
      toast.success("Masa aktivləşdirildi və sessiya yaradıldı");
    } finally {
      setLoading(false);
    }
  }, [fetchData, tables]);

  const dismissTable = useCallback(async (tableNumber: number) => {
    if (!confirm(`Masa ${tableNumber} boşaldılsın? (Bütün aktiv sifarişlər ləğv ediləcək)`)) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/orders/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_number: tableNumber }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result?.error || 'Failed to dismiss table');
      }

      const resetTable = (t: PosTable): PosTable => ({
        ...t, status: 'empty' as const, reservation_id: null as any, reservation_name: null, reservation_phone: null, reservation_time: null, guest_count: 0, merged_into_table: null, total_amount: 0, order_count: 0, order_ids: [], merged_orders: [], has_pending: false
      });

      setTables(prev => prev.map(t =>
        t.table_number === tableNumber ? resetTable(t) : t
      ));

      setFloors(prev => prev.map(f => ({
        ...f,
        tables: f.tables?.map(t =>
          t.table_number === tableNumber ? resetTable(t) : t
        )
      })));

      const all = loadCache<Record<number, PosCart>>(POS_CART_KEY + '_all', {});
      delete all[tableNumber];
      saveCache(POS_CART_KEY + '_all', all);
      delete orderFingerprintRef.current[tableNumber];
      toast.success(`Masa ${tableNumber} təmizləndi`);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Boşaltma xətası');
      fetchData();
    } finally {
      setLoading(false);
    }
  }, [fetchData]);

  const checkStock = useCallback((productId: string, qty: number = 1): boolean => {
    const product = products.find(p => p.id === productId);
    if (!product) return true;

    // 1. Direct ingredient check
    const directIngId = (product as any).direct_ingredient_id;
    if (directIngId) {
      const ing = ingredients.find(i => i.id === directIngId);
      if (ing && ing.current_stock < qty) {
        toast.error(`"${ing.name}" tükənib. Stok: ${ing.current_stock}`);
        return false;
      }
    }

    // 2. Recipe check
    const productRecipes = recipes.filter(r => r.product_id === productId);
    if (productRecipes.length > 0) {
      for (const r of productRecipes) {
        const ing = ingredients.find(i => i.id === r.ingredient_id);
        if (ing && ing.current_stock < (r.quantity_required * qty)) {
          toast.error(`"${ing.name}" kifayət qədər yoxdur. Lazımdır: ${r.quantity_required * qty}, Stok: ${ing.current_stock}`);
          return false;
        }
      }
    }
    return true;
  }, [products, ingredients, recipes]);

  const backToFloor = useCallback(() => {
    // 1. Get latest cart from ref
    const currentCart = cartRef.current;
    
    // 2. Task 14: Confirm if unsaved changes exist
    const hasUnsaved = currentCart?.items.some(it => !it.sentQuantity || it.quantity !== it.sentQuantity);
    if (hasUnsaved && !confirm('Yadda saxlanılmamış dəyişikliklər silinəcək. Davam edək?')) return;

    // 3. Discard draft changes
    if (currentCart && currentCart.items.length > 0) {
      const all = loadCache<Record<number, PosCart>>(POS_CART_KEY + '_all', {});
      const confirmedItems = currentCart.items
        .map(item => ({ 
          ...item, 
          quantity: item.sentQuantity || 0,
          total_price: item.unit_price * (item.sentQuantity || 0)
        }))
        .filter(item => item.quantity > 0);

      if (confirmedItems.length > 0) {
        all[currentCart.table_number] = { ...currentCart, items: confirmedItems };
        saveCache(POS_CART_KEY + '_all', all);
      } else {
        delete all[currentCart.table_number];
        saveCache(POS_CART_KEY + '_all', all);
      }
    }
    
    setSelectedTable(null);
    setActiveView('floor');
    setCart(null); 
    cartRef.current = null;
  }, []);

  /* ── Cart Operations ── */
  const addToCart = useCallback((product: PosProduct, modifiers?: PosModifierSelection[], notes?: string, variantId?: string) => {
    // Task 4: Stock check
    if (!checkStock(product.id, 1)) return;

    const currentCart = cartRef.current;
    if (!currentCart) return;
    const langs = languageRef.current;
    const key = `${product.id}__${variantId || 'base'}__${modifiers?.map(m => m.id).sort().join(',') || ''}`;
    const existing = currentCart.items.find(i => {
      const existingModifiers = (i.modifiers ?? []).map(m => m.id).sort().join(',');
      const ek = `${i.product_id}__${i.variant_id || 'base'}__${existingModifiers}`;
      return ek === key;
    });

    if (existing) {
      if (!checkStock(product.id, existing.quantity + 1)) return;
      setCart(prev => prev ? {
        ...prev,
        items: prev.items.map(i =>
          i === existing ? { ...i, quantity: i.quantity + 1, total_price: i.unit_price * (i.quantity + 1) } : i
        ),
      } : null);
    } else {
      // Use server-computed effective_price (campaign engine owns all pricing)
      let basePrice = product.effective_price?.effective_price ?? product.price ?? 0;
      if (modifiers?.length) {
        basePrice += modifiers.reduce((s, m) => s + m.price, 0) * (basePrice / (product.price || 1));
      }

      const unitPrice = Math.round(basePrice * 100) / 100;
      const localizedName = langs === 'az' ? product.name_az : langs === 'en' ? product.name_en : product.name_ru;
      const newItem: PosCartItem = {
        product_id: product.id,
        product_name: localizedName || product.name,
        product_image: product.image_url ?? null,
        unit_price: unitPrice,
        total_price: unitPrice,
        quantity: 1,
        modifiers: modifiers || [],
        special_notes: notes || '',
        variant_id: variantId,
      };
      setCart(prev => prev ? { ...prev, items: [...prev.items, newItem] } : null);
    }
    forceUpdate(n => n + 1);
  }, [checkStock]);

  const addComboToCart = useCallback((combo: any) => {
    const currentCart = cartRef.current;
    if (!currentCart) return;

    if (!combo.is_in_stock) return;

    const langs = languageRef.current;
    const comboItems = (combo.items || []) as any[];
    
    if (comboItems.length === 0) return;

    const comboComponents = comboItems.map(ci => {
      const product = Array.isArray(ci.product) ? ci.product[0] : ci.product;
      const price = product?.price || 0;
      return {
        product_id: ci.product_id,
        product_name: product?.name || 'Məhsul',
        variant_id: ci.variant_id || null,
        quantity: ci.quantity || 1,
        unit_price: price,
        total_price: price * (ci.quantity || 1),
      };
    });

    let basePrice = combo.effective_price ?? combo.price ?? 0;

    const localizedName = langs === 'az' ? combo.name_az : langs === 'en' ? combo.name_en : langs === 'ru' ? combo.name_ru : combo.name;
    const newItem: PosCartItem = {
      product_id: combo.id,
      product_name: `Kombo: ${localizedName || combo.name}`,
      product_image: combo.image_url ?? null,
      unit_price: basePrice,
      total_price: basePrice,
      quantity: 1,
      modifiers: [],
      special_notes: '',
      is_combo: true,
      combo_id: combo.id,
      combo_components: comboComponents,
    };

    setCart(prev => prev ? { ...prev, items: [...prev.items, newItem] } : null);
    forceUpdate(n => n + 1);
  }, []);

  const updateCartItemQty = useCallback((index: number, delta: number) => {
    setCart(prev => {
      if (!prev) return null;
      const items = [...prev.items];
      const item = items[index];
      const newQty = item.quantity + delta;
      
      // Stock check on increase
      if (delta > 0 && !checkStock(item.product_id, newQty)) return prev;

      if (newQty <= 0) {
        items.splice(index, 1);
      } else {
        items[index] = { ...items[index], quantity: newQty, total_price: items[index].unit_price * newQty };
      }
      return { ...prev, items };
    });
  }, [checkStock]);

  const removeCartItem = useCallback((index: number) => {
    setCart(prev => prev ? { ...prev, items: prev.items.filter((_, i) => i !== index) } : null);
  }, []);

  const clearCart = useCallback(() => {
    const currentTable = selectedTable?.table_number ?? cartRef.current?.table_number;
    
    // Clear all state immediately
    setCart(null);
    cartRef.current = null;
    
    if (typeof currentTable === 'number') {
      const all = loadCache<Record<number, PosCart>>(POS_CART_KEY + '_all', {});
      delete all[currentTable];
      saveCache(POS_CART_KEY + '_all', all);
      delete orderFingerprintRef.current[currentTable];
    }
    
    saveCache(POS_CART_KEY, null);
    
    toast.success('Səbət təmizləndi');
  }, [selectedTable]);

  /* ── Order Operations ── */
  const cartFingerprint = (items: any[]) => items
    .map(item => `${item.product_id}:${item.variant_id || 'base'}:${item.quantity}:${item.unit_price}:${item.special_notes || ''}:${(item.modifiers ?? []).map((m: any) => m.id).sort().join(',')}`)
    .join('|');

  const placeOrder = useCallback(async () => {
    const currentCart = cartRef.current;
    if (!currentCart || currentCart.items.length === 0) return;

    const fingerprint = cartFingerprint(currentCart.items);
    const lastFingerprint = orderFingerprintRef.current[currentCart.table_number];
    const resendOnlyIfChanged = currentCart.items.every(item => (item.sentQuantity || 0) >= item.quantity);
    const hasChangedSinceLastSend = lastFingerprint !== fingerprint || currentCart.items.some(item => {
      const sent = item.sentQuantity || 0;
      return item.quantity !== sent || (item.special_notes || '') !== '';
    });
    if (!hasChangedSinceLastSend && resendOnlyIfChanged) {
      toast('Mətbəxə artıq göndərilib');
      return;
    }

    try {
      const orderItems = currentCart.items.flatMap(item => {
        if (item.is_combo && item.combo_components && item.combo_components.length > 0) {
          const components = item.combo_components.map(comp => ({
            product_id: comp.product_id,
            variant_id: comp.variant_id || null,
            quantity: item.quantity * comp.quantity,
            unit_price: comp.unit_price,
            total_price: comp.unit_price * item.quantity * comp.quantity,
            modifiers: JSON.stringify([]),
            special_notes: `Kombo: ${item.product_name}`,
          }));
          return components;
        }
        return [{
          product_id: item.product_id,
          variant_id: item.variant_id || null,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.unit_price * item.quantity,
          modifiers: JSON.stringify(item.modifiers),
          special_notes: item.special_notes,
        }];
      });

      const totalAmount = orderItems.reduce((s, i) => s + i.total_price, 0);

      const orderPayload = {
        id: `offline-${Date.now()}`,
        table_number: currentCart.table_number,
        total_amount: totalAmount,
        status: 'confirmed',
        order_type: currentCart.order_type,
        guest_count: currentCart.guest_count,
        customer_note: currentCart.notes || null,
        items: orderItems,
        source: 'pos',
        created_at: new Date().toISOString(),
      };

      // Broadcast to local mesh immediately (Offline sync)
      MeshBroadcaster.sendOrder(orderPayload);

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_number: currentCart.table_number,
          total_amount: totalAmount,
          status: 'confirmed',
          guest_count: currentCart.guest_count,
          customer_note: currentCart.notes || null,
          items: orderItems,
        }),
      });

      if (!res.ok) throw new Error((await res.json()).error || 'Failed to place order');

      toast.success(`Masa ${currentCart.table_number} — sifariş göndərildi`);

      orderFingerprintRef.current[currentCart.table_number] = fingerprint;

      // Mark all items as sent
      const updatedCart = {
        ...currentCart,
        items: currentCart.items.map(item => ({ ...item, sentQuantity: item.quantity })),
      };

      setCart(updatedCart);

      // Save the confirmed state to persistent cache
      const all = loadCache<Record<number, PosCart>>(POS_CART_KEY + '_all', {});
      all[currentCart.table_number] = updatedCart;
      saveCache(POS_CART_KEY + '_all', all);

      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Xəta baş verdi');
      throw e;
    }
  }, [fetchData]);

  const clearDrafts = useCallback(() => {
    const currentCart = cartRef.current;
    if (!currentCart || currentCart.items.length === 0) return;

    const hasDraft = currentCart.items.some(item =>
      !item.sentQuantity || item.quantity !== item.sentQuantity
    );

    if (!hasDraft) {
      toast('Sifariş artıq mətbəxə göndərilib');
      return;
    }

    setCart(prev => {
      if (!prev) return null;
      const items = prev.items
        .map(item => {
          if (!item.sentQuantity) return null; // new item → remove
          if (item.quantity !== item.sentQuantity) {
            // reset to sent quantity (handles both increase and decrease)
            return { ...item, quantity: item.sentQuantity, total_price: item.unit_price * item.sentQuantity };
          }
          return item; // sent item, unchanged
        })
        .filter(Boolean) as PosCartItem[];
      return { ...prev, items };
    });
  }, []);

  /* ── Billing ── */
  const closeBill = useCallback(async (orderId: string, payment: PaymentInfo) => {
    const tableNum = cartRef.current?.table_number;
    try {
      const res = await fetch(`/api/orders/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          payment_method: payment.method,
          cash_amount: payment.cash_amount,
          card_amount: payment.card_amount,
          tip_amount: payment.tip,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Payment failed');
      
      // Clear localStorage cart on success
      if (tableNum) {
        try {
          const raw = localStorage.getItem('saito_pos_cart_all');
          if (raw) {
            const all = JSON.parse(raw);
            delete all[tableNum];
            localStorage.setItem('saito_pos_cart_all', JSON.stringify(all));
          }
        } catch {} // eslint-disable-line no-empty
      }
      
      toast.success('Hesab bağlandı');
      cartRef.current = null;
      await fetchData();
      backToFloor();
    } catch (e: any) {
      toast.error(e.message || 'Ödəniş xətası');
      await fetchData();
    }
  }, [backToFloor, fetchData, t]);

  /* ── Undo stack ── */
  const undoStackRef = useRef<{ action: string; data: any; message: string }[]>([]);

  const showUndo = useCallback((undoAction: string, undoData: any, message: string) => {
    const item = { action: undoAction, data: undoData, message };
    undoStackRef.current.push(item);
    setLastUndo(item);
    const timeout = setTimeout(() => {
      undoStackRef.current = undoStackRef.current.filter(u => u.data !== undoData);
      setLastUndo(prev => prev?.data === undoData ? null : prev);
    }, 10000);
    toast(
      (t: any) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>{message}</span>
          <button
            onClick={async () => {
              toast.dismiss(t.id);
              clearTimeout(timeout);
              undoStackRef.current = undoStackRef.current.filter(u => u.data !== undoData);
              try {
                const res = await fetch('/api/orders/undo', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: undoAction, data: undoData }),
                });
                if (!res.ok) throw new Error((await res.json()).error);
                toast.success('Geri alındı');
                fetchData();
              } catch (e: any) {
                toast.error(e.message || 'Geri alma xətası');
              }
            }}
            style={{
              padding: '4px 12px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.1)',
              color: 'white',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Geri al
          </button>
        </div>
      ),
      { duration: 10000 }
    );
  }, [fetchData]);

  /* ── Transfer Table ── */
  const transferTable = useCallback(async (fromTable: number, toTable: number) => {
    // 1. Move the cart in localStorage first
    try {
      const raw = localStorage.getItem(POS_CART_KEY + '_all');
      if (raw) {
        const all = JSON.parse(raw);
        if (all[fromTable]) {
          // Transfer the cart object to the new key
          all[toTable] = { ...all[fromTable], table_number: toTable };
          delete all[fromTable];
          localStorage.setItem(POS_CART_KEY + '_all', JSON.stringify(all));
        }
      }
    } catch (e) {
      console.error('Local cart transfer failed:', e);
    }

    // 2. Call the API to move the database order
    const res = await fetch('/api/orders/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_table: fromTable, to_table: toTable }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    if (data.undo) showUndo('transfer', data.undo, `Masa ${fromTable} → Masa ${toTable}`);

    // 3. Clear fingerprints and sync states
    delete orderFingerprintRef.current[fromTable];
    
    // If the currently selected table was the source, switch to target or clear
    if (selectedTable?.table_number === fromTable) {
      const targetTable = tables.find(t => t.table_number === toTable);
      if (targetTable) {
        setSelectedTable(targetTable);
        // Cart state will be updated by the next select/fetch
      } else {
        backToFloor();
      }
    }

    await new Promise(r => setTimeout(r, 400));
    fetchData();
    return data;
  }, [fetchData, showUndo, tables, selectedTable, backToFloor]);

  /* ── Merge Tables ── */
  const mergeTables = useCallback(async (tableNumbers: number[]) => {
    if (tableNumbers.length < 2) return;
    try {
      const res = await fetch('/api/orders/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_numbers: tableNumbers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.undo) {
        showUndo('merge', data.undo, `Masalar ${tableNumbers.join(' + ')} birləşdirildi`);
      } else {
        toast.success(`Masalar ${tableNumbers.join(' + ')} birləşdirildi`);
      }
      fetchData();
    } catch (e: any) {
      toast.error(e.message);
    }
  }, [fetchData, showUndo]);

  const splitTables = useCallback(async (primaryTableNumber: number, childTableNumbers: number[]) => {
    try {
      setLoading(true);
      const res = await fetch('/api/orders/unmerge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          primary_table_number: primaryTableNumber,
          child_table_numbers: childTableNumbers 
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ayırma xətası");
      
      toast.success(`Masalar ayrıldı`);
      await fetchData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [fetchData]);

  const performUndo = useCallback(async () => {
    const log = lastUndo;
    if (!log) return;
    try {
      const res = await fetch('/api/orders/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: log.action, data: log.data }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('Geri alındı');
      setLastUndo(null);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Geri alma xətası');
    }
  }, [lastUndo, fetchData]);

  return {
    language, tables, floors, products, categories, combos, loading,
    selectedTable, cart, activeView, orderHistory, lastUndo,
    selectTable, backToFloor, performUndo, activateReservedTable,
    addToCart, addComboToCart, updateCartItemQty, removeCartItem, clearCart, clearDrafts,
    placeOrder, closeBill, transferTable, mergeTables, splitTables, dismissTable,
    setActiveView, setCart, setSelectedTable, setTables,
    fetchData,
  };
}
