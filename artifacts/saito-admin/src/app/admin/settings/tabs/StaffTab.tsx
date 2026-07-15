'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Save, Loader2, Plus, X, Trash2, User, Users, Briefcase, Phone, Clock } from 'lucide-react';
import { toast } from '@/lib/toast';
import { motion, AnimatePresence } from 'framer-motion';
import GoldSelect from '@/components/GoldSelect';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { hashPin } from '@/lib/crypto';

type StaffMember = { id: string; name: string; role: string; shift: string; phone: string; pin?: string };
const ROLES = ['Ofisiant', 'Baş Ofisiant', 'Menecer', 'Barmen', 'Aşpaz', 'Kassa'];
const emptyForm = () => ({ name: '', role: ROLES[0], shift: '', phone: '', pin: '' });

const STAFF_CACHE_KEY = 'saito_staff_cache';

const StaffTab = () => {
  const { t } = useLanguage();
  const [staff, setStaff] = useState<StaffMember[]>(() => {
    try { const r = localStorage.getItem(STAFF_CACHE_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
  });
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [form, setForm] = useState(emptyForm());

  useEffect(() => {
    supabase.from('staff').select('*').order('name').then(({ data }) => {
      if (data) {
        setStaff(data as StaffMember[]);
        try { localStorage.setItem(STAFF_CACHE_KEY, JSON.stringify(data)); } catch {}
      }
    });
  }, []);

  const openAdd = () => {
    setEditingStaff(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (s: StaffMember) => {
    setEditingStaff(s);
    setForm({ name: s.name, role: s.role, shift: s.shift, phone: s.phone || '', pin: (s as any).pin || '' });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingStaff(null);
    setForm(emptyForm());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error(t('staff_name_required'), { id: 'action-toast' }); return; }
    setSaving(true);
    try {
      if (editingStaff) {
        const updateData: any = { name: form.name.trim(), role: form.role, shift: form.shift.trim(), phone: form.phone.trim() };
        if (form.pin && form.pin.length === 4) updateData.pin_hash = hashPin(form.pin);
        const { error } = await supabase.from('staff').update(updateData).eq('id', editingStaff.id);
        if (error) throw error;
        setStaff(prev => prev.map(s => s.id === editingStaff.id ? { ...s, ...form } : s));
        toast.success(t('staff_saved'), { id: 'action-toast', duration: 3000 });
      } else {
        const insertData: any = { name: form.name.trim(), role: form.role, shift: form.shift.trim(), phone: form.phone.trim() };
        if (form.pin && form.pin.length === 4) insertData.pin_hash = hashPin(form.pin);
        const { data, error } = await supabase.from('staff').insert([insertData]).select().single();
        if (error) throw error;
        setStaff(prev => [...prev, data as StaffMember]);
        toast.success(t('staff_added'), { id: 'action-toast', duration: 3000 });
      }
      closeModal();
    } catch (e: any) {
      toast.error(e.message || 'Xəta baş verdi', { id: 'action-toast' });
    } finally {
      setSaving(false);
    }
  };

  const removeStaff = async (id: string) => {
    const { error } = await supabase.from('staff').delete().eq('id', id);
    if (error) { toast.error(error.message, { id: 'action-toast' }); return; }
    setStaff(prev => prev.filter(s => s.id !== id));
    toast.success(t('staff_deleted'), { id: 'action-toast', duration: 3000 });
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-[var(--theme-text-secondary)] text-base">{t('staff_count').replace('{n}', String(staff.length))}</p>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-5 py-3 bg-[var(--theme-surface)] text-[var(--theme-text)] text-sm font-bold rounded-2xl hover:bg-[var(--theme-panel)] transition-all shadow-[0_10px_28px_rgba(0,0,0,0.12)]"
        >
          <Plus size={16} /> {t('staff_new')}
        </button>
      </div>

      {staff.length === 0 && (
        <div className="text-center py-16 text-[var(--theme-text-muted)]">
          <Users size={40} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm uppercase tracking-widest">{t('staff_empty')}</p>
        </div>
      )}

      {staff.length > 0 && (
        <>
          {/* Mobil: şaquli kartlar */}
          <div className="md:hidden space-y-3">
            {staff.map((s) => (
              <div
                key={s.id}
                className={`rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] p-4 ${editingStaff?.id === s.id ? 'border-gold/30 bg-gold/[0.04]' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-white leading-tight">{s.name}</p>
                    {s.phone && <p className="text-xs text-[var(--theme-text-secondary)] mt-1 font-mono">{s.phone}</p>}
                     <div className="flex flex-wrap items-center gap-2 mt-2">
                       <span className="text-[11px] font-bold text-gold/80 bg-gold/8 border border-gold/15 px-2.5 py-1 rounded-lg">{s.role}</span>
                       {s.shift && <span className="text-[11px] text-[var(--theme-text-secondary)]">{s.shift}</span>}
                       {(s as any).pin && <span className="text-[11px] font-mono text-white/40">PIN: ••••</span>}
                     </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEdit(s)}
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-all"
                      title="Redaktə et"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button type="button" onClick={() => removeStaff(s.id)} className="w-9 h-9 rounded-lg hover:bg-red-500/10 flex items-center justify-center text-[var(--theme-text-muted)] hover:text-red-400" title="Sil">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: cədvəl */}
          <div className="hidden md:block bg-[var(--theme-surface-muted)] border border-[var(--theme-border)] rounded-2xl overflow-hidden">
            <div className="px-7 py-4 bg-[var(--theme-surface-soft)] grid grid-cols-[1.6fr_auto_auto_auto_auto] gap-4 border-b border-[var(--theme-border)]">
              {[t('staff_col_name'), t('staff_col_role'), t('staff_col_shift'), 'PIN', ''].map((h, i) => <span key={i} className="text-[11px] uppercase tracking-widest text-[var(--theme-text-muted)] font-bold">{h}</span>)}
            </div>
             <div className="divide-y divide-white/5">
               {staff.map(s => (
                 <div key={s.id} className={`px-7 py-5 grid grid-cols-[1.6fr_auto_auto_auto_auto] gap-4 items-center transition-colors ${editingStaff?.id === s.id ? 'bg-gold/[0.04] border-l-2 border-gold' : 'hover:bg-white/[0.02]'}`}>
                   <div>
                     <p className="text-lg font-semibold text-white leading-tight">{s.name}</p>
                     {s.phone && <p className="text-sm text-[var(--theme-text-secondary)] mt-1 font-mono">{s.phone}</p>}
                   </div>
                   <span className="text-sm font-bold text-gold/80 bg-gold/8 border border-gold/15 px-3 py-1.5 rounded-lg whitespace-nowrap">{s.role}</span>
                   <span className="text-sm text-[var(--theme-text-secondary)] whitespace-nowrap">{s.shift || '—'}</span>
                   <span className="text-sm font-mono text-white/60">{(s as any).pin ? '••••' : '—'}</span>
                   <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(s)}
                      className="w-9 h-9 rounded-lg flex items-center justify-center transition-all text-xs text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]"
                      title="Redaktə et"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button type="button" onClick={() => removeStaff(s.id)} className="w-9 h-9 rounded-lg hover:bg-red-500/10 flex items-center justify-center text-[var(--theme-text-muted)] hover:text-red-400 transition-all" title="Sil">
                      <Trash2 size={14} />
                    </button>
                  </div>
                 </div>
               ))}
             </div>
          </div>
          </>
        )}

        {/* Salary / Expenses */}
        <div className="bg-[var(--theme-surface-muted)] border border-[var(--theme-border)] rounded-2xl p-6 mt-6">
          <h3 className="text-white font-bold text-lg mb-4">Maaş və Xərclər</h3>
          <SalarySection />
        </div>

      {/* Staff Modal */}
      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }} className="absolute inset-0 bg-black/40 backdrop-blur-xl" onClick={closeModal} />
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 24 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.92, opacity: 0, y: 24 }} transition={{ type: 'spring', stiffness: 320, damping: 28, mass: 1 }}
              className="relative w-full max-w-lg bg-[var(--theme-surface)] border border-[var(--theme-border)] rounded-[40px] p-8 shadow-2xl max-h-[80vh] flex flex-col"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-black text-[var(--theme-text)]">{editingStaff ? 'İşçi Redaktə' : 'Yeni İşçi'}</h2>
                  <p className="text-xs text-[var(--theme-text-muted)] font-bold uppercase tracking-widest mt-1">{editingStaff ? 'Məlumatları dəyişdir' : 'Yeni işçi əlavə et'}</p>
                </div>
                <button onClick={closeModal} className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-all">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4 flex-1 overflow-y-auto">
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)] font-semibold">
                    <User size={10} className="text-gold/70" /> {t('staff_full_name')}
                  </label>
                  <input
                    className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] focus:bg-[var(--theme-surface-muted)] px-4 py-2.5 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none rounded-xl transition-all"
                    placeholder="Tural Məmmədov"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)] font-semibold">
                      <Phone size={10} className="text-gold/70" /> {t('staff_phone')}
                    </label>
                    <input
                      className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] focus:bg-[var(--theme-surface-muted)] px-4 py-2.5 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none rounded-xl transition-all"
                      placeholder="050 000 00 00"
                      value={form.phone}
                      onChange={e => setForm({ ...form, phone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)] font-semibold">
                      <span className="text-gold/70">🔒</span> PIN kod
                    </label>
                    <input
                      className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] focus:bg-[var(--theme-surface-muted)] px-4 py-2.5 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none rounded-xl transition-all tracking-widest"
                      placeholder="0000"
                      maxLength={4}
                      value={form.pin}
                      onChange={e => setForm({ ...form, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)] font-semibold">
                      <Briefcase size={10} className="text-gold/70" /> {t('staff_position')}
                    </label>
                    <GoldSelect
                      value={form.role}
                      options={ROLES.map(r => ({ value: r, label: r }))}
                      onChange={(val) => setForm({ ...form, role: val })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)] font-semibold">
                      <Clock size={10} className="text-gold/70" /> {t('staff_shift')}
                    </label>
                    <input
                      className="w-full bg-[var(--theme-surface)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] focus:bg-[var(--theme-surface-muted)] px-4 py-2.5 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none rounded-xl transition-all"
                      placeholder="12:00 – 20:00"
                      value={form.shift}
                      onChange={e => setForm({ ...form, shift: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-1 border-t border-[var(--theme-border)]">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 text-xs text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] transition-colors rounded-lg hover:bg-[var(--theme-surface-muted)]"
                  >
                    {t('staff_cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center gap-2 bg-[var(--theme-surface)] text-[var(--theme-text)] px-5 py-2.5 rounded-2xl font-bold text-xs tracking-wide transition-all disabled:opacity-40 shadow-[0_10px_28px_rgba(0,0,0,0.12)] hover:bg-[var(--theme-panel)]"
                  >
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                    {editingStaff ? t('staff_save') : t('staff_add')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

function SalarySection() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [form, setForm] = useState({ staff_id: '', amount: '', note: '', expense_date: new Date().toISOString().split('T')[0] });
  const [showForm, setShowForm] = useState(false);

  const loadExpenses = async () => {
    const res = await fetch('/api/expenses');
    const data = await res.json();
    setExpenses(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    supabase.from('staff').select('id, full_name, role').then(({ data }) => { if (data) setStaffList(data); });
    loadExpenses();
  }, []);

  const addExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.staff_id) { toast.error('İşçi seçin', { id: 'action-toast' }); return; }
    await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setForm({ staff_id: '', amount: '', note: '', expense_date: new Date().toISOString().split('T')[0] });
    setShowForm(false);
    loadExpenses();
  };

  const total = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-white/50 text-sm">Ümumi xərclər: <span className="text-white font-bold">₼{total.toFixed(2)}</span></p>
        <button onClick={() => setShowForm(v => !v)} className="px-4 py-2 bg-[#D4AF37] text-black text-xs font-black rounded-xl">+ Yeni</button>
      </div>
      {showForm && (
        <form onSubmit={addExpense} className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-white/5 p-4 rounded-xl">
          <select className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white" value={form.staff_id} onChange={e => setForm({ ...form, staff_id: e.target.value })}>
            <option value="">İşçi seç</option>
            {staffList.map(s => <option key={s.id} value={s.id}>{s.full_name || s.name} ({s.role})</option>)}
          </select>
          <input type="number" step="0.01" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white" placeholder="Məbləğ" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
          <input type="date" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white" value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })} />
          <button type="submit" className="bg-black text-white text-xs font-black rounded-xl">Yadda saxla</button>
        </form>
      )}
      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {expenses.map(e => (
          <div key={e.id} className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3">
            <div>
              <p className="text-white text-sm font-semibold">{e.category === 'salary' ? 'Maaş' : e.category}</p>
              <p className="text-white/30 text-xs">{e.note || e.expense_date}</p>
            </div>
            <span className="text-white font-bold">₼{Number(e.amount || 0).toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default StaffTab;
