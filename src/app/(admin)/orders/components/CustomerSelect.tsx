'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Plus, Phone, User, Loader2, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  total_visits: number | null;
  total_spent: number | null;
}

interface CustomerSelectProps {
  selectedId?: string | null;
  onSelect: (customerId: string | null) => void;
  onClose: () => void;
}

export function CustomerSelect({ selectedId, onSelect, onClose }: CustomerSelectProps) {
  const { t } = useLanguage();
  const searchRef = useRef<HTMLInputElement>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    searchRef.current?.focus();
    loadCustomers();
  }, []);

  const loadCustomers = async (q?: string) => {
    setLoading(true);
    try {
      let query = supabase.from('customers').select('*').order('total_visits', { ascending: false }).limit(20);
      if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
      const { data } = await query;
      setCustomers((data || []) as Customer[]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (val: string) => {
    setSearch(val);
    loadCustomers(val || undefined);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const { data } = await supabase.from('customers').insert({
        name: newName.trim(),
        phone: newPhone.trim() || null,
      }).select().single();
      if (data) {
        onSelect(data.id);
        onClose();
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[210] flex items-end md:items-center justify-center md:p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 32 }}
        transition={{ type: 'spring', stiffness: 340, damping: 32 }}
        className="relative z-10 w-full md:w-[400px] bg-[#0d0d0d] border border-white/[0.08] rounded-t-3xl md:rounded-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <span className="text-sm font-bold text-white">{t('select_customer')}</span>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="p-4">
          <div className="relative mb-3">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" />
            <input ref={searchRef} value={search} onChange={e => handleSearch(e.target.value)}
              placeholder={t('search')}
              className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl pl-9 pr-4 py-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/20 transition-all"
            />
          </div>

          {showNew ? (
            <div className="space-y-3 bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
              <input value={newName} onChange={e => setNewName(e.target.value)}
                placeholder={t('customer_name')}
                className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/20 outline-none" />
              <input value={newPhone} onChange={e => setNewPhone(e.target.value)}
                placeholder={t('customer_phone')}
                className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/20 outline-none" />
              <div className="flex gap-2">
                <button onClick={() => setShowNew(false)} className="flex-1 py-2.5 rounded-xl border border-white/[0.08] text-white/40 text-xs font-bold">Ləğv et</button>
                <button onClick={handleCreate} disabled={creating || !newName.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold disabled:opacity-40 flex items-center justify-center gap-2">
                  {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} {t('add')}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowNew(true)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-dashed border-white/[0.10] text-white/40 hover:text-white/70 hover:border-white/20 text-sm font-medium transition-all mb-2">
              <Plus size={16} /> {t('new_customer')}
            </button>
          )}

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-white/20" /></div>
          ) : customers.length === 0 ? (
            <div className="text-center py-8 text-white/15 text-sm">{t('no_results')}</div>
          ) : (
            <div className="space-y-1 max-h-[300px] overflow-y-auto">
              {selectedId && (
                <button onClick={() => { onSelect(null); onClose(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white/30 hover:bg-white/[0.04] text-sm transition-all">
                  <X size={14} /> {t('clear')}
                </button>
              )}
              {customers.map(c => (
                <button key={c.id} onClick={() => { onSelect(c.id); onClose(); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${selectedId === c.id ? 'bg-white/10' : 'hover:bg-white/[0.04]'}`}>
                  <div className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                    <User size={15} className="text-white/30" />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-semibold text-white/80 truncate">{c.name}</p>
                    {c.phone && <p className="text-xs text-white/30 truncate">{c.phone}</p>}
                  </div>
                  <div className="text-right text-[10px] text-white/20 flex-shrink-0">
                    <div>{c.total_visits ?? 0} {t('total_visits')}</div>
                    {c.total_spent ? <div>₼{c.total_spent.toFixed(0)}</div> : null}
                  </div>
                  {selectedId === c.id && <Check size={14} className="text-emerald-400 flex-shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
