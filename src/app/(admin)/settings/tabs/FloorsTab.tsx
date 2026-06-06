'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Plus, Trash2, ChevronUp, ChevronDown, GripVertical, Save, Loader2, MapPin } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { inputCls } from './_shared';

type FloorRow = { id: string; table_number: number; floor_name: string; sort_order: number };
type FloorGroup = { name: string; sort_order: number; tables: number[]; ids: Record<number, string> };

const FloorsTab = () => {
  const { t } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [floors, setFloors] = useState<FloorGroup[]>([]);
  const [maxTable, setMaxTable] = useState(12);
  const [newFloorName, setNewFloorName] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const groupRows = (rows: FloorRow[]) => {
    const groups = new Map<string, FloorGroup>();
    for (const row of rows) {
      if (!groups.has(row.floor_name)) {
        groups.set(row.floor_name, { name: row.floor_name, sort_order: row.sort_order, tables: [], ids: {} });
      }
      const g = groups.get(row.floor_name)!;
      g.tables.push(row.table_number);
      g.ids[row.table_number] = row.id;
    }
    return Array.from(groups.values()).sort((a, b) => a.sort_order - b.sort_order);
  };

  const loadAll = async () => {
    try {
      const [floorsRes, settingsRes] = await Promise.all([
        fetch('/api/pos/floors'),
        supabase.from('settings').select('qr_table_count').maybeSingle(),
      ]);
      const data = floorsRes.ok ? await floorsRes.json() : { floors: [] };
      if (settingsRes.data?.qr_table_count) setMaxTable(settingsRes.data.qr_table_count);
      setFloors(groupRows(data.floors || []));
    } catch (e) {
      console.error('loadAll error:', e);
      toast.error('Məlumat yüklənərkən xəta');
    }
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      const payload = floors.map(f => ({ name: f.name, sort_order: f.sort_order, tables: f.tables }));
      const res = await fetch('/api/pos/floors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ floors: payload }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
      setDirty(false);
      await loadAll();
      toast.success(t('settings_updated'));
    } catch (e: any) {
      toast.error(e.message || 'Xəta baş verdi');
    } finally {
      setSaving(false);
    }
  };

  const addFloor = () => {
    const name = newFloorName.trim();
    if (!name || floors.some(f => f.name === name)) return;
    const maxOrder = floors.reduce((m, f) => Math.max(m, f.sort_order), -1);
    setFloors([...floors, { name, sort_order: maxOrder + 1, tables: [], ids: {} }]);
    setNewFloorName('');
    setDirty(true);
  };

  const removeFloor = (idx: number) => {
    const next = floors.filter((_, i) => i !== idx);
    setFloors(next.map((f, i) => ({ ...f, sort_order: i })));
    setDirty(true);
  };

  const moveFloor = (idx: number, dir: -1 | 1) => {
    const next = [...floors];
    const t = idx + dir;
    if (t < 0 || t >= next.length) return;
    [next[idx], next[t]] = [next[t], next[idx]];
    setFloors(next.map((f, i) => ({ ...f, sort_order: i })));
    setDirty(true);
  };

  const updateFloorName = (idx: number, name: string) => {
    const next = [...floors];
    next[idx] = { ...next[idx], name };
    setFloors(next);
    setDirty(true);
  };

  const addTable = (idx: number, n: number) => {
    if (n < 1 || n > maxTable || floors[idx].tables.includes(n)) return;
    const next = [...floors];
    next[idx] = { ...next[idx], tables: [...next[idx].tables, n].sort((a, b) => a - b) };
    setFloors(next);
    setDirty(true);
  };

  const removeTable = (idx: number, n: number) => {
    const next = [...floors];
    next[idx] = { ...next[idx], tables: next[idx].tables.filter(t => t !== n) };
    setFloors(next);
    setDirty(true);
  };

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white/90 flex items-center gap-2">
            <MapPin size={18} className="text-gold" />
            {t('floor_plan_settings')}
          </h3>
          <p className="text-xs text-white/30 mt-1">Mərtəbələri, zal adlarını və masaların aidiyyətini tənzimləyin</p>
        </div>
        {dirty && (
          <button onClick={saveAll} disabled={saving}
            className="flex items-center gap-2 px-5 py-3 bg-gold/20 border border-gold/30 rounded-xl text-gold text-sm font-bold tracking-wider hover:bg-gold/30 transition-all disabled:opacity-40">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {t('save_settings')}
          </button>
        )}
      </div>

      <div className="space-y-4">
        {floors.map((floor, idx) => (
          <div key={floor.name} className="bg-white/[0.03] border border-white/[0.07] rounded-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.05]">
              <GripVertical size={18} className="text-white/20 flex-shrink-0" />
              <input value={floor.name} onChange={e => updateFloorName(idx, e.target.value)}
                className="flex-1 bg-transparent text-base font-medium text-white outline-none" />
              <span className="text-xs text-white/40 bg-white/[0.06] px-3 py-1 rounded-full">{floor.tables.length} masa</span>
              <div className="flex items-center gap-1">
                <button onClick={() => moveFloor(idx, -1)} disabled={idx === 0}
                  className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center text-white/40 hover:text-white disabled:opacity-20">
                  <ChevronUp size={15} />
                </button>
                <button onClick={() => moveFloor(idx, 1)} disabled={idx === floors.length - 1}
                  className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center text-white/40 hover:text-white disabled:opacity-20">
                  <ChevronDown size={15} />
                </button>
              </div>
              <button onClick={() => removeFloor(idx)}
                className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400/60 hover:bg-red-500/20 hover:text-red-400">
                <Trash2 size={15} />
              </button>
            </div>
            <div className="px-5 py-4">
              <TablePicker maxTable={maxTable} assigned={new Set(floor.tables)}
                onSelect={n => addTable(idx, n)}
                onDeselect={n => removeTable(idx, n)} />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <input value={newFloorName} onChange={e => setNewFloorName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addFloor()}
          placeholder="Yeni zal / mərtəbə adı..."
          className={`${inputCls} flex-1 text-base py-4`} />
        <button onClick={addFloor} disabled={!newFloorName.trim()}
          className="flex items-center gap-2 px-6 py-4 bg-gold/15 border border-gold/25 rounded-xl text-gold text-sm font-bold tracking-wider hover:bg-gold/25 transition-all disabled:opacity-30">
          <Plus size={18} />
          Əlavə et
        </button>
      </div>

      {/* Delete confirmation deleted - simple click remove */}
    </div>
  );
};

function TablePicker({ maxTable, assigned, onSelect, onDeselect }:
  { maxTable: number; assigned: Set<number>; onSelect: (n: number) => void; onDeselect: (n: number) => void }) {
  return (
    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
      {Array.from({ length: maxTable }, (_, i) => i + 1).map(n => {
        const isAssigned = assigned.has(n);
        return (
          <button key={n} onClick={() => isAssigned ? onDeselect(n) : onSelect(n)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all min-w-[44px] ${
              isAssigned
                ? 'bg-gold/20 text-gold font-semibold'
                : 'bg-white/[0.06] text-white/50 hover:text-white hover:bg-white/10'
            }`}>
            {n}
          </button>
        );
      })}
    </div>
  );
}

export default FloorsTab;
