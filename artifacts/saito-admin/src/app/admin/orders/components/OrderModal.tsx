'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Search, Plus, Minus, CheckCircle, Loader2,
  CreditCard, MoreVertical, AlertTriangle, Trash2, XCircle, Clock,
  GitMerge, Layers, Printer, ChevronLeft, Split,
  Utensils, ShoppingBag, Package, User, Users,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { Order, OrderItem, Product, ManualItem } from '../types';
import { ReceiptModal } from './ReceiptModal';
import { CustomerSelect } from './CustomerSelect';
import { BillSplitModal } from '@/app/admin/pos/components/BillSplitModal';
import { getStatusConfig, timeAgo } from '../utils';

interface OrderModalProps {
  order: Order;
  onClose: () => void;
  onRefresh: () => Promise<void> | void;
  onPay: (order: Order) => Promise<void>;
  onConfirm: (id: string) => Promise<void>;
  onClearTable: (tableNum: number) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  allOrders?: Order[];
  onOrdersUpdate?: (updater: (prev: Order[]) => Order[]) => void;
  inline?: boolean;
}

export const OrderModal = ({
  order, onClose, onRefresh, onPay, onConfirm, onClearTable, onDelete,
  allOrders = [], onOrdersUpdate, inline = false,
}: OrderModalProps) => {
  const { t, language } = useLanguage();
  const { lightMode } = useTheme();

  // Get localized product name from flat columns
  const getProductName = (item: OrderItem): string => {
    const p = item.products as any;
    if (language === 'en' && p?.name_en) return p.name_en;
    if (language === 'ru' && p?.name_ru) return p.name_ru;
    return p?.name_az || p?.name || item.product_name;
  };

  // Always get AZ name for DB writes (receipts, order_items inserts)
  const getAzProductName = (product: any, variantName?: string | null): string => {
    const azName = product?.name_az || product?.name;
    return variantName ? `${azName} (${variantName})` : azName;
  };
  const [acting, setActing]         = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const [confirmPay, setConfirmPay] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [showMenu, setShowMenu]     = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; right: number } | null>(null);
  const [cancelStep, setCancelStep] = useState<'none' | 'confirm' | 'select' | 'reason'>('none');
  const [cancelReason, setCancelReason] = useState('');
  const [isConfirming] = useState(false);
  const [showMerge, setShowMerge]   = useState(false);
  const [merging, setMerging]       = useState(false);
  const [unmerging, setUnmerging]   = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showSplit, setShowSplit] = useState(false);
  const [showCustomerSelect, setShowCustomerSelect] = useState(false);
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [guestCount, setGuestCount] = useState(order.guest_count || 1);
  const [tipAmount, setTipAmount] = useState(order.tip_amount || 0);
  const [selectedTablesToSplit, setSelectedTablesToSplit] = useState<Set<number>>(new Set());

  const handleCustomerSelect = async (customerId: string | null) => {
    try {
      await fetch('/api/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id: order.id, data: { customer_id: customerId } }),
      });
      if (customerId) {
        const { data } = await supabase.from('customers').select('name').eq('id', customerId).single();
        if (data) setCustomerName(data.name);
      } else {
        setCustomerName(null);
      }
    } catch (e) {
      console.error('Failed to update customer:', e);
    }
  };

  const mergedFromTables = allOrders
    .filter(o => o.merged_into === order.id && o.table_number !== null)
    .map(o => o.table_number as number);
  const isMergedOrder = mergedFromTables.length > 0;

  useEffect(() => {
    if (order.customer_id) {
      supabase.from('customers').select('name').eq('id', order.customer_id).single().then(({ data }) => {
        if (data) setCustomerName(data.name);
      });
    } else {
      setCustomerName(null);
    }
  }, [order.customer_id]);

  // Calculate group number based on creation order of merged groups
  const groupNumber = React.useMemo(() => {
    if (!isMergedOrder) return 0;
    // Get all parent orders that have merged children
    const allMergedParents = allOrders
      .filter(o => o.status !== 'paid' && o.table_number !== null && allOrders.some(child => child.merged_into === o.id))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    // Find index of current order
    const index = allMergedParents.findIndex(o => o.id === order.id);
    return index + 1; // 1-based
  }, [isMergedOrder, allOrders, order.id, order.created_at]);

  /* ── Unmerge (Split): delete merged child orders — dismiss logic ── */
  const handleUnmerge = async () => {
    if (unmerging) return;
    setUnmerging(true);
    const mergedOrders = allOrders.filter(o => o.merged_into === order.id);
    if (mergedOrders.length === 0) { setUnmerging(false); return; }

    try {
      const childIds = mergedOrders.map(o => o.id);

      // Soft-delete each child order via API (sets status=cancelled + cancelled_at)
      for (const childId of childIds) {
        const res = await fetch('/api/orders', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete', id: childId }),
        });
        if (!res.ok) throw new Error(`Failed to unmerge order ${childId}`);
      }

      toast.success(t('tables_separated').replace('{tables}', mergedOrders.map(o => `${t('table_label')} ${o.table_number}`).join(', ')), { id: 'action-toast' });

      // Instantly update local state — remove all child orders
      if (onOrdersUpdate) {
        const deleteIds = new Set(childIds);
        onOrdersUpdate(prev => prev.filter(o => !deleteIds.has(o.id)));
      }

      // Wait for DB operations to complete before closing
      await onRefresh();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || t('error'), { id: 'action-toast' });
    } finally {
      setUnmerging(false);
    }
  };

  /* ── Merge order into another ── (kept for future use) ── */
  const _handleMerge = async (targetOrder: Order) => {
    if (merging) return;
    setMerging(true);
    try {
      // Use merge API — routes through merge_orders_atomic RPC (FOR UPDATE)
      const res = await fetch('/api/orders/merge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_numbers: [order.table_number, targetOrder.table_number] }),
      });
      if (!res.ok) throw new Error('Merge failed');
      toast.success(`Masa ${order.table_number} → Masa ${targetOrder.table_number} birləşdirildi`, { id: 'action-toast' });
      onRefresh();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Xəta baş verdi', { id: 'action-toast' });
    } finally {
      setMerging(false);
    }
  };

  /* ── Partial cancel state ── */
  const [selectedCancelItems, setSelectedCancelItems] = useState<Record<string, number>>({});
  const [cancelledItemsHistory, setCancelledItemsHistory] = useState<any[]>([]);
  const [loadingCancelled, setLoadingCancelled] = useState(false);

  const getCancellationReasonLabel = (reasonKey?: string, fallback?: string) => {
    if (!reasonKey) return fallback ?? '—';
    const map: Record<string, string> = {
      customer_refused: t('reason_customer_refused'),
      quality_issue:    t('reason_quality_issue'),
      delay:            t('reason_delay'),
      wrong_order:      t('reason_wrong_order'),
      other:            t('reason_other'),
    };
    return map[reasonKey] ?? fallback ?? reasonKey;
  };

  const statusConfig = getStatusConfig(t) as Record<string, any>;
  const cfg = statusConfig[order.status] ?? statusConfig.new;
  const isLocked = acting;
  const closeAndRefresh = () => { onClose(); onRefresh(); };

  /* ── Draft system ── */
  const [draftQty, setDraftQty]           = useState<Record<string, number>>({});
  const [deletedIds, setDeletedIds]       = useState<Set<string>>(new Set());
  const [returnedIds, setReturnedIds]     = useState<Set<string>>(new Set());
  const [pendingDeleteItemId, setPendingDeleteItemId] = useState<string | null>(null);
  const hasDraft = Object.keys(draftQty).length > 0 || deletedIds.size > 0 || returnedIds.size > 0;

  useEffect(() => {
    setDraftQty({});
    setDeletedIds(new Set());
    setReturnedIds(new Set());
    setPendingDeleteItemId(null);
    setCancelStep('none');
    setCancelReason('');
    setSelectedCancelItems({});
    setCancelledItemsHistory([]);
    setLoadingCancelled(true);
    supabase
      .from('cancelled_orders')
      .select('*')
      .eq('order_id', order.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setCancelledItemsHistory(data || []); setLoadingCancelled(false); });
  }, [order.id]);

  useEffect(() => {
    const handler = () => { if (showMenu) setShowMenu(false); };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [showMenu]);

  const persistedItems = (order.order_items || []).filter(i => !deletedIds.has(i.id) && !returnedIds.has(i.id));

  const handleChangeItemQty = (e: React.MouseEvent, item: OrderItem, delta: number) => {
    e.stopPropagation();
    const served = item.served_quantity ?? 0;
    const current = draftQty[item.id] ?? item.quantity;
    if (delta < 0 && (current + delta) < served) {
      toast.error(`Təhvil verilmiş məhsul azaldıla bilməz (${served} ədəd)`, { id: 'served-qty' });
      return;
    }
    if (delta < 0 && item.kitchen_status === 'ready') {
      toast.error('Hazır məhsul azaldıla bilməz. İtki olaraq qeyd edin.', { id: 'ready-qty' });
      return;
    }
    const next = current + delta;
    if (next <= 0) { setPendingDeleteItemId(item.id); return; }
    setDraftQty(prev => ({ ...prev, [item.id]: next }));
  };

  const handleConfirmWithDraft = () => {
    const snapDraft = { ...draftQty };
    const snapDeleted = new Set(deletedIds);
    setDraftQty({}); setDeletedIds(new Set()); setPendingDeleteItemId(null);
    closeAndRefresh();
    const snapReturned = new Set(returnedIds);
    setReturnedIds(new Set());

    (async () => {
      try {
        // Collect stock reversal for qty-reduced items only (deleted items handled by cancel_order_items RPC)
        const qtyReductionReversal: { order_item_id: string; reverse_qty: number }[] = [];
        for (const [id, newQty] of Object.entries(snapDraft)) {
          const item = order.order_items?.find(i => i.id === id);
          if (!item) continue;
          const oldQty = item.quantity;
          if (newQty >= oldQty) continue;
          const diff = oldQty - newQty;
          if ((item.served_quantity ?? 0) > 0) continue;
          qtyReductionReversal.push({ order_item_id: id, reverse_qty: diff });
        }
        if (qtyReductionReversal.length > 0) {
          await supabase.rpc('reverse_stock_deduction_for_items', {
            p_items: JSON.stringify(qtyReductionReversal),
          });
        }

        // Cancel deleted/returned items via RPC (handles delete + stock reversal + total recalc)
        const cancelItemIds = new Set([...snapDeleted, ...snapReturned]);
        if (cancelItemIds.size > 0) {
          const cancelItems = [...cancelItemIds]
            .map(id => {
              const item = order.order_items?.find(i => i.id === id);
              if (!item || (item.served_quantity ?? 0) > 0) return null;
              return { order_item_id: id, quantity: item.quantity };
            })
            .filter(Boolean) as { order_item_id: string; quantity: number }[];
          if (cancelItems.length > 0) {
            await supabase.rpc('cancel_order_items', {
              p_order_id: order.id,
              p_items: JSON.stringify(cancelItems),
            });
          }
        }

        // Update qty-changed items via RPC (FOR UPDATE + kitchen_status reset)
        for (const [id, qty] of Object.entries(snapDraft)) {
          const item = order.order_items?.find(i => i.id === id);
          if (!item) continue;
          const served = item.served_quantity ?? 0;
          if (qty < served) continue;
          const unit = item.unit_price || (item.total_price / item.quantity);
          await supabase.rpc('update_order_item_quantity', {
            p_order_item_id: id,
            p_quantity: qty,
            p_unit_price: unit,
          });
        }

        // Compute final values for order update
        const returnedAmount = (order.order_items || [])
          .filter(i => snapReturned.has(i.id))
          .reduce((s, i) => s + (i.unit_price || (i.total_price / i.quantity)) * (snapDraft[i.id] ?? i.quantity), 0);
        const addItemsTotal = (addItems || []).reduce(
          (s, i) => s + (i.variant?.price ?? i.product.price) * i.quantity, 0
        );
        const finalTotal = (order.order_items || [])
          .filter(i => !snapDeleted.has(i.id) && !snapReturned.has(i.id))
          .reduce((s, i) => {
            const qty = snapDraft[i.id] ?? i.quantity;
            return s + (i.unit_price || (i.total_price / i.quantity)) * qty;
          }, 0) + addItemsTotal;
        const hasQtyChanges = Object.keys(snapDraft).length > 0 || snapDeleted.size > 0 || snapReturned.size > 0;

        // Update order via API (version-safe)
        const updateData: Record<string, any> = {
          total_amount: finalTotal,
          status: 'confirmed',
        };
        if (hasQtyChanges) updateData.kitchen_status = 'pending';
        if (returnedAmount > 0) {
          updateData.returned_amount = (order.returned_amount || 0) + returnedAmount;
        }
        const updRes = await fetch('/api/orders', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update', id: order.id, data: updateData }),
        });
        if (!updRes.ok) throw new Error('Order update failed');
      } catch (err: any) {
        onRefresh();
        toast.error(t('error') + ': ' + (err?.message ?? t('error_saving')), { id: 'action-toast' });
      }
    })();
  };

  const cancellationReasons = [
    { key: 'customer_refused', label: t('reason_customer_refused'), desc: t('reason_customer_refused_desc') },
    { key: 'quality_issue',    label: t('reason_quality_issue'),    desc: t('reason_quality_issue_desc') },
    { key: 'delay',            label: t('reason_delay'),            desc: t('reason_delay_desc') },
    { key: 'wrong_order',      label: t('reason_wrong_order'),      desc: t('reason_wrong_order_desc') },
    { key: 'other',            label: t('reason_other'),            desc: t('reason_other_desc') },
  ];

  const _handleCancelOrder = async (reasonKey: string) => {
    const reasonLabel = cancellationReasons.find(r => r.key === reasonKey)?.label || reasonKey;
    await supabase.from('cancelled_orders').insert([{
      order_id: order.id, table_number: order.table_number, total_amount: order.total_amount,
      reason: reasonKey, reason_text: reasonLabel,
      items: order.order_items?.map(i => ({ name: getProductName(i), quantity: i.quantity, price: i.unit_price })) || [],
      created_at: new Date().toISOString(),
    }]);
    // Set order as cancelled via API
    await fetch('/api/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', id: order.id, data: { kitchen_status: 'cancelled', void_reason: reasonLabel } }),
    });
    setTimeout(async () => {
      // Deferred: cancel items + release table via cancel_table_orders RPC
      await supabase.rpc('cancel_table_orders', { p_table_number: order.table_number });
    }, 30000);
    toast.success(t('order_cancelled_reason').replace('{reason}', reasonLabel), { id: 'action-toast' });
    closeAndRefresh();
  };

  const handlePartialCancel = async (reasonKey: string) => {
    const reasonLabel = cancellationReasons.find(r => r.key === reasonKey)?.label || reasonKey;
    const itemsToCancel = Object.entries(selectedCancelItems)
      .filter(([_, qty]) => qty > 0)
      .map(([itemId, qty]) => {
        const item = order.order_items?.find(i => i.id === itemId);
        return { id: itemId, name: item ? getProductName(item) : '—', quantity: qty, unit_price: item?.unit_price || 0, total_price: (item?.unit_price || 0) * qty };
      });
    if (itemsToCancel.length === 0) { toast.error(t('no_items_to_cancel'), { id: 'action-toast' }); return; }
    const totalCancelledAmount = itemsToCancel.reduce((sum, i) => sum + i.total_price, 0);
    await supabase.from('cancelled_orders').insert([{
      order_id: order.id, table_number: order.table_number, total_amount: totalCancelledAmount,
      reason: reasonKey, reason_text: reasonLabel, items: itemsToCancel, created_at: new Date().toISOString(),
    }]);
    // Split items into fully-cancelled (delete) and partially-cancelled (qty reduce)
    const fullCancelItems: { order_item_id: string; quantity: number }[] = [];
    const partialCancelItems: { order_item_id: string; new_qty: number; unit_price: number; cancel_qty: number }[] = [];
    for (const item of itemsToCancel) {
      const orderItem = order.order_items?.find(i => i.id === item.id);
      if (!orderItem) continue;
      if (item.quantity >= orderItem.quantity) {
        fullCancelItems.push({ order_item_id: item.id, quantity: orderItem.quantity });
      } else {
        partialCancelItems.push({ order_item_id: item.id, new_qty: orderItem.quantity - item.quantity, unit_price: orderItem.unit_price || 0, cancel_qty: item.quantity });
      }
    }
    // Full cancel via RPC (handles delete + stock reversal + total recalc)
    if (fullCancelItems.length > 0) {
      await supabase.rpc('cancel_order_items', {
        p_order_id: order.id,
        p_items: JSON.stringify(fullCancelItems),
      });
    }
    // Partial cancel via RPC (handles qty update + kitchen_status reset)
    for (const item of partialCancelItems) {
      await supabase.rpc('update_order_item_quantity', {
        p_order_item_id: item.order_item_id,
        p_quantity: item.new_qty,
        p_unit_price: item.unit_price,
      });
      // Reverse stock for the cancelled portion
      await supabase.rpc('reverse_stock_deduction_for_items', {
        p_items: JSON.stringify([{ order_item_id: item.order_item_id, reverse_qty: item.cancel_qty }]),
      });
    }
    const newOrderTotal = (order.total_amount || 0) - totalCancelledAmount;
    await fetch('/api/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', id: order.id, data: { total_amount: Math.max(0, newOrderTotal) } }),
    });
    const totalQty = itemsToCancel.reduce((sum, i) => sum + (i.quantity || 1), 0);
    toast.success(t('items_cancelled').replace('{count}', String(totalQty)).replace('{reason}', reasonLabel).replace('{amount}', totalCancelledAmount.toFixed(2)), { id: 'action-toast' });
    setCancelStep('none'); setCancelReason(''); setSelectedCancelItems({});
    closeAndRefresh();
  };

  /* ── Add items (product search inside modal) ── */
  const [allProducts, setAllProducts]   = useState<Product[]>([]);
  const [categories, setCategories]     = useState<{ id: string; name: string }[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [addSearch, setAddSearch]       = useState('');
  const [addSearchFocused, setAddSearchFocused] = useState(false);
  const addSearchRef = useRef<HTMLInputElement>(null);
  const [cat, setCat]                   = useState<string | null>(null);
  const [imgErrors, setImgErrors]       = useState<Set<string>>(new Set());
  const [addItems, setAddItems]         = useState<ManualItem[]>([]);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addVariantPicker, setAddVariantPicker] = useState<{ product: Product; variants: import('../types').ProductVariant[] } | null>(null);
  const [loadingAddVariants, setLoadingAddVariants] = useState(false);

  const previewItems = addItems
    .filter(ai => !persistedItems.find(pi => pi.product_id === ai.product.id))
    .map(ai => ({
      id: `preview-${ai.product.id}`,
      product_id: ai.product.id,
      product_name: getAzProductName(ai.product),
      quantity: ai.quantity,
      unit_price: ai.product.price,
      total_price: ai.product.price * ai.quantity,
      products: { image_url: ai.product.image_url },
      _preview: true,
    }));
  const displayItems: any[] = [...persistedItems, ...previewItems];
  const draftTotal = displayItems.reduce((s: number, item: any) => {
    const qty  = draftQty[item.id] ?? item.quantity;
    const unit = item.unit_price || (item.total_price / item.quantity);
    return s + unit * qty;
  }, 0);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/products');
        const data = await res.json();
        setAllProducts((data.products || []) as Product[]);
        const cats = (data.categories || []) as { id: string; name: string }[];
        setCategories(cats);
        if (cats.length && !cat) setCat(cats[0].id);
      } catch (err) {
        console.error('[OrderModal] products fetch exception:', err);
      } finally {
        setLoadingProducts(false);
      }
    })();
    setTimeout(() => addSearchRef.current?.focus(), 100);
  }, []);

  const handleAddProductClick = async (product: Product) => {
    setLoadingAddVariants(true);
    const { data } = await supabase
      .from('product_variants')
      .select('id, name, price, is_default')
      .eq('product_id', product.id)
      .order('is_default', { ascending: false });
    setLoadingAddVariants(false);
    const variants = (data || []) as import('../types').ProductVariant[];
    if (variants.length === 0) {
      addToCartWithVariant(product, null);
    } else {
      setAddVariantPicker({ product, variants });
    }
  };

  const addToCartWithVariant = (product: Product, variant: import('../types').ProductVariant | null) => {
    const key = `${product.id}__${variant?.id || 'base'}`;
    setAddItems(prev => {
      const ex = prev.find(i => `${i.product.id}__${i.variant?.id || 'base'}` === key);
      if (ex) return prev.map(i => `${i.product.id}__${i.variant?.id || 'base'}` === key ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product, variant, quantity: 1 }];
    });
    setAddVariantPicker(null);
  };

  const removeAddItem = (productId: string, variantId?: string | null) => {
    const key = `${productId}__${variantId || 'base'}`;
    setAddItems(prev => prev.filter(i => `${i.product.id}__${i.variant?.id || 'base'}` !== key));
  };

  const handleRemoveItem = (item: any) => {
    if (item._preview) {
      const match = addItems.find(ai => `preview-${ai.product.id}` === item.id);
      if (match) removeAddItem(match.product.id, match.variant?.id);
    } else {
      const served = item.served_quantity ?? 0;
      if (served > 0) {
        toast.error(`Təhvil verilmiş məhsul silinə bilməz — ${served} ədəd artıq təhvil verilib`, { id: 'served-del' });
        return;
      }
      if (item.kitchen_status === 'ready') {
        toast.error('Hazır məhsul silinə bilməz. İtki olaraq qeyd edin.', { id: 'ready-del' });
        return;
      }
      setPendingDeleteItemId(item.id);
    }
  };

  const handleAddItems = async () => {
    if (addItems.length === 0) return;
    setAddSubmitting(true);
    try {
      // Split into new items and existing-item merges
      const newItems: any[] = [];
      const existingUpdates: { id: string; qty: number; unitPrice: number; totalPrice: number }[] = [];
      let extraTotal = 0;
      for (const item of addItems) {
        const unitPrice = item.variant?.price ?? item.product.price;
        const existing = order.order_items?.find(oi =>
          oi.product_id === item.product.id && (oi as any).variant_id === (item.variant?.id || null)
        );
        if (existing) {
          const newQty = existing.quantity + item.quantity;
          existingUpdates.push({ id: existing.id, qty: newQty, unitPrice, totalPrice: unitPrice * newQty });
        } else {
          newItems.push({
            product_id: item.product.id,
            product_name: getAzProductName(item.product, item.variant?.name),
            variant_id: item.variant?.id || null,
            quantity: item.quantity,
            unit_price: unitPrice,
            total_price: unitPrice * item.quantity,
          });
        }
        extraTotal += unitPrice * item.quantity;
      }

      // Insert new items via RPC (FOR UPDATE, automatic total recalc)
      if (newItems.length > 0) {
        const { error: insErr } = await supabase.rpc('add_order_items', {
          p_order_id: order.id,
          p_items: JSON.stringify(newItems),
        });
        if (insErr) throw insErr;
      }

      // Update existing item qty via RPC (FOR UPDATE, kitchen_status reset)
      for (const upd of existingUpdates) {
        const { error: updErr } = await supabase.rpc('update_order_item_quantity', {
          p_order_item_id: upd.id,
          p_quantity: upd.qty,
          p_unit_price: upd.unitPrice,
        });
        if (updErr) throw updErr;
      }

      // Update order total via API (add_order_items already added, need to add existing items' extra too)
      if (existingUpdates.length > 0) {
        const updRes = await fetch('/api/orders', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update', id: order.id, data: { total_amount: (order.total_amount || 0) + extraTotal } }),
        });
        if (!updRes.ok) throw new Error('Order total update failed');
      }

      // Reset kitchen_status to 'pending' so kitchen sees the change
      const ksRes = await fetch('/api/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id: order.id, data: { kitchen_status: 'pending' } }),
      });
      if (!ksRes.ok) throw new Error('Kitchen status reset failed');

      setAddItems([]);
    } catch (e: any) {
      toast.error(e?.message || t('error'), { id: 'action-toast' });
    } finally {
      setAddSubmitting(false);
    }
  };

  const handleSaveAll = async () => {
    setSaveStatus('loading');
    setActing(true);
    try {
      if (addItems.length > 0) await handleAddItems();
      await new Promise(r => setTimeout(r, 400)); // minimum spinner time
      setSaveStatus('success');
      await new Promise(r => setTimeout(r, 1200)); // show checkmark briefly
      handleConfirmWithDraft();
    } catch {
      setSaveStatus('idle');
      setActing(false);
    }
  };

  const filteredProducts = allProducts.filter(p => {
    const pp = p as any;
    if (cat && pp.category_id !== cat) return false;
    const localName = (language === 'en' ? pp.name_en : language === 'ru' ? pp.name_ru : pp.name_az) || pp.name_az || pp.name_en || pp.name_ru || p.name || '';
    return localName.toLowerCase().includes(addSearch.toLowerCase());
  });
  const addTotal = addItems.reduce((s, i) => s + (i.variant?.price ?? i.product.price) * i.quantity, 0);

  const [mobileTab, setMobileTab] = React.useState<'order' | 'summary'>('order');

  const modalContent = (
    <>  {/* START MODAL CONTENT */}
        {/* drag handle — mobile only */}
        <div className="md:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/15" />
        </div>

        {/* Ambient glow */}
        <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 rounded-full opacity-30"
          style={{ background: 'radial-gradient(ellipse,rgba(212,175,55,0.15) 0%,transparent 70%)' }} />

        {/* Header */}
        <div className="px-5 pt-2 pb-0 flex items-center justify-between flex-shrink-0 min-h-[48px]">
          <div className="flex items-center gap-3 min-w-0">
            {isMergedOrder ? (
              <div className="flex items-center gap-2">
                <Layers size={16} className="text-white/40 flex-shrink-0" strokeWidth={1.5} />
                <p className="font-black text-2xl tracking-widest leading-none whitespace-nowrap"
                  style={{ background: 'linear-gradient(135deg,#D4AF37,#F5D67B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  {t('group_label')} {groupNumber}
                </p>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 bg-[var(--theme-surface-muted)] text-[var(--theme-text-secondary)] border border-[var(--theme-border)]">
                  <GitMerge size={9} />{[order.table_number, ...mergedFromTables].filter(Boolean).join('+')}
                </span>
              </div>
            ) : (
              <p className="font-black text-2xl tracking-widest leading-none whitespace-nowrap"
                style={{ background: 'linear-gradient(135deg,#D4AF37,#F5D67B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                {order.table_number ? `${t('table_label')} ${order.table_number}` : '—'}
              </p>
            )}
            <span className="text-white/20 text-[11px] flex items-center gap-1">
              <Clock size={9} />
              {order.status === 'paid'
                ? new Date(order.created_at).toLocaleDateString(language === 'az' ? 'az-AZ' : language === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short' })
                : timeAgo(order.created_at, t)}
            </span>
            {order.order_type && order.order_type !== 'dine_in' && (
              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-1 ${order.order_type === 'takeaway' ? 'text-amber-400/70 bg-amber-500/10 border border-amber-500/20' : 'text-[var(--theme-blue)] bg-[var(--theme-blue-soft)]/70 border border-[var(--theme-blue-border)]'}`}>
                {order.order_type === 'takeaway' ? <ShoppingBag size={9} /> : <Package size={9} />}
                {order.order_type === 'takeaway' ? t('takeaway') : t('delivery')}
              </span>
            )}
            {order.status !== 'paid' && (
              <button onClick={() => setShowCustomerSelect(true)}
                className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-1 transition-all ${customerName ? 'bg-indigo-500/10 text-indigo-400/80 border border-indigo-500/20 hover:bg-indigo-500/20' : 'bg-white/[0.04] text-white/25 border border-white/[0.08] hover:text-white/50 hover:border-white/20'}`}>
                <User size={9} />
                {customerName || t('customer')}
              </button>
            )}
            {order.status !== 'paid' && (
              <div className="flex items-center gap-1 text-white/30">
                <Users size={9} />
                <button onClick={async () => { const n = Math.max(1, (guestCount || 1) - 1); setGuestCount(n); await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update', id: order.id, data: { guest_count: n } }) }); }}
                  className="w-4 h-4 rounded flex items-center justify-center hover:bg-white/10 text-[10px] font-bold">−</button>
                <span className="text-[11px] font-semibold text-white/50 w-4 text-center tabular-nums">{guestCount}</span>
                <button onClick={async () => { const n = (guestCount || 1) + 1; setGuestCount(n); await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update', id: order.id, data: { guest_count: n } }) }); }}
                  className="w-4 h-4 rounded flex items-center justify-center hover:bg-white/10 text-[10px] font-bold">+</button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Status Badge */}
            {(() => {
              const ks = order.kitchen_status;
              const status = order.status;
              if (status === 'paid') return null;
              const isEmptyGroup = isMergedOrder && (!order.order_items || order.order_items.length === 0);
              if (isEmptyGroup) return <span className="text-[9px] font-black px-2 py-1 rounded-full tracking-wider uppercase bg-white/[0.06] text-white/30 border border-white/10">{t('draft')}</span>;
              if (ks === 'ready') return <span className="text-[9px] font-black px-2 py-1 rounded-full tracking-wider uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">{t('badge_ready')}</span>;
              if (ks === 'preparing' || ks === 'cooking') return <span className="text-[9px] font-black px-2 py-1 rounded-full tracking-wider uppercase bg-[var(--theme-blue-soft)] text-[var(--theme-blue)] border border-[var(--theme-blue-border)]">{t('badge_preparing')}</span>;
              if (status === 'new') return <span className="text-[9px] font-black px-2 py-1 rounded-full tracking-wider uppercase bg-orange-500/15 text-orange-400 border border-orange-500/30">{t('new' as any)}</span>;
              return <span className="text-[9px] font-black px-2 py-1 rounded-full tracking-wider uppercase bg-[var(--theme-surface-muted)] text-[var(--theme-text-secondary)] border border-[var(--theme-border)]">{t('badge_waiting' as any)}</span>;
            })()}
            <button onClick={onClose} className="w-10 h-10 rounded-xl bg-[var(--theme-surface-muted)] hover:bg-[var(--theme-surface-hover)] flex items-center justify-center text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] transition-all">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Mobile Tab Switcher */}
        <div className="md:hidden px-5 pt-3 pb-0 flex-shrink-0">
            <div className="flex bg-white/[0.04] rounded-2xl p-1 gap-1">
              {(['order', 'summary'] as const).map(tab => (
                <button key={tab} onClick={() => setMobileTab(tab)}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-bold tracking-wide transition-all duration-200 relative ${mobileTab === tab ? 'text-black' : 'text-white/40'}`}>
                  {mobileTab === tab && (
                    <div className="absolute inset-0 rounded-xl" style={{ background: 'linear-gradient(135deg,#D4AF37,#F5D67B)' }} />
                  )}
                  <span className="relative z-10 flex items-center justify-center gap-1.5">
                    {tab === 'order' ? t('selected_items') : t('total_label')}
                    {tab === 'order' && displayItems.length > 0 && (
                      <span className={`ml-1 text-[9px] font-black px-1.5 py-0.5 rounded-full ${mobileTab === 'order' ? 'bg-black/20 text-black' : 'bg-white/10 text-white/50'}`}>{displayItems.length}</span>
                    )}
                    {tab === 'summary' && (
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${mobileTab === 'summary' ? 'bg-black/20 text-black' : 'bg-gold text-black'}`}>
                        {draftTotal.toFixed(2)} ₼
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>

        {/* ── BODY: Products grid (left) + Summary (right) ── */}
        <div className="flex-1 flex overflow-hidden">

          {/* ═══ LEFT: Products browser ═══ */}
          <section className="flex-1 h-full flex flex-col overflow-hidden p-5">
            {/* Title area */}
            <div className="flex-shrink-0 mb-4">
              <h2 className="text-xl text-amber-400 font-bold">{t('table')} {order.table_number}</h2>
            </div>
            {/* Search */}
            <div className="flex-shrink-0 mb-3">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
                <input ref={addSearchRef}
                  value={addSearch}
                  onChange={e => setAddSearch(e.target.value)}
                  onFocus={() => setAddSearchFocused(true)}
                  placeholder={t('add_items')}
                  onKeyDown={e => { if (e.key === 'Escape') { addSearchRef.current?.blur(); } }}
                  className="w-full bg-white/[0.04] border border-white/[0.07] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/25 transition-all"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-2">
              {/* Category pills */}
              {categories.length > 0 && (
                <div className="sticky top-0 z-10 flex-shrink-0 pb-2 mb-1.5 flex gap-1.5 overflow-x-auto">
                  {categories.map(c => (
                      <button key={c.id} onClick={() => setCat(cat === c.id ? null : c.id)}
                        className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold tracking-wider whitespace-nowrap transition-all ${
                          cat === c.id ? 'bg-white text-black shadow-lg' : 'bg-white/[0.06] text-white/50 hover:text-white/80'
                        }`}>{c.name}</button>
                    ))}
                  </div>
                )}

                {loadingProducts ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 size={22} className="animate-spin text-white/20" />
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 select-none">
                    <p className="text-white/20 text-sm">{t('search')}...</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                    {filteredProducts.map(product => {
                      const inAddCount = addItems.filter(i => i.product.id === product.id).reduce((s, i) => s + i.quantity, 0);
                      const inOrderItem = order.order_items?.find(oi => oi.product_id === product.id);
                      const isSoldOut = (product as any).is_available === false;
                      const pName = (product as any)[`name_${language}`] || (product as any).name_az || product.name;
                      const initials = pName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
                      const imgErr = imgErrors.has(product.id);
                      const showImg = !!product.image_url && !imgErr;
                      return (
                        <motion.button layout="position" initial={false}
                          whileHover={{ y: -2, transition: { duration: 0.15 } }} whileTap={{ scale: 0.94, transition: { duration: 0.08 } }}
                          key={product.id}
                          onClick={() => handleAddProductClick(product)}
                          className={`relative rounded-xl text-left border transition-all flex flex-col overflow-hidden aspect-square ${
                            isSoldOut ? 'opacity-50' : ''
                          } ${
                            inAddCount > 0 || inOrderItem
                              ? 'bg-white/[0.04] border-white/[0.15]'
                              : 'bg-[#141414] border-white/[0.07] hover:bg-white/[0.05]'
                          }`}>
                          <div className="flex-1 min-h-0 w-full overflow-hidden flex items-center justify-center bg-white/[0.03]">
                            {showImg ? (
                              <img src={product.image_url!} alt={pName} className="w-full h-full object-cover" onError={() => setImgErrors(prev => new Set(prev).add(product.id))} />
                            ) : (
                              <span className="text-xl font-black text-white/20">{initials}</span>
                            )}
                          </div>
                          <div className="px-3 pb-3 pt-2.5 flex flex-col gap-0.5">
                            <p className="text-sm font-semibold text-white/85 truncate leading-tight">{pName}</p>
                            <p className="text-sm font-black text-gold">{product.price.toFixed(2)} ₼</p>
                          </div>
                          {isSoldOut && (
                            <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-[7px] font-bold text-red-400/80">Bitib</span>
                          )}
                          {inAddCount > 0 && (
                            <motion.span key={inAddCount} initial={{ scale: 1.4 }} animate={{ scale: 1 }}
                              className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-full bg-gold text-black text-[11px] font-black flex items-center justify-center shadow-lg">{inAddCount}</motion.span>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                )}

                {/* Variant picker */}
                {addVariantPicker && !loadingAddVariants && (
                  <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.03] overflow-hidden">
                    {addVariantPicker.variants.map(v => (
                      <button key={v.id} onClick={() => addToCartWithVariant(addVariantPicker.product, v)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.06] transition-colors text-left border-b border-white/[0.05] last:border-0">
                        <div><p className="text-white text-sm font-medium">{v.name}</p>{v.is_default && <span className="text-[9px] text-white/20 uppercase tracking-wider">{t('combo_default_variant')}</span>}</div>
                        <span className="text-gold text-xs font-bold">{v.price.toFixed(2)} ₼</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Add items indicator — staged, not saved yet */}
              {addItems.length > 0 && (
                <div className="px-5 py-3 border-t border-white/[0.05] flex items-center justify-between flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400/70" />
                    <span className="text-white/30 text-[10px] uppercase tracking-widest">{t('addition')}</span>
                    <span className="text-gold font-bold text-sm">+{addTotal.toFixed(2)} ₼</span>
                  </div>
                  <span className="text-[9px] text-white/25 italic">{t('save_to_confirm')}</span>
                </div>
              )}
            </section>

          {/* ═══ RIGHT: Summary + Actions ═══ */}
          <section className="w-[380px] h-full border-l border-white/[0.06] bg-neutral-950/50 flex flex-col flex-shrink-0">
            {/* Three-dot menu bar */}
            <div className="px-5 pt-4 pb-3 flex-shrink-0 border-b border-white/[0.05] flex items-center justify-between">
              <div>
                <p className="text-[9px] uppercase tracking-widest text-white/20">{t('total_label')}</p>
                <p className="font-black text-2xl tracking-tight tabular-nums"
                  style={{ background: 'linear-gradient(135deg,#D4AF37,#F5D67B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  {draftTotal.toFixed(2)} ₼
                </p>
              </div>
              {order.status !== 'paid' && (
                <div className="flex items-center gap-1.5">
                  {isMergedOrder && (
                    <button onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setMenuAnchor({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                      setShowMenu(true);
                    }} className="w-9 h-9 rounded-xl hover:bg-white/10 flex items-center justify-center text-white/30 hover:text-white/60 transition-all"
                      title={t('unmerge_tables')}>
                      <MoreVertical size={16} />
                    </button>
                  )}
                  {/* İtki (loss) */}
                  {(confirmClear ? null : (
                    <button onClick={() => {
                      if (cancelStep !== 'none') { setCancelStep('none'); setSelectedCancelItems({}); return; }
                      setSelectedCancelItems({});
                      setCancelStep('select');
                    }} className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${cancelStep !== 'none' ? 'bg-red-500/20 text-red-400' : 'hover:bg-red-500/10 text-red-400/60 hover:text-red-400'}`}
                      title={t('report_loss')}>
                      {cancelStep !== 'none' ? <X size={16} /> : <AlertTriangle size={16} />}
                    </button>
                  ))}
                   {/* Masanı Boşalt (ləğv et) */}
                   <button onClick={() => {
                     if (confirmClear) { setConfirmClear(false); return; }
                     if (cancelStep !== 'none') { setCancelStep('none'); setSelectedCancelItems({}); }
                     if (order.kitchen_status && order.kitchen_status !== 'pending' && addItems.length === 0 && !hasDraft) {
                       toast('Sifariş artıq mətbəxə göndərilib');
                       return;
                     }
                     setConfirmClear(true);
                   }} className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${confirmClear ? 'bg-orange-500/20 text-orange-400' : 'hover:bg-orange-500/10 text-orange-400/60 hover:text-orange-400'}`}
                     title={t('dismiss_table')}>
                     <XCircle size={16} />
                   </button>
                   {/* Hesabı Böl */}
                   {order.order_items && order.order_items.length > 0 && (
                     <button onClick={() => setShowSplit(true)} className="w-9 h-9 rounded-xl hover:bg-blue-500/10 text-blue-400/60 hover:text-blue-400 flex items-center justify-center transition-all" title="Hesabı Böl">
                       <Split size={16} />
                     </button>
                   )}
                 </div>
              )}
            </div>

            {/* Items summary list — with +/- */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
              <AnimatePresence initial={false}>
              {displayItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 select-none">
                  <ShoppingBag size={28} className="text-white/[0.07] mb-3" />
                  <p className="text-white/[0.25] text-xs font-medium">{t('no_items_yet')}</p>
                </div>
              ) : displayItems.map((item: any) => {
                const itemQty = draftQty[item.id] ?? item.quantity;
                const unitPrice = item.unit_price || (item.total_price / item.quantity);
                const isSelected = cancelStep === 'select' && !!selectedCancelItems[item.id];
                return (
                  <motion.div key={item.id} layout="position"
                    initial={{ opacity: 0, scale: 0.95, height: 0 }} animate={{ opacity: 1, scale: 1, height: 'auto' }}
                    exit={{ opacity: 0, scale: 0.95, height: 0 }} transition={{ duration: 0.15 }}
                    className="overflow-hidden">
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${item._preview ? 'bg-white/[0.04] border border-dashed border-gold/20' : isSelected ? 'bg-red-500/[0.06] border border-red-500/30' : 'bg-white/[0.02] border border-white/[0.04]'}`}>
                    {item.products?.image_url ? (
                      <img src={item.products.image_url} alt={getProductName(item)} loading="lazy" decoding="async" className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded-lg bg-white/[0.05] flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0 flex items-center gap-1.5">
                      <p className="text-white/70 text-xs font-medium truncate">{getProductName(item)}</p>
                      {(item.served_quantity ?? 0) > 0 && (
                        <span className="text-[8px] font-semibold px-1 py-0.5 rounded-full flex-shrink-0 bg-emerald-500/10 text-emerald-400/80 border border-emerald-500/20">{item.served_quantity}/{item.quantity}</span>
                      )}
                      {item.course && item.course !== 'main' && (
                        <span className="text-[8px] font-semibold px-1 py-0.5 rounded-full flex-shrink-0 bg-white/[0.06] text-white/30 border border-white/[0.08]">{item.course}</span>
                      )}
                    </div>
                    {cancelStep === 'select' ? (
                      <button onClick={() => {
                        if (isSelected) {
                          setSelectedCancelItems(prev => { const n = { ...prev }; delete n[item.id]; return n; });
                        } else {
                          setSelectedCancelItems(prev => ({ ...prev, [item.id]: itemQty }));
                        }
                      }}
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0 ${isSelected ? 'bg-red-500 border-red-500' : 'border-white/40'}`}>
                        {isSelected && <CheckCircle size={11} className="text-white" />}
                      </button>
                    ) : order.status !== 'paid' && itemQty > 0 ? (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <div className="flex items-center bg-white/[0.04] border border-white/[0.07] rounded-lg overflow-hidden">
                          <button onClick={e => handleChangeItemQty(e, item, -1)}
                            className="w-12 h-12 flex items-center justify-center text-white/40 hover:text-white active:scale-90 transition-all">
                            <Minus size={16} />
                          </button>
                          <span className="text-white text-[13px] w-7 text-center font-black tabular-nums">{itemQty}</span>
                          <button onClick={e => handleChangeItemQty(e, item, 1)}
                            className="w-12 h-12 flex items-center justify-center text-gold active:scale-90 transition-all">
                            <Plus size={16} />
                          </button>
                        </div>
                        <button onClick={() => handleRemoveItem(item)}
                          className="w-12 h-12 rounded-full flex items-center justify-center text-white/20 hover:text-red-400 hover:bg-red-500/10 active:scale-90 transition-all flex-shrink-0">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ) : (
                      <span className="text-white/25 text-[11px] tabular-nums flex-shrink-0">×{itemQty}</span>
                    )}
                    <span className="text-white/50 text-xs font-semibold tabular-nums w-14 text-right">{(unitPrice * itemQty).toFixed(2)} ₼</span>
                  </div>
                  </motion.div>
                );
              })}
              </AnimatePresence>
              {loadingCancelled ? (
                <div className="flex items-center gap-2 text-white/20 text-xs py-2"><Loader2 size={11} className="animate-spin" /> {t('loading')}</div>
              ) : cancelledItemsHistory.length > 0 && (
                <div className="mt-2 pt-2 border-t border-white/[0.06]">
                  <p className="text-white/25 text-[9px] uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                    <XCircle size={9} className="text-red-400/50" /> {t('cancelled_items_label')}
                  </p>
                  <div className="space-y-1">
                    {cancelledItemsHistory.map((record: any, idx: number) => (
                      <div key={idx} className="border-l-2 border-red-400/20 pl-2 py-1">
                        <div className="text-white/25 text-[10px]">{new Date(record.created_at).toLocaleTimeString(language === 'az' ? 'az-AZ' : language === 'ru' ? 'ru-RU' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</div>
                        {(record.items || []).slice(0, 1).map((item: any, i: number) => (
                          <div key={i} className="text-white/40 text-[11px]">{item.name} <span className="text-white/20">×{item.quantity}</span></div>
                        ))}
                        {(record.items || []).length > 1 && <span className="text-white/15 text-[10px]">+{(record.items || []).length - 1} {t('modal_more_items')}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {order.customer_note && (
                <p className="text-white/25 text-xs italic px-1 pt-1">{t('note_label')}: &ldquo;{order.customer_note}&rdquo;</p>
              )}
            </div>

            {/* Actions */}
            <div className="px-5 pb-5 pt-3 flex-shrink-0 border-t border-white/[0.05] space-y-2.5">
              {/* Primary action: Save changes (only when there are actual changes) */}
              {((order.status === 'confirmed' && hasDraft) || addItems.length > 0) && (
                <motion.button
                  disabled={acting} onClick={handleSaveAll}
                  layout
                  transition={{ type: 'spring', stiffness: 400, damping: 28, mass: 0.8 }}
                  className={`relative overflow-hidden font-semibold text-sm flex items-center justify-center gap-2 rounded-full disabled:opacity-30 disabled:cursor-not-allowed ${
                    saveStatus === 'loading' || saveStatus === 'success'
                      ? 'h-[44px] w-[44px] bg-neutral-900 mx-auto'
                      : 'h-[44px] px-5 bg-neutral-900 text-white active:bg-neutral-800'
                  }`}>
                  {saveStatus === 'loading' ? (
                    <motion.span
                      key="save-loading"
                      initial={{ opacity: 0, rotate: -90 }}
                      animate={{ opacity: 1, rotate: 0 }}
                      exit={{ opacity: 0, rotate: 90 }}
                      transition={{ duration: 0.18 }}
                    >
                      <Loader2 size={18} className="animate-spin text-white" />
                    </motion.span>
                  ) : saveStatus === 'success' ? (
                    <motion.span
                      key="save-success"
                      initial={{ opacity: 0, scale: 0.4 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.4 }}
                      transition={{ type: 'spring', stiffness: 350, damping: 18 }}
                    >
                      <CheckCircle size={18} className="text-emerald-400" />
                    </motion.span>
                  ) : (
                    <motion.span
                      key="save-idle"
                      initial={{ opacity: 0, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -3 }}
                      transition={{ duration: 0.12 }}
                      className="flex items-center gap-2"
                    >
                      <CheckCircle size={15} />
                      {order.status === 'new' && (hasDraft || addItems.length > 0) && (order.is_draft ? (t('reserve_action' as any) || 'Bron etmək') : t('confirm_changes'))}
                      {order.status === 'confirmed' && (hasDraft || addItems.length > 0) && (order.is_draft ? (t('update_reservation' as any) || 'Rezervasiyanı yenilə') : t('save_changes'))}
                    </motion.span>
                  )}
                </motion.button>
              )}

              {/* Dismiss table (empty order) */}
              {order.status !== 'paid' && !!order.table_number && displayItems.length === 0 && !hasDraft && addItems.length === 0 && cancelStep !== 'select' && (
                <button disabled={acting} onClick={() => { onClose(); onClearTable(order.table_number!); }}
                  className="w-full min-h-[48px] flex items-center justify-center gap-2 bg-white/[0.03] border border-white/15 text-white/40 font-bold rounded-2xl hover:bg-white/[0.06] hover:text-white/60 active:scale-[0.97] transition-all disabled:opacity-40 text-sm">
                  <X size={15} /> {t('dismiss_table')}
                </button>
              )}

              {/* Ready to pay */}
              {order.status === 'confirmed' && order.kitchen_status === 'ready' && !hasDraft && addItems.length === 0 && !confirmPay && cancelStep !== 'select' && displayItems.length > 0 && (
                <div className="flex gap-2">
                  <button onClick={() => setShowReceipt(true)} className="min-h-[48px] px-4 flex items-center justify-center bg-white/[0.04] border border-white/12 text-white/35 font-bold rounded-2xl hover:bg-white/[0.08] hover:text-white hover:border-white/25 active:scale-[0.97] transition-all">
                    <Printer size={15} />
                  </button>
                  <button disabled={acting} onClick={() => setConfirmPay(true)}
                    className="flex-1 min-h-[48px] flex items-center justify-center gap-2 bg-emerald-500/[0.08] border border-emerald-500/30 text-emerald-400 font-bold rounded-2xl hover:bg-emerald-500/[0.14] hover:border-emerald-500/50 active:scale-[0.97] transition-all disabled:opacity-40 text-sm">
                    <CreditCard size={15} /> {t('close_bill')}
                  </button>
                </div>
              )}

              {/* Pay confirmation */}
              {order.status === 'confirmed' && order.kitchen_status === 'ready' && confirmPay && (
                <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 space-y-2">
                  <p className="text-white text-sm font-semibold text-center">{t('confirm_close_bill')}</p>
                  <p className="text-white/35 text-xs text-center">{t('pay_choose_receipt')}</p>
                  {/* Tip input */}
                  <div className="flex items-center justify-between bg-white/[0.04] rounded-xl px-3 py-2">
                    <span className="text-xs text-white/40">{t('tip')}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => { const n = Math.max(0, (tipAmount || 0) - 1); setTipAmount(n); }}
                        className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center text-white/40 text-sm font-bold hover:bg-white/10">−</button>
                      <span className="w-12 text-center text-sm font-bold text-white tabular-nums">{tipAmount} ₼</span>
                      <button onClick={() => { setTipAmount((tipAmount || 0) + 1); }}
                        className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center text-white/40 text-sm font-bold hover:bg-white/10">+</button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 mt-1">
                    <button disabled={acting} onClick={() => { setConfirmPay(false); setShowReceipt(true); }}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-gold/10 border border-gold/25 text-gold text-sm font-bold rounded-xl hover:bg-gold/20 active:scale-[0.98] transition-all disabled:opacity-40">
                      <Printer size={14} /> {t('pay_with_receipt')}
                    </button>
                    <button disabled={acting} onClick={async () => { setConfirmPay(false); setActing(true); try { await onPay(order); closeAndRefresh(); } finally { setActing(false); } }}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-500/[0.08] border border-emerald-500/30 text-emerald-400 text-sm font-bold rounded-xl hover:bg-emerald-500/[0.15] active:scale-[0.98] transition-all disabled:opacity-40">
                      {acting ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />} {t('pay_without_receipt')}
                    </button>
                    <button onClick={() => setConfirmPay(false)} className="w-full py-2 rounded-xl border border-white/[0.07] text-white/30 text-xs hover:text-white/50 hover:border-white/15 transition-all">{t('cancel')}</button>
                  </div>
                </div>
              )}

              {/* Paid state */}
              {order.status === 'paid' && (
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2 text-white/20 text-sm"><CheckCircle size={13} /> {t('completed')}</div>
                  <button onClick={() => setShowReceipt(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white/40 text-[11px] font-bold tracking-widest uppercase hover:bg-white/[0.08] hover:text-white transition-all">
                    <Printer size={12} /> {t('receipt_reprint')}
                  </button>
                </div>
              )}

              {/* Cancel selection action bar */}
              {order.status !== 'paid' && cancelStep === 'select' && (
                <div className="border border-red-500/20 rounded-2xl p-3 space-y-2 bg-red-500/[0.03]">
                  <div className="flex items-center justify-between">
                    <p className="text-white/50 text-[11px] font-medium">{t('confirm_cancel_items')}</p>
                    <button onClick={() => { const all: Record<string, number> = {}; displayItems.forEach((item: any) => { all[item.id] = item.quantity; }); setSelectedCancelItems(all); setCancelStep('reason'); }}
                      className="text-[10px] text-red-400/60 hover:text-red-400 transition-all underline underline-offset-2">{t('select_all_items')}</button>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setCancelStep('none'); setSelectedCancelItems({}); }} className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/40 text-sm transition-all">{t('imtina_et')}</button>
                    <button disabled={Object.keys(selectedCancelItems).length === 0} onClick={() => setCancelStep('reason')}
                      className="flex-1 py-2.5 border border-red-500/35 text-red-400 text-sm font-semibold rounded-xl hover:bg-red-500/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed">{t('davam_et')}</button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* ── MOBILE SUMMARY OVERLAY ── */}
        <AnimatePresence>
          {order.status !== 'paid' && mobileTab === 'summary' && (
            <motion.div
              key="mobile-summary"
              initial={{ opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 35, mass: 0.9 }}
              className="md:hidden absolute inset-0 z-30 flex flex-col rounded-t-[28px] overflow-hidden bg-[var(--theme-surface)]"
            >
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-white/15" />
              </div>
              <div className="px-4 py-2 flex-shrink-0 flex items-center gap-2">
                <button onClick={() => setMobileTab('order')}
                  className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-white/50 active:scale-90 transition-all flex-shrink-0">
                  <ChevronLeft size={20} />
              </button>
              <div className="flex-1">
                <p className="font-black text-xl tracking-tight"
                  style={{ background: 'linear-gradient(135deg,#D4AF37,#F5D67B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  {draftTotal.toFixed(2)} ₼
                </p>
              </div>
              <div onClick={e => e.stopPropagation()} className="flex items-center gap-1.5">
                  {isMergedOrder && (
                    <button onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setMenuAnchor({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                      setShowMenu(true);
                    }} className="w-9 h-9 rounded-xl hover:bg-white/10 flex items-center justify-center text-white/30 hover:text-white/60 transition-all"
                      title={t('unmerge_tables')}>
                      <MoreVertical size={16} />
                    </button>
                  )}
                  <button onClick={() => {
                    setSelectedCancelItems({});
                    setCancelStep('select');
                  }} className="w-9 h-9 rounded-xl hover:bg-red-500/10 flex items-center justify-center text-red-400/60 hover:text-red-400 transition-all"
                    title={t('report_loss')}>
                    <AlertTriangle size={16} />
                  </button>
                  <button onClick={() => {
                    if (confirmClear) { setConfirmClear(false); return; }
                    if (order.kitchen_status && order.kitchen_status !== 'pending' && addItems.length === 0 && !hasDraft) {
                      toast('Sifariş artıq mətbəxə göndərilib');
                      return;
                    }
                    setConfirmClear(true);
                  }} className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${confirmClear ? 'bg-orange-500/20 text-orange-400' : 'hover:bg-orange-500/10 text-orange-400/60 hover:text-orange-400'}`}
                    title={t('dismiss_table')}>
                    <XCircle size={16} />
                  </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
              <AnimatePresence initial={false}>
              {displayItems.map((item: any) => {
                const mqty = draftQty[item.id] ?? item.quantity;
                return (
                  <motion.div key={item.id} layout="position"
                    initial={{ opacity: 0, scale: 0.95, height: 0 }} animate={{ opacity: 1, scale: 1, height: 'auto' }}
                    exit={{ opacity: 0, scale: 0.95, height: 0 }} transition={{ duration: 0.15 }}
                    className="overflow-hidden">
                  <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    {item.products?.image_url ? <img src={item.products.image_url} alt={getProductName(item)} loading="lazy" decoding="async" className="w-9 h-9 rounded-xl object-cover flex-shrink-0" /> : <div className="w-9 h-9 rounded-xl bg-white/[0.05] flex-shrink-0" />}
                    <div className="flex-1 min-w-0 flex items-center gap-1.5">
                      <p className="text-white text-sm font-medium truncate">{getProductName(item)}</p>
                      {(item.served_quantity ?? 0) > 0 && (
                        <span className="text-[8px] font-semibold px-1 py-0.5 rounded-full flex-shrink-0 bg-emerald-500/10 text-emerald-400/80 border border-emerald-500/20">{item.served_quantity}/{item.quantity}</span>
                      )}
                      {item.course && item.course !== 'main' && (
                        <span className="text-[8px] font-semibold px-1 py-0.5 rounded-full flex-shrink-0 bg-white/[0.06] text-white/30 border border-white/[0.08]">{item.course}</span>
                      )}
                    </div>
                    {order.status !== 'paid' ? (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <div className="flex items-center bg-white/[0.04] border border-white/[0.07] rounded-lg overflow-hidden flex-shrink-0">
                          <button onClick={e => handleChangeItemQty(e, item, -1)}
                            className="w-12 h-12 flex items-center justify-center text-white/40 hover:text-white active:scale-90 transition-all">
                            <Minus size={16} />
                          </button>
                          <span className="text-white text-[13px] w-7 text-center font-black tabular-nums">{mqty}</span>
                          <button onClick={e => handleChangeItemQty(e, item, 1)}
                            className="w-12 h-12 flex items-center justify-center text-gold active:scale-90 transition-all">
                            <Plus size={16} />
                          </button>
                        </div>
                        <button onClick={() => handleRemoveItem(item)}
                          className="w-12 h-12 rounded-full flex items-center justify-center text-white/20 hover:text-red-400 hover:bg-red-500/10 active:scale-90 transition-all flex-shrink-0">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ) : (
                      <p className="text-white/25 text-xs">×{mqty}</p>
                    )}
                    <span className="text-white/40 text-sm font-semibold tabular-nums">{((item.unit_price || item.total_price / item.quantity) * mqty).toFixed(2)} ₼</span>
                  </div>
                  </motion.div>
                );
              })}
              </AnimatePresence>
            </div>
            <div className="px-4 pb-6 pt-3 border-t border-white/[0.05] flex-shrink-0 space-y-2">
              {(order.status === 'new' || (order.status === 'confirmed' && hasDraft) || addItems.length > 0) && (
                <motion.button
                  disabled={acting} onClick={handleSaveAll}
                  layout
                  transition={{ type: 'spring', stiffness: 400, damping: 28, mass: 0.8 }}
                  className={`relative overflow-hidden font-semibold text-sm flex items-center justify-center gap-2 rounded-full disabled:opacity-30 disabled:cursor-not-allowed ${
                    saveStatus === 'loading' || saveStatus === 'success'
                      ? 'h-[44px] w-[44px] bg-neutral-900 mx-auto'
                      : 'h-[44px] px-5 bg-neutral-900 text-white active:bg-neutral-800'
                  }`}>
                  {saveStatus === 'loading' ? (
                    <motion.span
                      key="save-loading"
                      initial={{ opacity: 0, rotate: -90 }}
                      animate={{ opacity: 1, rotate: 0 }}
                      exit={{ opacity: 0, rotate: 90 }}
                      transition={{ duration: 0.18 }}
                    >
                      <Loader2 size={18} className="animate-spin text-white" />
                    </motion.span>
                  ) : saveStatus === 'success' ? (
                    <motion.span
                      key="save-success"
                      initial={{ opacity: 0, scale: 0.4 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.4 }}
                      transition={{ type: 'spring', stiffness: 350, damping: 18 }}
                    >
                      <CheckCircle size={18} className="text-emerald-400" />
                    </motion.span>
                  ) : (
                    <motion.span
                      key="save-idle"
                      initial={{ opacity: 0, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -3 }}
                      transition={{ duration: 0.12 }}
                      className="flex items-center gap-2"
                    >
                      <CheckCircle size={15} />
                      {order.status === 'new' && !hasDraft && addItems.length === 0 && t('confirm_order')}
                      {order.status === 'new' && (hasDraft || addItems.length > 0) && (order.is_draft ? (t('reserve_action' as any) || 'Bron etmək') : t('confirm_changes'))}
                      {order.status === 'confirmed' && (hasDraft || addItems.length > 0) && (order.is_draft ? (t('update_reservation' as any) || 'Rezervasiyanı yenilə') : t('save_changes'))}
                    </motion.span>
                  )}
                </motion.button>
              )}
              {order.status === 'confirmed' && order.kitchen_status === 'ready' && !hasDraft && addItems.length === 0 && !confirmPay && displayItems.length > 0 && (
                <button disabled={acting} onClick={() => setConfirmPay(true)}
                  className="w-full min-h-[48px] flex items-center justify-center gap-2 bg-emerald-500/[0.08] border border-emerald-500/30 text-emerald-400 font-bold rounded-2xl active:scale-[0.97] disabled:opacity-40 text-sm">
                  <CreditCard size={15} /> {t('close_bill')}
                </button>
              )}
              {cancelStep === 'select' && (
                <div className="border border-red-500/20 rounded-2xl p-3 space-y-2 bg-red-500/[0.03]">
                  <p className="text-white/50 text-xs font-medium">{t('confirm_cancel_items')}</p>
                  <div className="flex gap-2">
                    <button onClick={() => { setCancelStep('none'); setSelectedCancelItems({}); }} className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/40 text-sm">{t('imtina_et')}</button>
                    <button disabled={Object.keys(selectedCancelItems).length === 0} onClick={() => setCancelStep('reason')}
                      className="flex-1 py-2.5 border border-red-500/35 text-red-400 text-sm font-semibold rounded-xl disabled:opacity-30">{t('davam_et')}</button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
        </AnimatePresence>

        {/* Split Tables Modal — checkbox selection */}
        {showMerge && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/35 backdrop-blur-sm" onClick={() => setShowMerge(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="relative z-10 w-full max-w-full sm:max-w-sm mx-4 bg-[#0f0f0f] border border-gold/20 rounded-2xl p-5 shadow-2xl">
              <div className="text-center mb-4">
                <div className="w-12 h-12 rounded-2xl bg-gold/10 border border-gold/20 flex items-center justify-center mx-auto mb-3">
                  <GitMerge size={22} className="text-gold" />
                </div>
                <h3 className="text-base font-bold text-white">{t('separate_table')}</h3>
                <p className="text-white/40 text-xs mt-1">{t('select_tables_to_split')}</p>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {mergedFromTables.map((tableNum, idx) => {
                  const isSelected = selectedTablesToSplit.has(tableNum);
                  return (
                    <motion.button 
                      key={tableNum} 
                      disabled={unmerging}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: idx * 0.05 }}
                      onClick={() => {
                        setSelectedTablesToSplit(prev => {
                          const next = new Set(prev);
                          if (next.has(tableNum)) next.delete(tableNum);
                          else next.add(tableNum);
                          return next;
                        });
                      }}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all disabled:opacity-40 ${
                        isSelected 
                          ? 'bg-gold/[0.08] border-gold/40' 
                          : 'bg-white/[0.03] border-white/[0.08] hover:border-white/20'
                      }`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                          isSelected ? 'bg-gold border-gold' : 'border-white/30'
                        }`}>
                          {isSelected && <CheckCircle size={12} className="text-black" />}
                        </div>
                        <p className={`text-sm font-bold ${isSelected ? 'text-gold' : 'text-white'}`}>{t('table')} {tableNum}</p>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
              <div className="flex gap-2 mt-4">
                <button 
                  onClick={() => { setShowMerge(false); setSelectedTablesToSplit(new Set()); }} 
                  className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/50 text-sm hover:text-white hover:border-white/20 transition-all">
                  {t('cancel')}
                </button>
                <button
                  onClick={async () => {
                    if (selectedTablesToSplit.size === 0) return;
                    setUnmerging(true);
                    try {
                      const tablesToSplit = Array.from(selectedTablesToSplit);
                      const childOrders = allOrders.filter(o => 
                        o.merged_into === order.id && 
                        o.table_number !== null && 
                        tablesToSplit.includes(o.table_number)
                      );
                      const childIds = childOrders.map(o => o.id);
                      
                      // Soft-delete selected child orders via API (sets status=cancelled + cancelled_at)
                      for (const childId of childIds) {
                        const res = await fetch('/api/orders', {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'delete', id: childId }),
                        });
                        if (!res.ok) throw new Error(`Failed to unmerge order ${childId}`);
                      }
                      
                      toast.success(t('tables_separated').replace('{tables}', tablesToSplit.map(n => `${t('table_label')} ${n}`).join(', ')), { id: 'action-toast' });
                      
                       // Update local state
                       if (onOrdersUpdate) {
                         const deleteIds = new Set(childIds);
                         onOrdersUpdate(prev => prev.filter(o => !deleteIds.has(o.id)));
                       }
                       
                       setShowMerge(false);
                       setSelectedTablesToSplit(new Set());
                       await onRefresh();
                     } catch (e: any) {
                      toast.error(e?.message || t('error'), { id: 'action-toast' });
                    } finally {
                      setUnmerging(false);
                    }
                  }}
                  disabled={unmerging || selectedTablesToSplit.size === 0}
                  className="flex-1 py-2.5 rounded-xl bg-gold text-black text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                  {unmerging ? <Loader2 size={16} className="animate-spin mx-auto" /> : t('split_selected')}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Cancellation Reason Modal */}
        {cancelStep === 'reason' && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/35 backdrop-blur-sm" onClick={() => setCancelStep('select')} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 0.95 }}
              className="relative z-10 w-full max-w-full sm:max-w-lg mx-4 bg-[#0f0f0f] border border-red-500/30 rounded-2xl p-6 shadow-2xl">
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/25 flex items-center justify-center mb-4">
                  <Trash2 size={28} className="text-red-500" />
                </div>
                <h3 className="text-xl font-bold text-red-400 mb-1">
                  {(() => {
                    const totalQty = Object.values(selectedCancelItems).reduce((sum, qty) => sum + qty, 0);
                    const allSelected = displayItems.every((item: any) => selectedCancelItems[item.id] === item.quantity);
                    return allSelected ? t('cancel_all_confirm') : t('cancel_items_confirm').replace('{count}', String(totalQty));
                  })()}
                </h3>
                <p className="text-white/40 text-sm">{t('cancel_reason_hint')}</p>
                <p className="text-red-400/60 text-xs mt-2">
                  {Object.entries(selectedCancelItems).reduce((sum, [id, qty]) => {
                    const item = order.order_items?.find(i => i.id === id);
                    return sum + (item?.unit_price || 0) * qty;
                  }, 0).toFixed(2)} ₼
                </p>
              </div>
              <div className="space-y-2 mb-6">
                {cancellationReasons.map(reason => (
                  <button key={reason.key} onClick={() => setCancelReason(reason.key)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${cancelReason === reason.key ? 'bg-red-500/20 border-red-500/50' : 'bg-white/5 border-white/10 hover:border-white/20'}`}>
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${cancelReason === reason.key ? 'border-red-500' : 'border-white/30'}`}>
                      {cancelReason === reason.key && <div className="w-2 h-2 rounded-full bg-red-500" />}
                    </div>
                    <div>
                      <p className={`text-sm font-medium ${cancelReason === reason.key ? 'text-white' : 'text-white/70'}`}>{reason.label}</p>
                      <p className="text-xs text-white/40">{reason.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setCancelStep('select'); setCancelReason(''); }}
                  className="flex-1 py-3 rounded-xl border border-white/10 text-white/50 hover:text-white hover:border-white/20 transition-all text-sm">{t('go_back')}</button>
                <button disabled={!cancelReason || acting} onClick={() => cancelReason && handlePartialCancel(cancelReason)}
                  className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold text-sm hover:bg-red-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                  {acting ? t('cancelling') : `${Object.values(selectedCancelItems).reduce((sum, qty) => sum + qty, 0)} ${t('cancel_item_count')}`}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Portal menu — unmerge only (other actions moved to header) */}
        {typeof document !== 'undefined' && showMenu && menuAnchor && createPortal(
          <div onClick={e => e.stopPropagation()} className="fixed z-[100] w-52 bg-[#1c1c1c] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden"
            style={{ top: menuAnchor.top, right: menuAnchor.right }}>
            <button onClick={() => { setShowMenu(false); setShowMerge(true); setSelectedTablesToSplit(new Set()); setMenuAnchor(null); }}
              className="w-full px-5 py-3.5 flex items-center gap-3 hover:bg-white/5 transition-colors text-left">
              <GitMerge size={15} className="text-gold/70" />
              <div>
                <p className="text-sm font-semibold text-gold/90">{t('unmerge_tables')}</p>
                <p className="text-[10px] text-white/30">{mergedFromTables.map(n => `${t('table_label')} ${n}`).join(', ')}</p>
              </div>
            </button>
          </div>,
          document.body
        )}
      </>
    );

  if (inline) {
    return (
      <>
      <div
        className="rounded-2xl border border-[var(--theme-border)] shadow-lg flex flex-col overflow-hidden h-full bg-[var(--theme-surface)]"
      >
        {modalContent}
        {showReceipt && (
          <ReceiptModal
            order={order}
            onClose={() => setShowReceipt(false)}
            getProductName={(item) => {
              const p = item.products as any;
              return p?.name_az || p?.name_en || p?.name_ru || item.product_name;
            }}
            onPay={order.status !== 'paid' ? async () => {
              await onPay(order);
              setShowReceipt(false);
              closeAndRefresh();
            } : undefined}
          />
        )}
        {showSplit && (
          <BillSplitModal
            open={showSplit}
            orderId={order.id}
            items={(order.order_items || [])
              .filter(i => i.product_id)
              .map(i => ({
                id: i.id,
                product_id: i.product_id as string,
                product_name: i.product_name || '',
                quantity: i.quantity || 1,
                unit_price: i.unit_price || 0,
                total_price: i.total_price || 0,
                modifiers: i.modifiers,
                combo_group_id: (i as any).combo_group_id,
                special_notes: i.special_notes,
              }))}
            onClose={() => setShowSplit(false)}
            onSuccess={() => { onRefresh(); setShowSplit(false); }}
          />
        )}
      </div>
      {showCustomerSelect && (
        <CustomerSelect
          selectedId={order.customer_id}
          onSelect={handleCustomerSelect}
          onClose={() => setShowCustomerSelect(false)}
        />
      )}
      </>
    );
  }

  if (typeof document === 'undefined') return null;
  return createPortal(
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className="fixed inset-0 bg-black/70 backdrop-blur-md z-[70]"
        onClick={isLocked || isConfirming ? undefined : onClose}
      />

      <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center md:p-4 pointer-events-none">
      <motion.div
        key={`modal-${order.id}`}
        initial={{ opacity: 0, y: '100%', scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: '100%', scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 340, damping: 32, mass: 0.95 }}
        onClick={e => e.stopPropagation()}
        onTouchMove={e => e.stopPropagation()}
        style={{
          background: 'linear-gradient(180deg,#141414 0%,#0d0d0d 100%)',
          touchAction: 'pan-y',
        }}
        className="pointer-events-auto relative w-full md:max-w-6xl h-[100dvh] md:h-[88vh] rounded-t-[28px] md:rounded-[28px] shadow-[0_-8px_60px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.06)] flex flex-col overflow-hidden"
      >
        {modalContent}
        {showReceipt && (
          <ReceiptModal
            order={order}
            onClose={() => setShowReceipt(false)}
            getProductName={(item) => {
              const p = item.products as any;
              return p?.name_az || p?.name_en || p?.name_ru || item.product_name;
            }}
            onPay={order.status !== 'paid' ? async () => {
              await onPay(order);
              setShowReceipt(false);
              closeAndRefresh();
            } : undefined}
          />
        )}
        {showSplit && (
          <BillSplitModal
            open={showSplit}
            orderId={order.id}
            items={(order.order_items || [])
              .filter(i => i.product_id)
              .map(i => ({
                id: i.id,
                product_id: i.product_id as string,
                product_name: i.product_name || '',
                quantity: i.quantity || 1,
                unit_price: i.unit_price || 0,
                total_price: i.total_price || 0,
                modifiers: i.modifiers,
                combo_group_id: (i as any).combo_group_id,
                special_notes: i.special_notes,
              }))}
            onClose={() => setShowSplit(false)}
            onSuccess={() => { onRefresh(); setShowSplit(false); }}
          />
        )}
      </motion.div>
      </div>
      {showCustomerSelect && (
        <CustomerSelect
          selectedId={order.customer_id}
          onSelect={handleCustomerSelect}
          onClose={() => setShowCustomerSelect(false)}
        />
      )}
    </>,
    document.body
  );
};