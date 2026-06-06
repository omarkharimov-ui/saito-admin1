'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Plus, Trash2, ChevronUp, ChevronDown, GripVertical, Save, Loader2, MapPin } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { inputCls } from './_shared';
import MobileModal from '@/components/ui/MobileModal';

type FloorRow = { id: string; table_number: number; floor_name: string; sort_order: number };

type FloorGroup = {
  name: string;
  sort_order: number;
  tables: number[];
  ids: Record<number, string>;
};

const FloorsTab = () => {
  const { t } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [floors, setFloors] = useState<FloorGroup[]>([]);
  const [maxTable, setMaxTable] = useState(12);
  const [newFloorName, setNewFloorName] = useState('');
  const [dirty, setDirty] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ idx: number; name: string } | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      const [{ data: floorData, error }, { data: settings }] = await Promise.all([
        supabase.from('table_floors').select('*').order('sort_order'),
        supabase.from('settings').select('qr_table_count').maybeSingle(),
      ]);
      if (error) { console.error(error); return; }
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
    }
  };

  const addFloor = () => {
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

  const confirmRemoveFloor = async () => {
    if (!deleteTarget) return;
    const { idx } = deleteTarget;
    const floor = floors[idx];
    const ids = Object.values(floor.ids).filter(Boolean);
    if (ids.length > 0) {
      await supabase.from('table_floors').delete().in('id', ids);
    }
    const next = floors.filter((_, i) => i !== idx);
    setFloors(next.map((f, i) => ({ ...f, sort_order: i })));
    setDirty(true);
    setDeleteTarget(null);
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
      // Get all existing floor names in DB
      const { data: existing } = await supabase.from('table_floors').select('floor_name');
      const dbNames = new Set((existing || []).map((r: any) => r.floor_name));
      const currentNames = new Set(floors.map(f => f.name));

      // Delete floors no longer in the list
      for (const name of dbNames) {
        if (!currentNames.has(name)) {
          await supabase.from('table_floors').delete().eq('floor_name', name);
        }
      }

      // Per-floor: delete + re-insert
      for (const floor of floors) {
        await supabase.from('table_floors').delete().eq('floor_name', floor.name);

        if (floor.tables.length === 0) {
          await supabase.from('table_floors').insert({
            table_number: 0,
            floor_name: floor.name,
            sort_order: floor.sort_order,
          });
        } else {
          for (const tableNum of floor.tables) {
            await supabase.from('table_floors').insert({
              table_number: tableNum,
              floor_name: floor.name,
              sort_order: floor.sort_order,
            });
          }
        }
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

  return (
    <div className="max-w-3xl space-y-5">
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
            className="flex items-center gap-2 px-5 py-3 bg-gold/20 border border-gold/30 rounded-xl text-gold text-sm font-bold tracking-wider hover:bg-gold/30 transition-all disabled:opacity-40">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {t('save_settings')}
          </button>
        )}
      </div>

      {/* Floor cards */}
      <div className="space-y-4">
        {floors.map((floor, idx) => (
          <div key={floor.name} className="bg-white/[0.03] border border-white/[0.07] rounded-2xl overflow-hidden">
            {/* Floor header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.05]">
              <GripVertical size={18} className="text-white/20 flex-shrink-0" />
              <input value={floor.name} onChange={e => updateFloorName(idx, e.target.value)}
                className="flex-1 bg-transparent text-base font-medium text-white outline-none placeholder:text-white/20" />
              <span className="text-xs text-white/40 bg-white/[0.06] px-3 py-1 rounded-full">{floor.tables.length} masa</span>
              <div className="flex items-center gap-1">
                <button onClick={() => moveFloor(idx, -1)} disabled={idx === 0}
                  className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center text-white/40 hover:text-white disabled:opacity-20 transition-all">
                  <ChevronUp size={15} />
                </button>
                <button onClick={() => moveFloor(idx, 1)} disabled={idx === floors.length - 1}
                  className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center text-white/40 hover:text-white disabled:opacity-20 transition-all">
                  <ChevronDown size={15} />
                </button>
              </div>
              <button onClick={() => setDeleteTarget({ idx, name: floor.name })}
                className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400/60 hover:bg-red-500/20 hover:text-red-400 transition-all">
                <Trash2 size={15} />
              </button>
            </div>

            {/* Grid */}
            <div className="px-5 py-4">
              <TablePicker maxTable={maxTable} floorTables={floor.tables}
                onSelect={n => addTableToFloor(idx, n)}
                onDeselect={n => removeTableFromFloor(idx, n)} />
            </div>
          </div>
        ))}
      </div>

      {/* Add new floor */}
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

      {/* Delete confirmation */}
      <MobileModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
            <Trash2 size={32} className="text-red-500" />
          </div>
          <h3 className="text-xl font-serif font-bold text-white mb-2">{t('delete')}</h3>
          <p className="text-white/60 text-sm mb-6">"{deleteTarget?.name}" - {t('confirm_delete')}</p>
          <div className="flex gap-3 w-full">
            <button onClick={() => setDeleteTarget(null)} className="flex-1 py-3 rounded-xl border border-white/10 text-white/60 text-sm font-medium">
              {t('no')}
            </button>
            <button onClick={confirmRemoveFloor} className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-semibold flex items-center justify-center gap-2">
              <Trash2 size={16} />{t('yes_delete')}
            </button>
          </div>
        </div>
      </MobileModal>
    </div>
  );
};

function TablePicker({ maxTable, floorTables, onSelect, onDeselect }:
  { maxTable: number; floorTables: number[]; onSelect: (n: number) => void; onDeselect: (n: number) => void }) {
  const assigned = new Set(floorTables);
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
