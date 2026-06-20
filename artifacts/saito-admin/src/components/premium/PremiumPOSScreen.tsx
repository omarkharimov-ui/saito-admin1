'use client';

import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Users, Search, Filter, Plus, ChevronRight, MoreVertical, AlertCircle } from 'lucide-react';
import { Button, StatusIndicator } from '@/components/premium/PremiumComponents';

interface TableStatus {
  id: string;
  number: number;
  status: 'available' | 'occupied' | 'reserved' | 'bill' | 'alert';
  guestCount?: number;
  duration?: number;
  totalAmount?: number;
  notes?: string;
}

export function PremiumPOSScreen() {
  const [tables] = useState<TableStatus[]>([
    { id: '1', number: 1, status: 'available' },
    { id: '2', number: 2, status: 'occupied', guestCount: 4, duration: 35, totalAmount: 125.50 },
    { id: '3', number: 3, status: 'occupied', guestCount: 2, duration: 12, totalAmount: 45.00 },
    { id: '4', number: 4, status: 'reserved', guestCount: 6, notes: 'Birthday party - 19:00' },
    { id: '5', number: 5, status: 'available' },
    { id: '6', number: 6, status: 'bill', guestCount: 3, totalAmount: 89.99 },
    { id: '7', number: 7, status: 'occupied', guestCount: 5, duration: 48, totalAmount: 210.75 },
    { id: '8', number: 8, status: 'alert', guestCount: 2, notes: 'Issue reported' },
  ]);

  const [search, setSearch] = useState('');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  const filteredTables = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tables;
    return tables.filter((t) => String(t.number).includes(q));
  }, [tables, search]);

  const stats = {
    total: tables.length,
    occupied: tables.filter(t => t.status === 'occupied').length,
    available: tables.filter(t => t.status === 'available').length,
    totalRevenue: tables.reduce((sum, t) => sum + (t.totalAmount || 0), 0),
  };

  return (
    <div className="h-screen bg-[#F3F4F6] flex flex-col">
      <header className="bg-white/90 backdrop-blur-xl border-b border-[#E5E5E7] px-8 py-6">
        <div className="flex items-center justify-between gap-6">
          <div className="flex-1">
            <h1 className="text-2xl font-semibold text-[#1D1D1F] mb-3">Floor Management</h1>
            <div className="flex items-center gap-8">
              <div>
                <p className="text-xs font-semibold text-[#6E6E73] uppercase tracking-wide">Tables</p>
                <p className="text-lg font-semibold text-[#1D1D1F]">{stats.occupied}/{stats.total}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-[#6E6E73] uppercase tracking-wide">Revenue</p>
                <p className="text-lg font-semibold text-[#1D1D1F]">${stats.totalRevenue.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-[#6E6E73] uppercase tracking-wide">Available</p>
                <p className="text-lg font-semibold text-[#166534]">{stats.available}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="secondary" size="md">
              <Filter size={16} />
              Filter
            </Button>
            <Button variant="primary" size="md">
              <Plus size={16} />
              New Order
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8E8E93]" size={18} />
            <input
              type="text"
              placeholder="Search table number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 min-h-[44px] rounded-[10px] border border-[#E5E5E7] bg-white text-[#1D1D1F] placeholder-[#8E8E93] focus-visible:outline-none focus-visible:ring-0 focus-visible:shadow-[0_0_0_4px_rgba(0,0,0,0.08)]"
            />
          </div>
        </div>

        {filteredTables.length === 0 ? (
          <div className="rounded-[16px] border border-[#E5E5E7] bg-white p-12 text-center">
            <AlertCircle className="mx-auto text-[#D2D2D7] mb-4" size={40} />
            <p className="text-[#1D1D1F] text-sm font-medium">No table found for “{search}”.</p>
            <p className="text-[#8E8E93] text-sm mt-1">Try a different number.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            <AnimatePresence>
              {filteredTables.map((table) => (
                <motion.div
                  key={table.id}
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.18 }}
                >
                  <TableCard
                    table={table}
                    isSelected={selectedTable === table.id}
                    onSelect={() => setSelectedTable(table.id)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  );
}

interface TableCardProps {
  table: TableStatus;
  isSelected: boolean;
  onSelect: () => void;
}

function TableCard({ table, isSelected, onSelect }: TableCardProps) {
  const statusConfig = {
    available: {
      bg: 'bg-white',
      border: 'border-[#E5E5E7] hover:border-[#D2D2D7]',
      accent: 'bg-[#F7F7F8]',
      textColor: 'text-[#6E6E73]',
      headerColor: 'text-[#1D1D1F]',
    },
    occupied: {
      bg: 'bg-white',
      border: 'border-[#DCE7FF] hover:border-[#C7DAFF]',
      accent: 'bg-[#F5F7FF]',
      textColor: 'text-[#1D4ED8]',
      headerColor: 'text-[#1D1D1F]',
    },
    reserved: {
      bg: 'bg-white',
      border: 'border-[#FDECC8] hover:border-[#F7DFA2]',
      accent: 'bg-[#FFF8E7]',
      textColor: 'text-[#9A6700]',
      headerColor: 'text-[#1D1D1F]',
    },
    bill: {
      bg: 'bg-white',
      border: 'border-[#DCFCE7] hover:border-[#BBF7D0]',
      accent: 'bg-[#ECFDF3]',
      textColor: 'text-[#166534]',
      headerColor: 'text-[#1D1D1F]',
    },
    alert: {
      bg: 'bg-white',
      border: 'border-[#FFE4E6] hover:border-[#FECDD3]',
      accent: 'bg-[#FFF1F2]',
      textColor: 'text-[#BE123C]',
      headerColor: 'text-[#1D1D1F]',
    },
  };

  const config = statusConfig[table.status];

  return (
    <motion.button
      onClick={onSelect}
      className={`relative w-full p-5 min-h-[176px] rounded-[16px] border transition-all cursor-pointer text-left group shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_24px_rgba(0,0,0,0.04)]
        ${isSelected ? `border-[#111111] ${config.accent}` : `${config.border}`}
        ${config.bg}
      `}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.985 }}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className={`text-3xl font-bold ${config.headerColor}`}>
            {String(table.number).padStart(2, '0')}
          </p>
        </div>
        <StatusIndicator status={table.status} label={getStatusLabel(table.status)} />
      </div>

      {table.guestCount !== undefined && (
        <div className="space-y-2 mb-3 pb-3 border-b border-[#F0F0F2]">
          <div className="flex items-center gap-2 text-sm">
            <Users size={14} className="text-[#8E8E93]" />
            <span className="text-[#1D1D1F] font-medium">{table.guestCount} guests</span>
          </div>

          {table.duration !== undefined && (
            <div className="flex items-center gap-2 text-sm">
              <Clock size={14} className="text-[#8E8E93]" />
              <span className="text-[#1D1D1F] font-medium">{table.duration} mins</span>
            </div>
          )}

          {table.notes && (
            <div className="flex items-start gap-2 text-xs">
              <AlertCircle size={12} className="text-[#8E8E93] mt-0.5 flex-shrink-0" />
              <p className="text-[#6E6E73]">{table.notes}</p>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        {table.totalAmount !== undefined ? (
          <div>
            <p className="text-xs text-[#6E6E73] font-semibold uppercase tracking-wide">Total</p>
            <p className={`text-lg font-bold ${config.textColor}`}>
              ${table.totalAmount.toFixed(2)}
            </p>
          </div>
        ) : (
          <p className="text-sm text-[#6E6E73] font-medium">Available</p>
        )}

        <ChevronRight
          size={18}
          className={`text-[#8E8E93] group-hover:text-[#1D1D1F] transition-colors ${isSelected ? 'text-[#111111]' : ''}`}
        />
      </div>

      <button
        className="absolute top-3 right-3 p-2 rounded-[10px] hover:bg-black/[0.03] transition-colors text-[#8E8E93] hover:text-[#1D1D1F]"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <MoreVertical size={16} />
      </button>
    </motion.button>
  );
}

function getStatusLabel(status: TableStatus['status']): string {
  const labels = {
    available: 'Available',
    occupied: 'Occupied',
    reserved: 'Reserved',
    bill: 'Bill Requested',
    alert: 'Needs Help',
  };
  return labels[status];
}
