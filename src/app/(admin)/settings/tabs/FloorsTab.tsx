'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Plus, Trash2, ChevronUp, ChevronDown, GripVertical, Save, Loader2, MapPin } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { GsLoader, inputCls } from './_shared';

type FloorRow = { id: string; table_number: number; floor_name: string; sort_order: number };

type FloorGroup = {
  name: string;
  sort_order: number;
  tables: number[];
  ids: Record<number, string>; // table_number -> row id
};

const FloorsTab = () => {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [floors, setFloors] = useState<FloorGroup[]>([]);
  const [maxTable, setMaxTable] = useState(12);
  const [newFloorName, setNewFloorName] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [floorsRes, settingsRes] = await Promise.all([
        fetch('/api/pos/floors'),
        supabase.from('settings').select('qr_table_count').maybeSingle(),
      ]);
      const floorData = floorsRes.ok ? (await floorsRes.json()).floors : [];
      const settings = settingsRes.data;

      if (settings?.qr_table_count) setMaxTable(settings.qr_table_count);

      const groups = new Map<string, FloorGroup>();
      if (floorData) {
        for (const row of floorData as FloorRow[]) {
          if (!groups.has(row.floor_name)) {
            groups.set(row.floor_name, { name: row.floor_name, sort_order: row.sort_order, tables: [], ids: {} });
          }
          const g = groups.get(row.floor_name)!;
          g.tables.push(row.table_number);
          g.ids[row.table_number] = row.id;
        }
      }
      setFloors(Array.from(groups.values()).sort((a, b) => a.sort_order - b.sort_order));
    } catch (e) {
      console.error('loadAll error:', e);
    } finally {
      setLoading(false);
    }
  };

  const addFloor = async () => {
    const name = newFloorName.trim();
    if (!name) return;
    if (floors.some(f => f.name === name)) {
      toast.error('Bu adla mərtəbə artıq var');
      return;
    }
    const maxOrder = floors.reduce((m, f) => Math.max(m, f.sort_order), -1);
    setFloors([...floors, { name, sort_order: maxOrder + 1, tables: [], ids: {} }]);
    setNewFloorName('');
    setDirty(true);
  };

  const removeFloor = async (idx: number) => {
    const floor = floors[idx];
    const ids = Object.values(floor.ids).filter(Boolean);
    if (ids.length > 0) {
      await supabase.from('table_floors').delete().in('id', ids);
    }
    const next = floors.filter((_, i) => i !== idx);
    setFloors(next.map((f, i) => ({ ...f, sort_order: i })));
    setDirty(true);
  };

  const moveFloor = (idx: number, dir: -1 | 1) => {
    const next = [...floors];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setFloors(next.map((f, i) => ({ ...f, sort_order: i })));
    setDirty(true);
  };

  const updateFloorName = (idx: number, name: string) => {
    const next = [...floors];
    next[idx] = { ...next[idx], name };
    setFloors(next);
    setDirty(true);
  };

  const addTableToFloor = (idx: number, tableNum: number) => {
    if (tableNum < 1 || tableNum > maxTable) return;
    const floor = floors[idx];
    if (floor.tables.includes(tableNum)) return;
    const next = [...floors];
    next[idx] = { ...next[idx], tables: [...next[idx].tables, tableNum].sort((a, b) => a - b) };
    setFloors(next);
    setDirty(true);
  };

  const removeTableFromFloor = async (idx: number, tableNum: number) => {
    const floor = floors[idx];
    const rowId = floor.ids[tableNum];
    if (rowId) {
      await supabase.from('table_floors').delete().eq('id', rowId);
    }
    const next = [...floors];
    next[idx] = {
      ...next[idx],
      tables: next[idx].tables.filter(t => t !== tableNum),
      ids: { ...next[idx].ids },
    };
    delete next[idx].ids[tableNum];
    setFloors(next);
    setDirty(true);
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      const payload = floors.map(f => ({
        name: f.name,
        sort_order: f.sort_order,
        tables: f.tables,
      }));

      const res = await fetch('/api/pos/floors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ floors: payload }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Save failed');
      }

      setDirty(false);
      await loadAll();
      toast.success(t('settings_updated'));
    } catch (e: any) {
      toast.error(e.message || 'Xəta baş verdi');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <GsLoader />;

  return (
    <div className="max-w-3xl space-y-8">
      {/* Header */}
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
            className="flex items-center gap-2 px-4 py-2 bg-gold/20 border border-gold/30 rounded-xl text-gold text-xs font-bold tracking-wider hover:bg-gold/30 transition-all">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {t('save_settings')}
          </button>
        )}
      </div>

      {/* Floor cards */}
      <div className="space-y-4">
        {floors.map((floor, idx) => (
          <div key={floor.name} className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5 space-y-4">
            {/* Floor header */}
            <div className="flex items-center gap-3">
              <GripVertical size={16} className="text-white/20 flex-shrink-0" />
              <input value={floor.name} onChange={e => updateFloorName(idx, e.target.value)}
                className="flex-1 bg-black/50 border border-white/20 px-3 py-2 rounded-xl text-sm text-white outline-none focus:border-gold/40 transition-all" />
              <div className="flex items-center gap-1">
                <button onClick={() => moveFloor(idx, -1)} disabled={idx === 0}
                  className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center text-white/40 hover:text-white disabled:opacity-20 transition-all">
                  <ChevronUp size={14} />
                </button>
                <button onClick={() => moveFloor(idx, 1)} disabled={idx === floors.length - 1}
                  className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center text-white/40 hover:text-white disabled:opacity-20 transition-all">
                  <ChevronDown size={14} />
                </button>
              </div>
              <button onClick={() => removeFloor(idx)}
                className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400/60 hover:bg-red-500/20 hover:text-red-400 transition-all">
                <Trash2 size={13} />
              </button>
            </div>

            {/* Assigned tables */}
            <div className="flex flex-wrap gap-1.5">
              {floor.tables.map(tn => (
                <span key={tn} className="px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/[0.08] text-[11px] font-semibold text-white/60">
                  #{tn}
                </span>
              ))}
            </div>

            {/* Quick-select table grid */}
            <TablePicker maxTable={maxTable} floorTables={floor.tables}
              onSelect={n => addTableToFloor(idx, n)}
              onDeselect={n => removeTableFromFloor(idx, n)} />
          </div>
        ))}
      </div>

      {/* Add new floor */}
      <div className="flex items-center gap-3">
        <input value={newFloorName} onChange={e => setNewFloorName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addFloor()}
          placeholder="Yeni zal/mərtəbə adı..."
          className={`${inputCls} flex-1`} />
        <button onClick={addFloor} disabled={!newFloorName.trim()}
          className="flex items-center gap-2 px-5 py-3 bg-gold/20 border border-gold/30 rounded-xl text-gold text-xs font-bold tracking-wider hover:bg-gold/30 transition-all disabled:opacity-30">
          <Plus size={15} />
          Əlavə et
        </button>
      </div>
    </div>
  );
};

function TablePicker({ maxTable, floorTables, onSelect, onDeselect }:
  { maxTable: number; floorTables: number[]; onSelect: (n: number) => void; onDeselect: (n: number) => void }) {
  const assigned = new Set(floorTables);
  return (
    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
      {Array.from({ length: maxTable }, (_, i) => i + 1).map(n => {
        const isAssigned = assigned.has(n);
        return (
          <button key={n} onClick={() => isAssigned ? onDeselect(n) : onSelect(n)}
            className={`px-2 py-0.5 rounded text-[10px] transition-all ${
              isAssigned
                ? 'bg-gold/20 text-gold font-semibold'
                : 'bg-white/[0.06] text-white/40 hover:text-white hover:bg-white/10'
            }`}>
            #{n}
          </button>
        );
      })}
    </div>
  );
}

export default FloorsTab;
