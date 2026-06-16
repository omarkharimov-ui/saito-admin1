'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Search, Pencil, Trash2 } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { toast } from '@/lib/toast';
import type { Supplier, CreateSupplierPayload } from '@/types/inventory';
import { PageTransition } from '@/components/PageTransition';
import { GlassCard } from '@/components/GlassCard';

type SupplierForm = {
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  tax_id: string;
  notes: string;
};

const emptyForm = (): SupplierForm => ({
  name: '', contact_person: '', phone: '', email: '', address: '', tax_id: '', notes: '',
});

const modalV = {
  hidden: { opacity: 0, scale: 0.96, y: 14 },
  show: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring' as const, stiffness: 400, damping: 32 } },
  exit: { opacity: 0, scale: 0.95, y: 8, transition: { duration: 0.14 } },
};

export default function SuppliersPage() {
  const { t } = useLanguage();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SupplierForm>(emptyForm());
  const [confirmDelete, setConfirmDelete] = useState<Supplier | null>(null);

  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await fetch('/api/suppliers');
      if (res.ok) setSuppliers(await res.json());
      else throw new Error('Failed to fetch');
    } catch {
      toast.error('Tədarükçülər yüklənə bilmədi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (supplier: Supplier) => {
    setEditing(supplier);
    setForm({
      name: supplier.name,
      contact_person: supplier.contact_person || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || '',
      tax_id: supplier.tax_id || '',
      notes: supplier.notes || '',
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm());
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || !form.name.trim()) return;
    setSaving(true);
    try {
      const payload: CreateSupplierPayload = {
        name: form.name.trim(),
        contact_person: form.contact_person.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        tax_id: form.tax_id.trim() || undefined,
        notes: form.notes.trim() || undefined,
      };
      if (editing) {
        const res = await fetch(`/api/suppliers/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        toast.success('Tədarükçü yeniləndi');
      } else {
        const res = await fetch('/api/suppliers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        toast.success('Tədarükçü əlavə edildi');
      }
      closeModal();
      fetchSuppliers();
    } catch (e: any) {
      toast.error(e.message || 'Xəta baş verdi');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      const res = await fetch(`/api/suppliers/${confirmDelete.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('Tədarükçü silindi');
      setConfirmDelete(null);
      fetchSuppliers();
    } catch (e: any) {
      toast.error(e.message || 'Silinə bilmədi');
    }
  };

  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <PageTransition className="space-y-6 pb-24">
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border backdrop-blur-xl bg-white/[0.02] border-white/[0.06]"
        style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.03)' }}
      >
        <div>
          <h1 className="text-2xl font-serif font-bold text-white tracking-tight">Tədarükçülər</h1>
          <p className="text-[11px] text-white/30 uppercase tracking-[0.2em] mt-1">Suppliers</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold tracking-wide transition-all active:scale-[0.97]"
          style={{ background: '#111', border: '1px solid rgba(255,255,255,0.16)', color: '#fff' }}
        >
          <Plus size={15} /> Yeni Tədarükçü
        </button>
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Tədarükçü axtar..."
          className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/20 outline-none focus:border-[#D4AF37]/30 transition-colors"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <GlassCard intensity="light" padding="xl" className="text-center">
          <p className="text-sm font-medium text-white/30">
            {searchQuery ? 'Axtarış nəticəsi tapılmadı' : 'Hələ tədarükçü əlavə edilməyib'}
          </p>
        </GlassCard>
      ) : (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="rounded-2xl overflow-hidden"
          style={{ border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div
            className="hidden lg:grid gap-4 px-6 py-3 text-[10px] font-bold tracking-[0.15em] uppercase text-white/20"
            style={{
              gridTemplateColumns: '1fr 1fr 120px 150px 80px 80px 50px',
              background: 'rgba(255,255,255,0.018)',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <span>Ad</span>
            <span>Əlaqə Şəxs</span>
            <span>Telefon</span>
            <span>Email</span>
            <span>Status</span>
            <span className="text-right">Bal</span>
            <span className="text-right">Sifariş</span>
          </div>

          {filtered.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="group cursor-pointer transition-colors hover:bg-white/[0.018]"
              style={{ borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
              onClick={() => openEdit(s)}
            >
              <div
                className="hidden lg:grid gap-4 items-center px-6 py-4"
                style={{ gridTemplateColumns: '1fr 1fr 120px 150px 80px 80px 50px' }}
              >
                <p className="text-sm font-semibold truncate text-white">{s.name}</p>
                <p className="text-sm text-white/60 truncate">{s.contact_person || '—'}</p>
                <p className="text-sm text-white/60 truncate">{s.phone || '—'}</p>
                <p className="text-sm text-white/60 truncate">{s.email || '—'}</p>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold w-fit ${
                  s.status === 'active'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${s.status === 'active' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  {s.status === 'active' ? 'Aktiv' : 'Deaktiv'}
                </span>
                <p className="text-sm text-white/60 tabular-nums text-right">{s.score ?? '—'}</p>
                <p className="text-sm text-white/60 tabular-nums text-right">{s.total_orders}</p>
              </div>

              <div className="lg:hidden p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">{s.name}</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${
                    s.status === 'active'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}>
                    {s.status === 'active' ? 'Aktiv' : 'Deaktiv'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/40">
                  {s.contact_person && <span>👤 {s.contact_person}</span>}
                  {s.phone && <span>📞 {s.phone}</span>}
                  {s.email && <span>✉️ {s.email}</span>}
                  <span>Bal: {s.score ?? '—'}</span>
                  <span>Sifariş: {s.total_orders}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      <AnimatePresence>
        {modalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              onClick={closeModal}
            />
            <motion.div
              variants={modalV} initial="hidden" animate="show" exit="exit"
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            >
              <div
                className="w-full max-w-lg rounded-2xl border pointer-events-auto overflow-hidden"
                style={{
                  background: 'var(--theme-panel, #111)',
                  borderColor: 'var(--theme-border, rgba(255,255,255,0.08))',
                  boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
                }}
              >
                <div className="flex items-center justify-between px-6 pt-5 pb-3">
                  <h2 className="text-lg font-bold text-white">
                    {editing ? 'Tədarükçünü Redaktə Et' : 'Yeni Tədarükçü'}
                  </h2>
                  <button onClick={closeModal} className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/[0.06] transition-all">
                    <X size={18} />
                  </button>
                </div>
                <form onSubmit={handleSave} className="px-6 pb-6 space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-white/40 mb-1.5">Ad *</label>
                    <input
                      required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/20 outline-none focus:border-[#D4AF37]/30 transition-colors"
                      placeholder="Tədarükçü adı"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-white/40 mb-1.5">Əlaqə Şəxs</label>
                      <input
                        value={form.contact_person} onChange={e => setForm(p => ({ ...p, contact_person: e.target.value }))}
                        className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/20 outline-none focus:border-[#D4AF37]/30 transition-colors"
                        placeholder="Ad Soyad"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-white/40 mb-1.5">Telefon</label>
                      <input
                        value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                        className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/20 outline-none focus:border-[#D4AF37]/30 transition-colors"
                        placeholder="+994"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-white/40 mb-1.5">Email</label>
                    <input
                      type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/20 outline-none focus:border-[#D4AF37]/30 transition-colors"
                      placeholder="email@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-white/40 mb-1.5">Ünvan</label>
                    <input
                      value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/20 outline-none focus:border-[#D4AF37]/30 transition-colors"
                      placeholder="Ünvan"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-white/40 mb-1.5">Vergi No</label>
                      <input
                        value={form.tax_id} onChange={e => setForm(p => ({ ...p, tax_id: e.target.value }))}
                        className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/20 outline-none focus:border-[#D4AF37]/30 transition-colors"
                        placeholder="VÖEN"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-white/40 mb-1.5">Qeydlər</label>
                      <input
                        value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                        className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/20 outline-none focus:border-[#D4AF37]/30 transition-colors"
                        placeholder="Qeyd"
                      />
                    </div>
                  </div>
                  {editing && (
                    <div className="flex items-center gap-2 text-xs text-white/30">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete(editing); closeModal(); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 size={12} /> Sil
                      </button>
                    </div>
                  )}
                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button" onClick={closeModal}
                      className="px-4 py-2.5 rounded-xl text-sm font-bold text-white/40 hover:text-white transition-colors"
                    >
                      İmtina
                    </button>
                    <button
                      type="submit" disabled={saving || !form.name.trim()}
                      className="px-5 py-2.5 rounded-xl text-sm font-bold tracking-wide transition-all active:scale-[0.97] disabled:opacity-40"
                      style={{ background: '#D4AF37', color: '#000' }}
                    >
                      {saving ? 'Yadda saxlanılır...' : editing ? 'Yenilə' : 'Əlavə Et'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmDelete && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              onClick={() => setConfirmDelete(null)}
            />
            <motion.div
              variants={modalV} initial="hidden" animate="show" exit="exit"
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            >
              <div
                className="w-full max-w-sm rounded-2xl border pointer-events-auto p-6"
                style={{
                  background: 'var(--theme-panel, #111)',
                  borderColor: 'var(--theme-border, rgba(255,255,255,0.08))',
                  boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
                }}
              >
                <h3 className="text-lg font-bold text-white mb-2">Tədarükçünü Sil</h3>
                <p className="text-sm text-white/50 mb-6">
                  <strong className="text-white">{confirmDelete.name}</strong> tədarükçüsünü silmək istədiyinizə əminsiniz?
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="px-4 py-2.5 rounded-xl text-sm font-bold text-white/40 hover:text-white transition-colors"
                  >
                    İmtina
                  </button>
                  <button
                    onClick={handleDelete}
                    className="px-5 py-2.5 rounded-xl text-sm font-bold tracking-wide bg-red-500 text-white transition-all active:scale-[0.97]"
                  >
                    Sil
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}
