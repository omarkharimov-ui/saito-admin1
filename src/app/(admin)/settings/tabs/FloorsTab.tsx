'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Plus, Trash2, ChevronUp, ChevronDown, GripVertical, X, Save, Loader2, MapPin } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { GsLoader, inputCls, labelCls } from './_shared';

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
    const [{ data: floorData }, { data: settings }] = await Promise.all([
      supabase.from('table_floors').select('*').order('sort_order'),
      supabase.from('settings').select('qr_table_count').maybeSingle(),
    ]);
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
    setLoading(false);
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

  const removeFloor = (idx: number) => {
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

  const assignedTables = new Set<number>();
  for (const f of floors) for (const t of f.tables) assignedTables.add(t);
  const unassigned: number[] = [];
  for (let i = 1; i <= maxTable; i++) if (!assignedTables.has(i)) unassigned.push(i);

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
              {floor.tables.length === 0 && (
                <span className="text-[11px] text-white/20 italic">Masa təyin edilməyib</span>
              )}
              {floor.tables.map(tn => (
                <span key={tn} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/[0.08] text-[11px] font-semibold text-white/60">
                  #{tn}
                  <button onClick={() => removeTableFromFloor(idx, tn)} className="text-white/20 hover:text-red-400 transition-all">
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>

            {/* Add table to floor */}
            <TableAdder maxTable={maxTable} assigned={assignedTables} onSelect={n => addTableToFloor(idx, n)} />
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

      {/* Unassigned tables */}
      {unassigned.length > 0 && (
        <div className="bg-white/[0.02] border border-dashed border-white/[0.06] rounded-2xl p-5">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold mb-3">Təyin olunmamış masalar</p>
          <div className="flex flex-wrap gap-1.5">
            {unassigned.map(tn => (
              <span key={tn} className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-dashed border-white/[0.08] text-[11px] font-semibold text-white/30">
                #{tn}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-white/15 mt-3">Masa nömrələrini yuxarıdakı zallara əlavə edin</p>
        </div>
      )}
    </div>
  );
};

function TableAdder({ maxTable, assigned, onSelect }: { maxTable: number; assigned: Set<number>; onSelect: (n: number) => void }) {
  const [value, setValue] = useState('');
  const [showQuick, setShowQuick] = useState(false);

  const handleAdd = () => {
    const n = Number(value);
    if (n >= 1 && n <= maxTable && !assigned.has(n)) {
      onSelect(n);
      setValue('');
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <input value={value} onChange={e => setValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="Masa nömrəsi (1–200)"
          className="w-32 bg-black/50 border border-white/20 px-2.5 py-1.5 rounded-lg text-xs text-white outline-none focus:border-gold/40 transition-all" />
        <button onClick={handleAdd}
          disabled={!value || assigned.has(Number(value)) || Number(value) < 1 || Number(value) > maxTable}
          className="px-3 py-1.5 bg-white/[0.06] rounded-lg text-[10px] font-bold text-white/50 hover:text-white hover:bg-white/10 transition-all disabled:opacity-20">
          + Əlavə et
        </button>
        <button onClick={() => setShowQuick(!showQuick)} className="text-[10px] text-gold/60 hover:text-gold underline underline-offset-2">
          {showQuick ? 'Gizlət' : 'Sürətli seç'}
        </button>
      </div>
      {showQuick && (
        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
          {Array.from({ length: maxTable }, (_, i) => i + 1).filter(n => !assigned.has(n)).map(n => (
            <button key={n} onClick={() => onSelect(n)}
              className="px-2 py-0.5 rounded bg-white/[0.06] text-[10px] text-white/40 hover:text-white hover:bg-white/10 transition-all">
              #{n}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export default FloorsTab;
