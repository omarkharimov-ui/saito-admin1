'use client';

// 13k — Tədarükçülər rewrite. Owner: "sifarişlər/tədarükçülər səhifəsi çirkindir,
// her modal berbatdır" → one design system (stock-ui): DataTable + Chips,
// detail & form = FULL-HEIGHT DRAWERS (up to the app-sidebar edge), no card grid.
// 13c: Məhsul Kataloqu (vendor price list) — Order Guide prefill + invoice anchor.

import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Plus, Pencil, Trash2, CheckCircle, MessageCircle } from '@/components/ui/saito-icons';
import { toast } from '@/lib/toast';
import type { Supplier, CreateSupplierPayload } from '@/types/inventory';
import { Btn, Chip, DataTable, SearchInput, IconBtn, SpinnerBlock, Drawer, Modal, Field, fieldCls } from '../stock-ui';

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
    setDetailSupplier(null);
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

  if (loading) return <SpinnerBlock height={240} />;

  const contactCls = 'flex items-center gap-2 text-xs text-[var(--theme-text-secondary)]';

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Tədarükçü axtar..." className="flex-1 max-w-sm" />
        <div className="sm:ml-auto flex items-center justify-end">
          <Btn variant="solid" icon={Plus} onClick={openCreate}>Yeni Tədarükçü</Btn>
        </div>
      </div>

      {/* Table (was a card grid — 13k: one row per supplier, quiet) */}
      <DataTable
        rows={filtered.map(s => ({
          ...s,
          __actions: (
            <>
              <IconBtn icon={Pencil} title="Redaktə" tone="blue" onClick={() => openEdit(s)} />
              <IconBtn icon={Trash2} title="Sil" tone="rose" onClick={() => setConfirmDelete(s.id)} />
            </>
          ),
        }))}
        rowKey={r => r.id}
        onRow={r => openDetail(r)}
        actionsWidth={72}
        cols={[
          {
            key: 'name', label: 'Tədarükçü', width: '1.6fr',
            render: r => (
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-[var(--theme-text)] truncate">{r.name}</p>
                <p className="text-[10px] text-[var(--theme-text-muted)] truncate">{r.contact_person || '—'}</p>
              </div>
            ),
          },
          { key: 'phone', label: 'Telefon', width: '1.1fr', hide: 'sm', render: r => <span className="text-xs text-[var(--theme-text-secondary)] tabular-nums">{r.phone || '—'}</span> },
          {
            key: 'status', label: 'Status', width: '100px',
            render: r => <Chip tone={r.status === 'active' ? 'ok' : 'neutral'} dot={false}>{r.status === 'active' ? 'Aktiv' : 'Deaktiv'}</Chip>,
          },
          {
            key: 'score', label: 'Bal', width: '80px', align: 'right', hide: 'md',
            render: r => r.score !== null
              ? <span className={`text-xs font-black tabular-nums ${r.score >= 80 ? 'text-emerald-500' : r.score >= 50 ? 'text-amber-500 light:text-amber-600' : 'text-rose-500'}`}>{r.score}</span>
              : <span className="text-xs text-[var(--theme-text-muted)]">—</span>,
          },
          { key: 'orders', label: 'Sifariş', width: '80px', align: 'right', hide: 'md', render: r => <span className="text-xs text-[var(--theme-text-secondary)] tabular-nums">{r.total_orders}</span> },
        ]}
        empty={
          <div className="py-12 text-center">
            <Plus size={32} className="mx-auto mb-3 opacity-25 text-[var(--theme-text-muted)]" />
            <p className="text-sm font-medium text-[var(--theme-text-secondary)]">Tədarükçü tapılmadı</p>
            <p className="text-xs text-[var(--theme-text-muted)] mt-1">"Yeni Tədarükçü" düyməsi ilə ilk tədarükçünü əlavə edin</p>
          </div>
        }
      />

      {/* ── Detail (13k: full-height drawer, catalog inside) ── */}
      <AnimatePresence>
        {detailSupplier && (
          <Drawer
            wide
            title={detailSupplier.name}
            subtitle={detailSupplier.email || detailSupplier.phone || 'Tədarükçü profili'}
            onClose={() => setDetailSupplier(null)}
            footer={
              <div className="flex gap-3">
                {(detailSupplier as any).whatsapp_number && (
                  <Btn
                    variant="success"
                    icon={MessageCircle}
                    className="flex-1"
                    onClick={() => {
                      const template = (detailSupplier as any).auto_order_template || 'Salam, stok hazırlanması haqqında məlumat verərmi?';
                      const text = encodeURIComponent(template);
                      window.open(`https://wa.me/${(detailSupplier as any).whatsapp_number.replace(/[^0-9]/g, '')}?text=${text}`, '_blank');
                    }}
                  >
                    WhatsApp
                  </Btn>
                )}
                <Btn variant="ghost" className="flex-1" icon={Pencil} onClick={() => { setDetailSupplier(null); openEdit(detailSupplier); }}>
                  Redaktə Et
                </Btn>
              </div>
            }
          >
            <div className="space-y-5">
              {/* metrics (slim, no big cards) */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Ümumi Bal', value: detailSupplier.score !== null ? `${detailSupplier.score}/100` : 'Hesablanmayıb', cls: detailSupplier.score !== null && detailSupplier.score >= 80 ? 'text-emerald-500' : detailSupplier.score !== null && detailSupplier.score >= 50 ? 'text-amber-500 light:text-amber-600' : 'text-rose-500' },
                  { label: 'Vaxtında Təhvil', value: detailSupplier.on_time_delivery_rate !== null ? `${detailSupplier.on_time_delivery_rate}%` : '—', cls: 'text-[var(--theme-text)]' },
                  { label: 'Qiymət Stabililiyi', value: detailSupplier.avg_price_stability !== null ? `${detailSupplier.avg_price_stability}%` : '—', cls: 'text-[var(--theme-text)]' },
                  { label: 'Sifariş Sayı', value: String(detailSupplier.total_orders), cls: 'text-[var(--theme-text)]' },
                ].map(c => (
                  <div key={c.label} className="p-3 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
                    <p className="text-[9px] font-black text-[var(--theme-text-muted)] uppercase tracking-[0.15em]">{c.label}</p>
                    <p className={`text-base font-black mt-1 tabular-nums ${c.cls}`}>{c.value}</p>
                  </div>
                ))}
              </div>

              {/* contact */}
              <div className="space-y-2">
                <p className="text-[9px] font-black text-[var(--theme-text-muted)] uppercase tracking-[0.2em]">Əlaqə</p>
                <div className="space-y-1.5">
                  {detailSupplier.contact_person && <div className={contactCls}><span className="text-[var(--theme-text-muted)] w-20 shrink-0">Şəxs</span>{detailSupplier.contact_person}</div>}
                  {detailSupplier.phone && <div className={contactCls}><span className="text-[var(--theme-text-muted)] w-20 shrink-0">Telefon</span><span className="tabular-nums">{detailSupplier.phone}</span></div>}
                  {(detailSupplier as any).whatsapp_number && <div className={contactCls}><span className="text-[var(--theme-text-muted)] w-20 shrink-0">WhatsApp</span><span className="tabular-nums">{(detailSupplier as any).whatsapp_number}</span></div>}
                  {detailSupplier.email && <div className={contactCls}><span className="text-[var(--theme-text-muted)] w-20 shrink-0">Email</span><span className="truncate">{detailSupplier.email}</span></div>}
                  {detailSupplier.address && <div className={contactCls}><span className="text-[var(--theme-text-muted)] w-20 shrink-0">Ünvan</span><span className="truncate">{detailSupplier.address}</span></div>}
                  {detailSupplier.tax_id && <div className={contactCls}><span className="text-[var(--theme-text-muted)] w-20 shrink-0">VÖEN</span><span className="tabular-nums">{detailSupplier.tax_id}</span></div>}
                </div>
                {(detailSupplier as any).auto_order_template && (
                  <div className="p-3 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
                    <p className="text-[9px] font-black text-[var(--theme-text-muted)] uppercase tracking-[0.15em] mb-1">Avto Sifariş Şablonu (AI)</p>
                    <p className="text-xs text-[var(--theme-text-secondary)]">{(detailSupplier as any).auto_order_template}</p>
                  </div>
                )}
                {detailSupplier.notes && !(detailSupplier as any).auto_order_template && (
                  <div className="p-3 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
                    <p className="text-[9px] font-black text-[var(--theme-text-muted)] uppercase tracking-[0.15em] mb-1">Qeyd</p>
                    <p className="text-xs text-[var(--theme-text-secondary)]">{detailSupplier.notes}</p>
                  </div>
                )}
              </div>

              {/* Məhsul kataloqu */}
              <div className="space-y-3 pt-4 border-t border-[var(--theme-border)]">
                <div className="flex items-center justify-between">
                  <p className="text-[9px] font-black text-[var(--theme-text-muted)] uppercase tracking-[0.2em]">Məhsul Kataloqu</p>
                  <span className="text-[10px] text-[var(--theme-text-muted)] tabular-nums">{catalog.length} məhsul</span>
                </div>
                {catLoading ? (
                  <p className="text-xs text-[var(--theme-text-muted)] py-2">Yüklənir...</p>
                ) : (
                  <div className="space-y-1.5">
                    {catalog.length === 0 && <p className="text-[11px] text-[var(--theme-text-muted)] py-1">Kataloq boşdur — aşağıdan məhsul əlavə edin.</p>}
                    {catalog.map((it) => (
                      <div key={it.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
                        {catEditing === it.id ? (
                          <>
                            <input value={catEdit.name} onChange={e => setCatEdit(p => ({ ...p, name: e.target.value }))}
                              className="flex-1 min-w-0 bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-lg px-2 py-1 text-xs text-[var(--theme-text)] outline-none focus:border-[var(--theme-text)]/40" />
                            <input value={catEdit.unit} onChange={e => setCatEdit(p => ({ ...p, unit: e.target.value }))}
                              className="w-14 bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-lg px-2 py-1 text-xs text-[var(--theme-text)] outline-none" />
                            <input type="number" value={catEdit.unit_price} onChange={e => setCatEdit(p => ({ ...p, unit_price: e.target.value }))}
                              className="w-16 bg-[var(--theme-bg)] border border-[var(--theme-border)] rounded-lg px-2 py-1 text-xs text-[var(--theme-text)] outline-none" />
                            <button onClick={() => saveCatalogItem(it)} className="p-1.5 rounded-lg text-emerald-500 hover:bg-emerald-500/10 transition-colors"><CheckCircle size={14} /></button>
                            <button onClick={() => setCatEditing(null)} className="p-1.5 rounded-lg text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-colors"><Pencil size={13} /></button>
                          </>
                        ) : (
                          <>
                            <span className={`flex-1 min-w-0 truncate text-xs ${it.active === false ? 'text-[var(--theme-text-muted)] line-through' : 'text-[var(--theme-text-secondary)]'}`}>{it.name}</span>
                            <span className="text-[10px] text-[var(--theme-text-muted)] shrink-0">{it.unit || '—'}</span>
                            <span className="text-xs font-semibold text-[var(--theme-text-secondary)] tabular-nums shrink-0">{it.unit_price != null ? `₼${Number(it.unit_price).toFixed(2)}` : '—'}</span>
                            <button onClick={() => { setCatEditing(it.id); setCatEdit({ name: it.name, unit: it.unit || 'gram', unit_price: it.unit_price != null ? String(it.unit_price) : '' }); }}
                              className="p-1.5 rounded-lg text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-colors" title="Redaktə et"><Pencil size={13} /></button>
                            <button onClick={() => removeCatalogItem(it.id)} className="p-1.5 rounded-lg text-rose-500/40 hover:text-rose-500 hover:bg-rose-500/10 transition-colors" title="Sil"><Trash2 size={13} /></button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <input value={catForm.name} onChange={e => setCatForm(p => ({ ...p, name: e.target.value }))} placeholder="Məhsul adı"
                    className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] text-xs text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none focus:border-[var(--theme-text)]/40" />
                  <input value={catForm.unit} onChange={e => setCatForm(p => ({ ...p, unit: e.target.value }))} placeholder="Birim"
                    className="w-14 px-2.5 py-2 rounded-lg bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] text-xs text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none" />
                  <input type="number" value={catForm.unit_price} onChange={e => setCatForm(p => ({ ...p, unit_price: e.target.value }))} placeholder="₼/birim"
                    className="w-16 px-2.5 py-2 rounded-lg bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] text-xs text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none" />
                  <Btn variant="soft" small icon={Plus} title="Kataloğa əlavə et" disabled={!catForm.name.trim()} onClick={() => saveCatalogItem()} className="px-2.5" />
                </div>
              </div>
            </div>
          </Drawer>
        )}
      </AnimatePresence>

      {/* ── Create / Edit (13k: full-height drawer) ── */}
      <AnimatePresence>
        {showModal && (
          <Drawer
            title={editing ? 'Tədarükçünü Redaktə Et' : 'Yeni Tədarükçü'}
            subtitle={editing ? editing.name : 'Təchizat informasiyası'}
            onClose={() => setShowModal(false)}
            footer={
              <div className="flex gap-3">
                <Btn variant="ghost" className="flex-1" onClick={() => setShowModal(false)}>Ləğv Et</Btn>
                <Btn variant="solid" className="flex-1" onClick={save}>{editing ? 'Yadda Saxla' : 'Əlavə Et'}</Btn>
              </div>
            }
          >
            <div className="space-y-4">
              <Field label="Ad *">
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Tədarükçü adı" className={fieldCls} autoFocus />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Əlaqə Şəxs">
                  <input value={form.contact_person} onChange={e => setForm(p => ({ ...p, contact_person: e.target.value }))} placeholder="Ad" className={fieldCls} />
                </Field>
                <Field label="Telefon">
                  <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+994 ..." className={fieldCls} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="WhatsApp Nömrəsi">
                  <input value={(form as any).whatsapp_number || ''} onChange={e => setForm(p => ({ ...p, whatsapp_number: e.target.value } as any))} placeholder="+994 ..." className={fieldCls} />
                </Field>
                <Field label="Email">
                  <input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="email@..." className={fieldCls} />
                </Field>
              </div>
              <Field label="Ünvan">
                <input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} className={fieldCls} />
              </Field>
              <Field label="VÖEN">
                <input value={form.tax_id} onChange={e => setForm(p => ({ ...p, tax_id: e.target.value }))} className={fieldCls} />
              </Field>
              <Field label="Qeyd">
                <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} className={`${fieldCls} resize-none`} />
              </Field>
              <Field label="Avto Sifariş Şablonu (AI)">
                <textarea value={form.auto_order_template} onChange={e => setForm(p => ({ ...p, auto_order_template: e.target.value }))} rows={3} placeholder="WhatsApp sifariş mesajı şablonu..." className={`${fieldCls} resize-none`} />
              </Field>
            </div>
          </Drawer>
        )}
      </AnimatePresence>

      {/* delete confirm */}
      <AnimatePresence>
        {confirmDelete && (
          <Modal title="Tədarükçünü Sil" subtitle="Bu əməliyyat geri alına bilməz" onClose={() => setConfirmDelete(null)}>
            <div className="space-y-5">
              <div className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center bg-rose-500/10 border border-rose-500/25">
                <Trash2 size={20} className="text-rose-500" />
              </div>
              <div className="flex gap-3">
                <Btn variant="ghost" className="flex-1" onClick={() => setConfirmDelete(null)}>İmtina</Btn>
                <Btn variant="danger" className="flex-1" onClick={remove}>Sil</Btn>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}
