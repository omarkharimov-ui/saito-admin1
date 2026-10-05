'use client';

// 13i — the ONE suppliers surface (owner audit: the thin hub tab was a
// duplicate and is gone). Extracted from the old ProcurementTab, restyled
// theme-var based (was hardcoded #0C0C0E modals + gold focus — light-mode bug).
// 13c: Məhsul Kataloqu (vendor price list) — Order Guide prefill + invoice anchor.

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Pencil, Trash2, CheckCircle } from '@/components/ui/saito-icons';
import { TableActionBar } from '@/components/TableActionBar';
import { EmptyState, LoadingState } from '@/components/ProcurementEmptyState';
import { toast } from '@/lib/toast';
import type { Supplier, CreateSupplierPayload } from '@/types/inventory';

const solidBtn = 'bg-[var(--theme-text)] text-[var(--theme-bg)]';
const fieldCls = 'w-full px-4 py-2.5 rounded-xl bg-[var(--theme-bg)] border border-[var(--theme-border)] text-[var(--theme-text)] text-sm outline-none focus:border-[var(--theme-text)]/40 transition-colors';

export default function SuppliersSection() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [detailSupplier, setDetailSupplier] = useState<Supplier | null>(null);

  const [form, setForm] = useState<CreateSupplierPayload>({ name: '', contact_person: '', phone: '', email: '', address: '', tax_id: '', notes: '', auto_order_template: '' });

  const [catalog, setCatalog] = useState<any[]>([]);
  const [catLoading, setCatLoading] = useState(false);
  const [catForm, setCatForm] = useState({ name: '', unit: 'gram', unit_price: '' });
  const [catEditing, setCatEditing] = useState<string | null>(null);
  const [catEdit, setCatEdit] = useState({ name: '', unit: 'gram', unit_price: '' });

  const loadCatalog = async (supplierId: string) => {
    setCatLoading(true);
    try {
      const r = await fetch(`/api/suppliers/items?supplier_id=${supplierId}`);
      if (r.ok) setCatalog(await r.json());
    } catch {}
    setCatLoading(false);
  };

  const openDetail = (s: Supplier) => {
    setDetailSupplier(s);
    setCatEditing(null);
    setCatForm({ name: '', unit: 'gram', unit_price: '' });
    loadCatalog(s.id);
  };

  const saveCatalogItem = async (item?: any) => {
    if (!detailSupplier) return;
    const src = item ? catEdit : catForm;
    if (!src.name.trim()) return toast('Ad tələb olunur');
    const payload: any = { name: src.name.trim(), unit: src.unit || null, unit_price: src.unit_price === '' ? null : Number(src.unit_price) };
    if (!item) payload.supplier_id = detailSupplier.id;
    const url = item ? `/api/suppliers/items/${item.id}` : '/api/suppliers/items';
    const res = await fetch(url, { method: item ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) { const d = await res.json().catch(() => ({})); return toast(d.error || 'Xəta baş verdi'); }
    toast(item ? 'Yeniləndi' : 'Kataloğa əlavə edildi');
    setCatForm({ name: '', unit: 'gram', unit_price: '' });
    setCatEditing(null);
    loadCatalog(detailSupplier.id);
  };

  const removeCatalogItem = async (id: string) => {
    if (!detailSupplier) return;
    const res = await fetch(`/api/suppliers/items/${id}`, { method: 'DELETE' });
    if (!res.ok) return toast('Silinmədi');
    toast('Silindi');
    loadCatalog(detailSupplier.id);
  };

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/suppliers');
      if (res.ok) setSuppliers(await res.json());
    } catch {}
    setLoading(false);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', contact_person: '', phone: '', whatsapp_number: '', email: '', address: '', tax_id: '', notes: '', auto_order_template: '' });
    setShowModal(true);
  };

  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({ name: s.name, contact_person: s.contact_person || '', phone: s.phone || '', whatsapp_number: (s as any).whatsapp_number || '', email: s.email || '', address: s.address || '', tax_id: s.tax_id || '', notes: s.notes || '', auto_order_template: (s as any).auto_order_template || '' });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast('Ad tələb olunur');
    const url = editing ? `/api/suppliers/${editing.id}` : '/api/suppliers';
    const method = editing ? 'PATCH' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    if (!res.ok) return toast('Xəta baş verdi');
    toast(editing ? 'Yeniləndi' : 'Əlavə edildi');
    setShowModal(false);
    load();
  };

  const remove = async () => {
    if (!confirmDelete) return;
    const res = await fetch(`/api/suppliers/${confirmDelete}`, { method: 'DELETE' });
    if (!res.ok) return toast('Silinmədi');
    toast('Silindi');
    setConfirmDelete(null);
    load();
  };

  const filtered = suppliers.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex-1 max-w-sm min-w-56">
          <TableActionBar search={search} onSearchChange={setSearch} searchPlaceholder="Tədarükçü axtar..." />
        </div>
        <button onClick={openCreate} className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all active:scale-[0.97] ${solidBtn}`}>
          <Plus size={14} /> Yeni Tədarükçü
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Plus size={32} className="text-[var(--theme-text-muted)]" />} title="Tədarükçü tapılmadı" description="Hələ heç bir tədarükçü əlavə edilməyib" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((s, i) => (
            <motion.div key={s.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
              onClick={() => openDetail(s)}
              className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4 hover:border-[var(--theme-text)]/35 hover:bg-[var(--theme-surface-soft)] transition-all cursor-pointer active:scale-[0.99]">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[var(--theme-text)] truncate">{s.name}</div>
                  <div className="mt-1 text-[11px] text-[var(--theme-text-muted)] space-y-0.5">
                    {s.contact_person && <div>{s.contact_person}</div>}
                    {s.phone && <div>{s.phone}</div>}
                    {s.email && <div className="truncate">{s.email}</div>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={e => { e.stopPropagation(); openEdit(s); }} className="p-1.5 rounded-lg hover:bg-[var(--theme-surface-soft)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-colors"><Pencil size={13} /></button>
                  <button onClick={e => { e.stopPropagation(); setConfirmDelete(s.id); }} className="p-1.5 rounded-lg hover:bg-rose-500/10 text-[var(--theme-text-muted)]/50 hover:text-rose-500 transition-colors"><Trash2 size={13} /></button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {s.score !== null && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${s.score >= 80 ? 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10' : s.score >= 50 ? 'text-amber-500 border-amber-500/30 bg-amber-500/10' : 'text-rose-500 border-rose-500/30 bg-rose-500/10'}`}>
                    {s.score}/100
                  </span>
                )}
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${s.status === 'active' ? 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10' : 'text-[var(--theme-text-muted)] border-[var(--theme-border)]'}`}>
                  {s.status === 'active' ? 'Aktiv' : 'Deaktiv'}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full text-[var(--theme-text-muted)] border border-[var(--theme-border)] tabular-nums">
                  {s.total_orders} sifariş
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* create/edit modal */}
      <AnimatePresence>
        {showModal && (
          <ModalShell key="supplier-modal" title={editing ? 'Redaktə Et' : 'Yeni Tədarükçü'} onClose={() => setShowModal(false)}>
            <div className="space-y-3">
              {(['name', 'contact_person', 'phone', 'whatsapp_number', 'email', 'address', 'tax_id', 'notes', 'auto_order_template'] as const).map(f => (
                <div key={f}>
                  <label className="text-[11px] text-[var(--theme-text-muted)] font-semibold uppercase tracking-wider mb-1 block">
                    {f === 'name' ? 'Ad' : f === 'contact_person' ? 'Əlaqə Şəxs' : f === 'phone' ? 'Telefon' : f === 'whatsapp_number' ? 'WhatsApp Nömrəsi' : f === 'email' ? 'Email' : f === 'address' ? 'Ünvan' : f === 'tax_id' ? 'VÖEN' : f === 'auto_order_template' ? 'Avto Sifariş Şablonu (AI)' : 'Qeyd'}
                  </label>
                  <textarea
                    value={(form as any)[f] || ''}
                    onChange={e => setForm(p => ({ ...p, [f]: e.target.value }))}
                    rows={f === 'auto_order_template' ? 3 : 1}
                    className={`${fieldCls} ${f === 'auto_order_template' ? 'resize-none' : ''}`}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 rounded-xl text-xs font-bold text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-surface-soft)] transition-colors">Ləğv Et</button>
              <button onClick={save} className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-[0.97] ${solidBtn}`}>{editing ? 'Yadda Saxla' : 'Əlavə Et'}</button>
            </div>
          </ModalShell>
        )}
      </AnimatePresence>

      {/* delete confirm */}
      <AnimatePresence>
        {confirmDelete && (
          <ModalShell key="supplier-delete" title="Tədarükçünü Sil" onClose={() => setConfirmDelete(null)} wide={false}>
            <p className="text-sm text-[var(--theme-text-muted)]">Bu tədarükçünü silmək istədiyinizə əminsiniz?</p>
            <div className="flex gap-2 mt-5 justify-end">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2.5 rounded-xl text-xs font-bold text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-surface-soft)] transition-colors">İmtina</button>
              <button onClick={remove} className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-rose-500/15 hover:bg-rose-500/25 text-rose-500 border border-rose-500/30 transition-all active:scale-[0.97]">Sil</button>
            </div>
          </ModalShell>
        )}
      </AnimatePresence>

      {/* detail + catalog modal */}
      <AnimatePresence>
        {detailSupplier && (
          <ModalShell key="supplier-detail" title={detailSupplier.name} subtitle={detailSupplier.email || detailSupplier.phone || undefined} onClose={() => setDetailSupplier(null)} wide>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { label: 'Ümumi Bal', value: detailSupplier.score !== null ? `${detailSupplier.score}/100` : 'Hesablanmayıb', cls: detailSupplier.score !== null && detailSupplier.score >= 80 ? 'text-emerald-500' : detailSupplier.score !== null && detailSupplier.score >= 50 ? 'text-amber-500' : 'text-rose-500' },
                { label: 'Vaxtında Təhvil', value: detailSupplier.on_time_delivery_rate !== null ? `${detailSupplier.on_time_delivery_rate}%` : '—', cls: '' },
                { label: 'Qiymət Stabililiyi', value: detailSupplier.avg_price_stability !== null ? `${detailSupplier.avg_price_stability}%` : '—', cls: '' },
                { label: 'Sifariş Sayı', value: String(detailSupplier.total_orders), cls: '' },
              ].map(c => (
                <div key={c.label} className="p-3 rounded-xl bg-[var(--theme-bg)] border border-[var(--theme-border)]">
                  <p className="text-[10px] text-[var(--theme-text-muted)] uppercase tracking-wider font-semibold">{c.label}</p>
                  <p className={`text-lg font-black mt-1 tabular-nums ${c.cls || 'text-[var(--theme-text)]'}`}>{c.value}</p>
                </div>
              ))}
            </div>
            <div className="space-y-1.5 text-xs text-[var(--theme-text-muted)]">
              {detailSupplier.contact_person && <div>{detailSupplier.contact_person}</div>}
              {detailSupplier.phone && <div>{detailSupplier.phone}</div>}
              {(detailSupplier as any).whatsapp_number && <div>WhatsApp: {(detailSupplier as any).whatsapp_number}</div>}
              {detailSupplier.email && <div>{detailSupplier.email}</div>}
              {detailSupplier.address && <div>{detailSupplier.address}</div>}
              {detailSupplier.tax_id && <div>VÖEN: {detailSupplier.tax_id}</div>}
              {(detailSupplier as any).auto_order_template && <div className="mt-2 p-2.5 rounded-lg bg-[var(--theme-bg)] border border-[var(--theme-border)] text-[var(--theme-text-muted)]">{(detailSupplier as any).auto_order_template}</div>}
              {detailSupplier.notes && !(detailSupplier as any).auto_order_template && <div className="p-2.5 rounded-lg bg-[var(--theme-bg)] border border-[var(--theme-border)] text-[var(--theme-text-muted)]">{detailSupplier.notes}</div>}
            </div>

            {/* Məhsul kataloqu */}
            <div className="mt-5 pt-4 border-t border-[var(--theme-border)]">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] text-[var(--theme-text-muted)] uppercase tracking-[0.2em] font-bold">Məhsul Kataloqu</p>
                <span className="text-[10px] text-[var(--theme-text-muted)] tabular-nums">{catalog.length} məhsul</span>
              </div>
              {catLoading ? (
                <p className="text-xs text-[var(--theme-text-muted)] py-2">Yüklənir...</p>
              ) : (
                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                  {catalog.length === 0 && <p className="text-[11px] text-[var(--theme-text-muted)] py-1">Kataloq boşdur — aşağıdan məhsul əlavə edin.</p>}
                  {catalog.map((it) => (
                    <div key={it.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--theme-bg)] border border-[var(--theme-border)]">
                      {catEditing === it.id ? (
                        <>
                          <input value={catEdit.name} onChange={e => setCatEdit(p => ({ ...p, name: e.target.value }))}
                            className="flex-1 min-w-0 bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-md px-2 py-1 text-xs text-[var(--theme-text)] outline-none focus:border-[var(--theme-text)]/40" />
                          <input value={catEdit.unit} onChange={e => setCatEdit(p => ({ ...p, unit: e.target.value }))}
                            className="w-14 bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-md px-2 py-1 text-xs text-[var(--theme-text)] outline-none" />
                          <input type="number" value={catEdit.unit_price} onChange={e => setCatEdit(p => ({ ...p, unit_price: e.target.value }))}
                            className="w-16 bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-md px-2 py-1 text-xs text-[var(--theme-text)] outline-none" />
                          <button onClick={() => saveCatalogItem(it)} className="p-1 text-emerald-500 hover:text-emerald-400"><CheckCircle size={13} /></button>
                          <button onClick={() => setCatEditing(null)} className="p-1 text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]"><X size={13} /></button>
                        </>
                      ) : (
                        <>
                          <span className={`flex-1 min-w-0 truncate text-xs ${it.active === false ? 'text-[var(--theme-text-muted)] line-through' : 'text-[var(--theme-text-secondary)]'}`}>{it.name}</span>
                          <span className="text-[10px] text-[var(--theme-text-muted)] shrink-0">{it.unit || '—'}</span>
                          <span className="text-xs font-semibold text-[var(--theme-text-secondary)] tabular-nums shrink-0">{it.unit_price != null ? `₼${Number(it.unit_price).toFixed(2)}` : '—'}</span>
                          <button onClick={() => { setCatEditing(it.id); setCatEdit({ name: it.name, unit: it.unit || 'gram', unit_price: it.unit_price != null ? String(it.unit_price) : '' }); }}
                            className="p-1 rounded text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-colors"><Pencil size={12} /></button>
                          <button onClick={() => removeCatalogItem(it.id)} className="p-1 rounded text-rose-500/40 hover:text-rose-500 transition-colors"><Trash2 size={12} /></button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-1.5 mt-2">
                <input value={catForm.name} onChange={e => setCatForm(p => ({ ...p, name: e.target.value }))} placeholder="Məhsul adı"
                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-[var(--theme-bg)] border border-[var(--theme-border)] text-xs text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none focus:border-[var(--theme-text)]/40" />
                <input value={catForm.unit} onChange={e => setCatForm(p => ({ ...p, unit: e.target.value }))} placeholder="Birim"
                  className="w-14 px-2.5 py-1.5 rounded-lg bg-[var(--theme-bg)] border border-[var(--theme-border)] text-xs text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none" />
                <input type="number" value={catForm.unit_price} onChange={e => setCatForm(p => ({ ...p, unit_price: e.target.value }))} placeholder="₼/birim"
                  className="w-16 px-2.5 py-1.5 rounded-lg bg-[var(--theme-bg)] border border-[var(--theme-border)] text-xs text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none" />
                <button onClick={() => saveCatalogItem()} disabled={!catForm.name.trim()} title="Kataloğa əlavə et"
                  className={`p-1.5 rounded-lg transition-all active:scale-90 disabled:opacity-30 ${solidBtn}`}><Plus size={14} /></button>
              </div>
            </div>

            <div className="flex gap-2 mt-5 justify-end">
              {(detailSupplier as any).whatsapp_number && (
                <button
                  onClick={() => {
                    const template = (detailSupplier as any).auto_order_template || 'Salam, stok hazırlanması haqqında məlumat verərmi?';
                    const text = encodeURIComponent(template);
                    window.open(`https://wa.me/${(detailSupplier as any).whatsapp_number.replace(/[^0-9]/g, '')}?text=${text}`, '_blank');
                  }}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-500 border border-emerald-500/30 transition-all active:scale-[0.97]"
                >
                  WhatsApp
                </button>
              )}
              <button onClick={() => { setDetailSupplier(null); openEdit(detailSupplier); }} className="px-4 py-2.5 rounded-xl text-xs font-bold text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] border border-[var(--theme-border)] hover:bg-[var(--theme-surface-soft)] transition-all active:scale-[0.97]">Redaktə Et</button>
              <button onClick={() => setDetailSupplier(null)} className="px-4 py-2.5 rounded-xl text-xs font-bold text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-colors">Bağla</button>
            </div>
          </ModalShell>
        )}
      </AnimatePresence>
    </div>
  );
}

function ModalShell({ title, subtitle, wide = true, onClose, children }: {
  title: string; subtitle?: string; wide?: boolean; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }} transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className={`relative w-full ${wide ? 'max-w-lg' : 'max-w-sm'} bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-y-auto`}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-black text-[var(--theme-text)] tracking-tight">{title}</h3>
            {subtitle && <p className="text-xs text-[var(--theme-text-muted)] mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--theme-surface-soft)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-colors"><X size={16} /></button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}
