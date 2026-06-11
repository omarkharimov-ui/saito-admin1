'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Truck, FileText, Package, Upload, Loader2, Search, Store, CheckCircle2, BarChart3, Layers3, ChevronRight } from 'lucide-react';
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import type { Ingredient, InventoryStatusRow } from '@/types/inventory';
import type { PurchaseOrder, Supplier, PurchasingAnalytics } from '@/types/purchasing';

function money(n: number) {
  return Number(n || 0).toLocaleString('az-AZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatCard({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.01)]">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] uppercase tracking-[0.22em] text-white/30 font-bold">{label}</p>
        <span className="text-white/20">{icon}</span>
      </div>
      <p className="text-3xl font-black tabular-nums leading-none">{value}</p>
      {sub && <p className="text-[11px] text-white/30 mt-2">{sub}</p>}
    </div>
  );
}

export default function PurchasingPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [rows, setRows] = useState<InventoryStatusRow[]>([]);
  const [analytics, setAnalytics] = useState<PurchasingAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ name: '', contact_name: '', phone: '', email: '', address: '', notes: '' });
  const [orderForm, setOrderForm] = useState({ supplier_id: '', notes: '', expected_at: '', invoice_url: '' });
  const [orderLines, setOrderLines] = useState([{ ingredient_id: '', ordered_qty: '1', unit: 'pcs', unit_cost: '0' }]);
  const [receiveLines, setReceiveLines] = useState([{ ingredient_id: '', quantity: '1', unit: 'pcs', cost_per_unit: '0' }]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [suppliersRes, ordersRes, ingredientsRes, analyticsRes, rowsRes] = await Promise.all([
        supabase.from('suppliers').select('*').order('created_at', { ascending: false }),
        supabase.from('purchase_orders').select('*, supplier:suppliers(*), items:purchase_order_items(*)').order('created_at', { ascending: false }),
        supabase.from('ingredients').select('id, name, unit, current_stock, average_cost_per_unit, purchase_price').order('name'),
        supabase.from('purchasing_analytics').select('*').maybeSingle(),
        supabase.from('inventory_status').select('*').order('current_stock', { ascending: true }).limit(20),
      ]);
      setSuppliers((suppliersRes.data || []) as Supplier[]);
      setOrders((ordersRes.data || []) as PurchaseOrder[]);
      setIngredients((ingredientsRes.data || []) as Ingredient[]);
      setAnalytics((analyticsRes.data || null) as PurchasingAnalytics | null);
      setRows((rowsRes.data || []) as InventoryStatusRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const channel = createRealtimeChannel('purchasing-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_orders' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_order_items' }, fetchData)
      .subscribe();
    return () => removeRealtimeChannel(channel);
  }, [fetchData]);

  const filteredOrders = useMemo(() => {
    const q = search.toLowerCase();
    return orders.filter((order) => {
      const supplierName = order.supplier?.name?.toLowerCase() || '';
      return !q || order.order_number.toLowerCase().includes(q) || supplierName.includes(q) || (order.notes || '').toLowerCase().includes(q);
    });
  }, [orders, search]);

  const createSupplier = async () => {
    if (!supplierForm.name.trim()) return toast.error('Təchizatçı adı tələb olunur');
    setSaving(true);
    try {
      const { error } = await supabase.from('suppliers').insert(supplierForm);
      if (error) throw error;
      toast.success('Təchizatçı yaradıldı');
      setShowSupplierForm(false);
      setSupplierForm({ name: '', contact_name: '', phone: '', email: '', address: '', notes: '' });
      fetchData();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const createOrder = async () => {
    if (!orderForm.supplier_id) return toast.error('Təchizatçı seçin');
    setSaving(true);
    try {
      const payload = {
        supplier_id: orderForm.supplier_id,
        notes: orderForm.notes,
        expected_at: orderForm.expected_at || null,
        invoice_url: orderForm.invoice_url || null,
        status: 'draft',
      };
      const { data, error } = await supabase.from('purchase_orders').insert(payload).select('id').single();
      if (error) throw error;
      if (orderLines.some((line) => line.ingredient_id)) {
        const inserts = orderLines.filter((line) => line.ingredient_id).map((line) => ({
          purchase_order_id: data.id,
          ingredient_id: line.ingredient_id,
          ordered_qty: Number(line.ordered_qty || 0),
          unit: line.unit,
          unit_cost: Number(line.unit_cost || 0),
        }));
        const itemsError = await supabase.from('purchase_order_items').insert(inserts);
        if ((itemsError as any).error) throw (itemsError as any).error;
      }
      toast.success('Sifariş yaradıldı');
      setShowOrderForm(false);
      setOrderForm({ supplier_id: '', notes: '', expected_at: '', invoice_url: '' });
      setOrderLines([{ ingredient_id: '', ordered_qty: '1', unit: 'pcs', unit_cost: '0' }]);
      fetchData();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const receiveOrder = async () => {
    if (!selectedOrderId) return;
    setReceiving(true);
    try {
      const lines = receiveLines.filter((line) => line.ingredient_id).map((line) => ({
        ingredient_id: line.ingredient_id,
        quantity: Number(line.quantity || 0),
        unit: line.unit,
        cost_per_unit: Number(line.cost_per_unit || 0),
      }));
      const { error } = await supabase.rpc('receive_purchase_order', {
        p_purchase_order_id: selectedOrderId,
        p_lines: lines,
      });
      if (error) throw error;
      toast.success('Məhsullar qəbul edildi');
      setSelectedOrderId(null);
      setReceiveLines([{ ingredient_id: '', quantity: '1', unit: 'pcs', cost_per_unit: '0' }]);
      fetchData();
    } catch (e: any) { toast.error(e.message); } finally { setReceiving(false); }
  };

  const selectedOrder = orders.find((o) => o.id === selectedOrderId) || null;

  return (
    <div className="min-h-screen bg-[#080808] text-white pb-16">
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10 space-y-6">
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/30 font-bold">Purchasing</p>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold">Təchizat və Satınalma</h1>
            <p className="text-white/35 text-sm mt-1">Supplier, purchase order, goods receiving və stock increase workflow.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setShowSupplierForm(true)} className="px-4 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm font-semibold">Supplier</button>
            <button onClick={() => setShowOrderForm(true)} className="px-4 py-2 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/20 text-[#D4AF37] text-sm font-semibold">Purchase Order</button>
          </div>
        </motion.div>

        <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
          <StatCard label="Toplam xərcləmə" value={`₼${money(analytics?.spend_total ?? 0)}`} sub="Bütün alışlar" icon={<BarChart3 size={18} />} />
          <StatCard label="Açıq sifariş" value={analytics?.open_orders ?? 0} sub="Pending / sent" icon={<Package size={18} />} />
          <StatCard label="Qəbul edilən" value={analytics?.received_orders ?? 0} sub="Goods receiving" icon={<CheckCircle2 size={18} />} />
          <StatCard label="Təchizatçı" value={analytics?.suppliers_count ?? suppliers.length} sub={analytics?.top_supplier_name || 'Aktiv baza'} icon={<Store size={18} />} />
          <StatCard label="Orta sifariş" value={`₼${money(analytics?.average_order_value ?? 0)}`} sub="Average order value" icon={<Truck size={18} />} />
        </div>

        <div className="grid xl:grid-cols-[1.3fr,0.9fr] gap-6">
          <div className="space-y-6">
            <div className="rounded-3xl border border-white/[0.07] bg-white/[0.03] p-4 sm:p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold">Purchase History</h2>
                  <p className="text-xs text-white/30">Sifarişlər, status, invoice və receiving izlənməsi</p>
                </div>
                <div className="relative w-full max-w-xs">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Sifariş axtar..." className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.07] text-sm outline-none" />
                </div>
              </div>
              <div className="overflow-hidden rounded-2xl border border-white/[0.06]">
                {loading ? (
                  <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-white/30" /></div>
                ) : filteredOrders.length === 0 ? (
                  <div className="py-16 text-center text-white/25">Sifariş tapılmadı</div>
                ) : filteredOrders.map((order) => (
                  <button key={order.id} onClick={() => setSelectedOrderId(order.id)} className="w-full text-left px-4 sm:px-5 py-4 border-b border-white/[0.05] hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">{order.order_number}</p>
                        <p className="text-xs text-white/30">{order.supplier?.name || 'Supplier'} · {order.status}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">₼{money(order.total ?? 0)}</p>
                        <p className="text-xs text-white/30 flex items-center justify-end gap-1">Details <ChevronRight size={12} /></p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-white/[0.07] bg-white/[0.03] p-5">
              <h3 className="text-base font-bold mb-3">Stock Increase Integration</h3>
              <div className="space-y-2">
                {rows.slice(0, 8).map((row) => (
                  <div key={row.id} className="flex items-center justify-between rounded-xl bg-white/[0.03] border border-white/[0.05] px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{row.name}</p>
                      <p className="text-[10px] text-white/30">{row.unit} · current {row.current_stock}</p>
                    </div>
                    <p className="text-sm font-bold text-emerald-400">₼{money(row.inventory_value ?? 0)}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-white/[0.07] bg-white/[0.03] p-5">
              <h3 className="text-base font-bold mb-3">Purchasing Analytics</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-white/[0.03] border border-white/[0.05] p-3"><p className="text-white/30 text-[10px] uppercase tracking-[0.2em]">Suppliers</p><p className="font-bold text-lg">{suppliers.length}</p></div>
                <div className="rounded-2xl bg-white/[0.03] border border-white/[0.05] p-3"><p className="text-white/30 text-[10px] uppercase tracking-[0.2em]">Orders</p><p className="font-bold text-lg">{orders.length}</p></div>
                <div className="rounded-2xl bg-white/[0.03] border border-white/[0.05] p-3"><p className="text-white/30 text-[10px] uppercase tracking-[0.2em]">Goods received</p><p className="font-bold text-lg">{analytics?.received_orders ?? 0}</p></div>
                <div className="rounded-2xl bg-white/[0.03] border border-white/[0.05] p-3"><p className="text-white/30 text-[10px] uppercase tracking-[0.2em]">Open</p><p className="font-bold text-lg">{analytics?.open_orders ?? 0}</p></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showSupplierForm && (
          <motion.div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="w-full max-w-2xl rounded-3xl border border-white/[0.08] bg-[#101010] p-5 space-y-4">
              <div className="flex items-center justify-between"><h3 className="text-lg font-bold">New Supplier</h3><button onClick={() => setShowSupplierForm(false)}>×</button></div>
              <div className="grid sm:grid-cols-2 gap-3">
                <input placeholder="Name" value={supplierForm.name} onChange={(e) => setSupplierForm((p) => ({ ...p, name: e.target.value }))} className="input-premium" />
                <input placeholder="Contact" value={supplierForm.contact_name} onChange={(e) => setSupplierForm((p) => ({ ...p, contact_name: e.target.value }))} className="input-premium" />
                <input placeholder="Phone" value={supplierForm.phone} onChange={(e) => setSupplierForm((p) => ({ ...p, phone: e.target.value }))} className="input-premium" />
                <input placeholder="Email" value={supplierForm.email} onChange={(e) => setSupplierForm((p) => ({ ...p, email: e.target.value }))} className="input-premium" />
                <input placeholder="Address" value={supplierForm.address} onChange={(e) => setSupplierForm((p) => ({ ...p, address: e.target.value }))} className="input-premium sm:col-span-2" />
                <textarea placeholder="Notes" value={supplierForm.notes} onChange={(e) => setSupplierForm((p) => ({ ...p, notes: e.target.value }))} className="input-premium sm:col-span-2 min-h-24" />
              </div>
              <button onClick={createSupplier} disabled={saving} className="px-4 py-2 rounded-xl bg-[#D4AF37] text-black font-bold">Save Supplier</button>
            </div>
          </motion.div>
        )}

        {showOrderForm && (
          <motion.div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="w-full max-w-4xl rounded-3xl border border-white/[0.08] bg-[#101010] p-5 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between"><h3 className="text-lg font-bold">Purchase Order</h3><button onClick={() => setShowOrderForm(false)}>×</button></div>
              <div className="grid sm:grid-cols-2 gap-3">
                <select value={orderForm.supplier_id} onChange={(e) => setOrderForm((p) => ({ ...p, supplier_id: e.target.value }))} className="input-premium"><option value="">Select supplier</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                <input value={orderForm.expected_at} onChange={(e) => setOrderForm((p) => ({ ...p, expected_at: e.target.value }))} placeholder="Expected at" className="input-premium" />
                <input value={orderForm.invoice_url} onChange={(e) => setOrderForm((p) => ({ ...p, invoice_url: e.target.value }))} placeholder="Invoice URL" className="input-premium sm:col-span-2" />
                <textarea value={orderForm.notes} onChange={(e) => setOrderForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Notes" className="input-premium sm:col-span-2 min-h-24" />
              </div>
              <div className="space-y-2">
                {orderLines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2">
                    <select value={line.ingredient_id} onChange={(e) => setOrderLines((prev) => prev.map((l, i) => i === idx ? { ...l, ingredient_id: e.target.value } : l))} className="input-premium col-span-5"><option value="">Ingredient</option>{ingredients.map((ing) => <option key={ing.id} value={ing.id}>{ing.name}</option>)}</select>
                    <input value={line.ordered_qty} onChange={(e) => setOrderLines((prev) => prev.map((l, i) => i === idx ? { ...l, ordered_qty: e.target.value } : l))} className="input-premium col-span-2" placeholder="Qty" />
                    <input value={line.unit} onChange={(e) => setOrderLines((prev) => prev.map((l, i) => i === idx ? { ...l, unit: e.target.value } : l))} className="input-premium col-span-2" placeholder="Unit" />
                    <input value={line.unit_cost} onChange={(e) => setOrderLines((prev) => prev.map((l, i) => i === idx ? { ...l, unit_cost: e.target.value } : l))} className="input-premium col-span-2" placeholder="Unit cost" />
                    <button onClick={() => setOrderLines((prev) => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)} className="rounded-xl bg-white/[0.04] border border-white/[0.06]">×</button>
                  </div>
                ))}
                <button onClick={() => setOrderLines((prev) => [...prev, { ingredient_id: '', ordered_qty: '1', unit: 'pcs', unit_cost: '0' }])} className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm font-semibold">Add line</button>
              </div>
              <button onClick={createOrder} disabled={saving} className="px-4 py-2 rounded-xl bg-[#D4AF37] text-black font-bold">Create Order</button>
            </div>
          </motion.div>
        )}

        {selectedOrder && (
          <motion.div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="w-full max-w-4xl rounded-3xl border border-white/[0.08] bg-[#101010] p-5 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between"><h3 className="text-lg font-bold">{selectedOrder.order_number}</h3><button onClick={() => setSelectedOrderId(null)}>×</button></div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">Order Info</p>
                  <p className="text-sm">Supplier: {selectedOrder.supplier?.name || '-'}</p>
                  <p className="text-sm">Status: {selectedOrder.status}</p>
                  <p className="text-sm">Total: ₼{money(selectedOrder.total ?? 0)}</p>
                  <p className="text-sm">Invoice: {selectedOrder.invoice_url || '-'}</p>
                </div>
                <div className="space-y-2 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold">Receiving</p>
                  {receiveLines.map((line, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2">
                      <select value={line.ingredient_id} onChange={(e) => setReceiveLines((prev) => prev.map((l, i) => i === idx ? { ...l, ingredient_id: e.target.value } : l))} className="input-premium col-span-4"><option value="">Ingredient</option>{ingredients.map((ing) => <option key={ing.id} value={ing.id}>{ing.name}</option>)}</select>
                      <input value={line.quantity} onChange={(e) => setReceiveLines((prev) => prev.map((l, i) => i === idx ? { ...l, quantity: e.target.value } : l))} className="input-premium col-span-2" />
                      <input value={line.unit} onChange={(e) => setReceiveLines((prev) => prev.map((l, i) => i === idx ? { ...l, unit: e.target.value } : l))} className="input-premium col-span-2" />
                      <input value={line.cost_per_unit} onChange={(e) => setReceiveLines((prev) => prev.map((l, i) => i === idx ? { ...l, cost_per_unit: e.target.value } : l))} className="input-premium col-span-3" />
                      <button onClick={() => setReceiveLines((prev) => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)} className="rounded-xl bg-white/[0.04] border border-white/[0.06]">×</button>
                    </div>
                  ))}
                  <button onClick={() => setReceiveLines((prev) => [...prev, { ingredient_id: '', quantity: '1', unit: 'pcs', cost_per_unit: '0' }])} className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm font-semibold">Add receiving line</button>
                  <button onClick={receiveOrder} disabled={receiving} className="px-4 py-2 rounded-xl bg-emerald-500 text-black font-bold">Confirm receiving</button>
                </div>
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-white/30 font-bold mb-2">Items</p>
                <div className="space-y-2">{selectedOrder.items?.map((item) => <div key={item.id} className="flex items-center justify-between text-sm"><span>{item.ingredient_name || item.ingredient_id}</span><span>{item.ordered_qty} {item.unit} · ₼{money(item.unit_cost)}</span></div>)}</div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        .input-premium { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07); border-radius: 16px; padding: 12px 14px; color: white; outline: none; width: 100%; }
        .input-premium:focus { border-color: rgba(212,175,55,0.45); }
      `}</style>
    </div>
  );
}
