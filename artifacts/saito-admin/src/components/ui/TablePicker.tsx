'use client';

import { useState } from 'react';
import { ChevronLeft, Table as TableIcon } from 'lucide-react';

interface TableInfo {
  id: string;
  table_number: number;
  status: string | null;
  floor_name?: string | null;
  capacity?: number | null;
}

interface TablePickerProps {
  tables: TableInfo[];
  selectedTableIds: string[];
  onChange: (ids: string[]) => void;
  maxHeight?: string;
}

export default function TablePicker({ tables, selectedTableIds, onChange, maxHeight }: TablePickerProps) {
  const floors = Array.from(new Set(tables.map(t => t.floor_name || 'Zal 1')));
  const [selectedFloor, setSelectedFloor] = useState(floors[0] || 'Zal 1');

  const floorTables = tables.filter(t => (t.floor_name || 'Zal 1') === selectedFloor);

  return (
    <div className="flex flex-col gap-4">
      {floors.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
          {floors.map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setSelectedFloor(f)}
              className={`px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${
                selectedFloor === f
                  ? 'bg-blue-500 text-white shadow-lg'
                  : 'bg-white/5 opacity-50 hover:opacity-100'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      <div
        className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3 pr-2"
        style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}
      >
        {floorTables.map(t => {
          const isSelected = selectedTableIds.includes(t.id);
          const isOccupied = !!(t.status && t.status !== 'empty' && !isSelected);
          return (
            <button
              key={t.id}
              type="button"
              disabled={isOccupied}
              onClick={() => {
                if (isSelected) {
                  onChange(selectedTableIds.filter(id => id !== t.id));
                } else {
                  onChange([...selectedTableIds, t.id]);
                }
              }}
              className={`aspect-square rounded-[1.5rem] border-2 flex flex-col items-center justify-center gap-1 transition-all ${
                isSelected
                  ? 'bg-blue-500 border-blue-500 text-white shadow-xl scale-105'
                  : isOccupied
                    ? 'bg-white/5 border-white/5 opacity-30 cursor-not-allowed'
                    : 'bg-white/5 border-white/10 hover:border-blue-500/40 hover:scale-[1.03] active:scale-95'
              }`}
            >
              <span className="text-xl font-black">{t.table_number}</span>
              <span className="text-[7px] font-black uppercase opacity-60 leading-none">
                {isOccupied ? 'DOLU' : isSelected ? 'SEÇİLDİ' : 'BOŞ'}
              </span>
            </button>
          );
        })}
      </div>

      {selectedTableIds.length > 0 && (
        <div className="flex items-center justify-between px-1 pt-1">
          <span className="text-[10px] font-black uppercase tracking-widest opacity-40">
            {selectedTableIds.length} masa seçildi
          </span>
          <span className="text-[10px] font-black uppercase tracking-widest text-blue-500">
            {selectedTableIds.map(id => tables.find(t => t.id === id)?.table_number).join(' + ')}
          </span>
        </div>
      )}
    </div>
  );
}
