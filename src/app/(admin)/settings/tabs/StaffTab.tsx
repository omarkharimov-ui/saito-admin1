'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Save, Loader2, Plus, X, Trash2, User, Users, Briefcase, Phone, Clock } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import GoldSelect from '@/components/GoldSelect';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { GsLoader } from './_shared';
import { useTheme } from '@/lib/theme/ThemeContext';

type StaffMember = { id: string; name: string; role: string; shift: string; phone: string };
const ROLES = ['Ofisiant', 'Baş Ofisiant', 'Menecer', 'Barmen', 'Aşpaz', 'Kassa'];
const emptyForm = () => ({ name: '', role: ROLES[0], shift: '', phone: '' });

const STAFF_CACHE_KEY = 'saito_staff_cache';

const StaffTab = () => {
  const { t } = useLanguage();
  const { lightMode } = useTheme();
  const [staff, setStaff] = useState<StaffMember[]>(() => {
    try { const r = localStorage.getItem(STAFF_CACHE_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('staff').select('*').order('name').then(({ data }) => {
      if (data) {
        setStaff(data as StaffMember[]);
        try { localStorage.setItem(STAFF_CACHE_KEY, JSON.stringify(data)); } catch {}
      }
    });
  }, []);

  const openEdit = (s: StaffMember) => {
    setEditingId(s.id);
    setForm({ name: s.name, role: s.role, shift: s.shift, phone: s.phone || '' });
    setShowForm(false);
  };

  const cancelEdit = () => { setEditingId(null); setForm(emptyForm()); };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error(t('staff_name_required'), { id: 'action-toast' }); return; }
    setSaving(true);
    const { error } = await supabase.from('staff').update({ name: form.name.trim(), role: form.role, shift: form.shift.trim(), phone: form.phone.trim() }).eq('id', editingId!);
    if (error) { toast.error(error.message, { id: 'action-toast' }); }
    else {
      setStaff(prev => prev.map(s => s.id === editingId ? { ...s, ...form } : s));
      toast.success(t('staff_saved'), { id: 'action-toast', duration: 3000 });
      cancelEdit();
    }
    setSaving(false);
  };

  const addStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error(t('staff_name_required'), { id: 'action-toast' }); return; }
    setSaving(true);
    const { data, error } = await supabase.from('staff').insert([{ name: form.name.trim(), role: form.role, shift: form.shift.trim(), phone: form.phone.trim() }]).select().single();
    if (error) { toast.error(error.message, { id: 'action-toast' }); }
    else { setStaff(prev => [...prev, data as StaffMember]); setForm(emptyForm()); setShowForm(false); toast.success(t('staff_added'), { id: 'action-toast', duration: 3000 }); }
    setSaving(false);
  };

  const removeStaff = async (id: string) => {
    const { error } = await supabase.from('staff').delete().eq('id', id);
    if (error) { toast.error(error.message, { id: 'action-toast' }); return; }
    setStaff(prev => prev.filter(s => s.id !== id));
    toast.success(t('staff_deleted'), { id: 'action-toast', duration: 3000 });
  };

  const staffForm = (onSubmit: (e: React.FormEvent) => void, submitLabel: string, onCancel: () => void) => (
    <motion.form
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      onSubmit={onSubmit}
      className="overflow-visible"
    >
      <div className={`mt-3 rounded-2xl bg-gradient-to-b from-white/[0.04] to-transparent border p-6 space-y-5 ${lightMode ? 'border-gray-200' : 'border-white/[0.08]'}`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className={`flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-semibold ${lightMode ? 'text-gray-500' : 'text-white/55'}`}>
              <User size={10} className="text-gold/70" /> {t('staff_full_name')}
            </label>
            <input
              className={`w-full border focus:border-gold/60 focus:bg-white/[0.06] px-4 py-2.5 text-sm outline-none rounded-xl transition-all ${lightMode ? 'bg-gray-50/80 border-gray-200 text-gray-900 placeholder:text-gray-400' : 'bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20'}`}
              placeholder="Tural Məmmədov"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label className={`flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-semibold ${lightMode ? 'text-gray-500' : 'text-white/55'}`}>
              <Phone size={10} className="text-gold/70" /> {t('staff_phone')}
            </label>
            <input
              className={`w-full border focus:border-gold/60 focus:bg-white/[0.06] px-4 py-2.5 text-sm outline-none rounded-xl transition-all ${lightMode ? 'bg-gray-50/80 border-gray-200 text-gray-900 placeholder:text-gray-400' : 'bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20'}`}
              placeholder="050 000 00 00"
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label className={`flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-semibold ${lightMode ? 'text-gray-500' : 'text-white/55'}`}>
              <Briefcase size={10} className="text-gold/70" /> {t('staff_position')}
            </label>
            <GoldSelect
              value={form.role}
              options={ROLES.map(r => ({ value: r, label: r }))}
              onChange={(val) => setForm({ ...form, role: val })}
            />
          </div>
          <div className="space-y-1.5">
            <label className={`flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-semibold ${lightMode ? 'text-gray-500' : 'text-white/55'}`}>
              <Clock size={10} className="text-gold/70" /> {t('staff_shift')}
            </label>
            <input
              className={`w-full border focus:border-gold/60 focus:bg-white/[0.06] px-4 py-2.5 text-sm outline-none rounded-xl transition-all ${lightMode ? 'bg-gray-50/80 border-gray-200 text-gray-900 placeholder:text-gray-400' : 'bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20'}`}
              placeholder="12:00 – 20:00"
              value={form.shift}
              onChange={e => setForm({ ...form, shift: e.target.value })}
            />
          </div>
        </div>

        <div className={`flex items-center justify-end gap-3 pt-1 border-t ${lightMode ? 'border-gray-200' : 'border-white/[0.05]'}`}>
          <button
            type="button"
            onClick={onCancel}
            className={`px-4 py-2 text-xs hover:text-white/70 transition-colors rounded-lg ${lightMode ? 'text-gray-400 hover:bg-gray-100' : 'text-white/30 hover:bg-white/5'}`}
          >
            {t('staff_cancel')}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-gold/90 text-black px-5 py-2.5 rounded-xl font-bold text-xs tracking-wide transition-all disabled:opacity-40 shadow-lg shadow-gold/10"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {submitLabel}
          </button>
        </div>
      </div>
    </motion.form>
  );

  // Loading spinner removed - instant render

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <p className={`text-base ${lightMode ? 'text-gray-600' : 'text-white/65'}`}>{t('staff_count').replace('{n}', String(staff.length))}</p>
        {!editingId && (
          <button
            onClick={() => { setShowForm(v => !v); setEditingId(null); setForm(emptyForm()); }}
            className="flex items-center gap-2 px-5 py-3 bg-gold text-black text-sm font-bold rounded-xl hover:bg-white transition-all shadow-lg shadow-gold/10"
          >
            <Plus size={16} /> {t('staff_new')}
          </button>
        )}
      </div>

      <AnimatePresence>
        {showForm && !editingId && staffForm(addStaff, t('staff_add'), () => setShowForm(false))}
      </AnimatePresence>

      {staff.length === 0 && !showForm && (
        <div className={`text-center py-16 ${lightMode ? 'text-gray-300' : 'text-white/20'}`}>
          <Users size={40} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm uppercase tracking-widest">{t('staff_empty')}</p>
        </div>
      )}

      {staff.length > 0 && (
        <>
          {/* Mobil: şaquli kartlar, horizontal scroll yox */}
          <div className="md:hidden space-y-3">
            {staff.map((s) => (
              <div
                key={s.id}
                className={`rounded-2xl border p-4 ${lightMode ? 'border-gray-200 bg-gray-50' : 'border-white/[0.06] bg-white/[0.02]'}${editingId === s.id ? 'border-gold/30 bg-gold/[0.04]' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className={`text-base font-semibold leading-tight ${lightMode ? 'text-gray-900' : 'text-white'}`}>{s.name}</p>
                    {s.phone && <p className={`text-xs mt-1 font-mono ${lightMode ? 'text-gray-500' : 'text-white/50'}`}>{s.phone}</p>}
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className="text-[11px] font-bold text-gold/80 bg-gold/8 border border-gold/15 px-2.5 py-1 rounded-lg">{s.role}</span>
                      {s.shift && <span className={`text-[11px] ${lightMode ? 'text-gray-500' : 'text-white/50'}`}>{s.shift}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => (editingId === s.id ? cancelEdit() : openEdit(s))}
                      className={`w-9 h-9 rounded-lg flex items-center justify-center ${editingId === s.id ? 'bg-white/10 text-white' : 'text-white/30'}`}
                      title="Redaktə et"
                    >
                      {editingId === s.id ? <X size={14} /> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>}
                    </button>
                    <button type="button" onClick={() => removeStaff(s.id)} className={`w-9 h-9 rounded-lg hover:bg-red-500/10 flex items-center justify-center hover:text-red-400 ${lightMode ? 'text-gray-300' : 'text-white/20'}`} title="Sil">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {editingId === s.id && <div className="mt-3 pt-1">{staffForm(saveEdit, t('staff_save'), cancelEdit)}</div>}
              </div>
            ))}
          </div>

          {/* Desktop: cədvəl */}
          <div className={`hidden md:block bg-card border rounded-2xl overflow-hidden ${lightMode ? 'border-gray-100' : 'border-white/5'}`}>
            <div className={`px-7 py-4 grid grid-cols-[1.6fr_auto_auto_auto] gap-4 border-b ${lightMode ? 'bg-gray-50 border-gray-100' : 'bg-white/[0.02] border-white/5'}`}>
              {[t('staff_col_name'), t('staff_col_role'), t('staff_col_shift'), ''].map((h, i) => <span key={i} className={`text-[11px] uppercase tracking-widest font-bold ${lightMode ? 'text-gray-500' : 'text-white/50'}`}>{h}</span>)}
            </div>
            <div className={`divide-y ${lightMode ? 'divide-gray-100' : 'divide-white/5'}`}>
              {staff.map(s => (
                <React.Fragment key={s.id}>
                  <div className={`px-7 py-5 grid grid-cols-[1.6fr_auto_auto_auto] gap-4 items-center transition-colors ${editingId === s.id ? 'bg-gold/[0.04] border-l-2 border-gold' : 'hover:bg-white/[0.02]'}`}>
                    <div>
                      <p className={`text-lg font-semibold leading-tight ${lightMode ? 'text-gray-900' : 'text-white'}`}>{s.name}</p>
                      {s.phone && <p className={`text-sm mt-1 font-mono ${lightMode ? 'text-gray-500' : 'text-white/55'}`}>{s.phone}</p>}
                    </div>
                    <span className="text-sm font-bold text-gold/80 bg-gold/8 border border-gold/15 px-3 py-1.5 rounded-lg whitespace-nowrap">{s.role}</span>
                    <span className={`text-sm whitespace-nowrap ${lightMode ? 'text-gray-500' : 'text-white/60'}`}>{s.shift || '—'}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => editingId === s.id ? cancelEdit() : openEdit(s)}
                        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all text-xs ${editingId === s.id ? 'bg-white/10 text-white' : 'text-white/30'}`}
                        title="Redaktə et"
                      >
                        {editingId === s.id ? <X size={14} /> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>}
                      </button>
                      <button type="button" onClick={() => removeStaff(s.id)} className={`w-9 h-9 rounded-lg hover:bg-red-500/10 flex items-center justify-center hover:text-red-400 transition-all ${lightMode ? 'text-gray-300' : 'text-white/20'}`} title="Sil">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <AnimatePresence>
                    {editingId === s.id && (
                      <div className="px-4 pb-3">{staffForm(saveEdit, t('staff_save'), cancelEdit)}</div>
                    )}
                  </AnimatePresence>
                </React.Fragment>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

/* ─── Hours Tab ─── */
const DAYS = ['Bazar ertəsi', 'Çərşənbə axşamı', 'Çərşənbə', 'Cümə axşamı', 'Cümə', 'Şənbə', 'Bazar'];

export default StaffTab;
