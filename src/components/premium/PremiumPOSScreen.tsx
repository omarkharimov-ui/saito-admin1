'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Users, Search, Filter, Plus, ChevronRight, MoreVertical, AlertCircle } from 'lucide-react';
import { Button, Card, Badge, StatusIndicator } from '@/components/premium/PremiumComponents';

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
  const [tables, setTables] = useState<TableStatus[]>([
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

  // Stats
  const stats = {
    total: tables.length,
    occupied: tables.filter(t => t.status === 'occupied').length,
    available: tables.filter(t => t.status === 'available').length,
    totalRevenue: tables.reduce((sum, t) => sum + (t.totalAmount || 0), 0),
  };

  return (
    <div className="h-screen bg-gray-50 flex flex-col">
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ HEADER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <header className="bg-white border-b border-gray-200 px-8 py-5">
        <div className="flex items-center justify-between gap-6">
          {/* Title & Stats */}
          <div className="flex-1">
            <h1 className="text-2xl font-semibold text-gray-900 mb-3">Floor Management</h1>
            <div className="flex items-center gap-8">
              <div>
                <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">Tables</p>
                <p className="text-lg font-semibold text-gray-900">{stats.occupied}/{stats.total}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">Revenue</p>
                <p className="text-lg font-semibold text-gray-900">${stats.totalRevenue.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">Available</p>
                <p className="text-lg font-semibold text-green-600">{stats.available}</p>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
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

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ CONTENT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <main className="flex-1 overflow-y-auto px-8 py-8">
        {/* Search & Filter Bar */}
        <div className="mb-8 flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search table number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-md border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Table Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <AnimatePresence>
            {tables.map((table) => (
              <motion.div
                key={table.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
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
      </main>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TABLE CARD COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface TableCardProps {
  table: TableStatus;
  isSelected: boolean;
  onSelect: () => void;
}

function TableCard({ table, isSelected, onSelect }: TableCardProps) {
  const statusConfig = {
    available: {
      bg: 'bg-white',
      border: 'border-gray-200 hover:border-gray-300',
      accent: 'bg-gray-100',
      textColor: 'text-gray-600',
      headerColor: 'text-gray-700',
      statusColor: 'text-gray-500',
    },
    occupied: {
      bg: 'bg-white',
      border: 'border-blue-200 hover:border-blue-300',
      accent: 'bg-blue-50',
      textColor: 'text-blue-700',
      headerColor: 'text-blue-900',
      statusColor: 'text-blue-600',
    },
    reserved: {
      bg: 'bg-white',
      border: 'border-amber-200 hover:border-amber-300',
      accent: 'bg-amber-50',
      textColor: 'text-amber-700',
      headerColor: 'text-amber-900',
      statusColor: 'text-amber-600',
    },
    bill: {
      bg: 'bg-white',
      border: 'border-green-200 hover:border-green-300',
      accent: 'bg-green-50',
      textColor: 'text-green-700',
      headerColor: 'text-green-900',
      statusColor: 'text-green-600',
    },
    alert: {
      bg: 'bg-white',
      border: 'border-red-200 hover:border-red-300',
      accent: 'bg-red-50',
      textColor: 'text-red-700',
      headerColor: 'text-red-900',
      statusColor: 'text-red-600',
    },
  };

  const config = statusConfig[table.status];

  return (
    <motion.button
      onClick={onSelect}
      className={`relative w-full p-4 rounded-lg border-2 transition-all cursor-pointer text-left group
        ${isSelected ? `border-blue-500 ${config.accent}` : `border-gray-200 ${config.border}`}
        ${config.bg}
      `}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
    >
      {/* Top Section - Table Number & Status */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className={`text-3xl font-bold ${config.headerColor}`}>
            {String(table.number).padStart(2, '0')}
          </p>
        </div>
        <StatusIndicator status={table.status} label={getStatusLabel(table.status)} />
      </div>

      {/* Middle Section - Details (if occupied/reserved/bill) */}
      {table.guestCount !== undefined && (
        <div className={`space-y-2 mb-3 pb-3 border-b ${table.status === 'available' ? 'border-gray-200' : 'border-gray-100'}`}>
          <div className="flex items-center gap-2 text-sm">
            <Users size={14} className="text-gray-400" />
            <span className="text-gray-700 font-medium">{table.guestCount} guests</span>
          </div>

          {table.duration !== undefined && (
            <div className="flex items-center gap-2 text-sm">
              <Clock size={14} className="text-gray-400" />
              <span className="text-gray-700 font-medium">{table.duration} mins</span>
            </div>
          )}

          {table.notes && (
            <div className="flex items-start gap-2 text-xs">
              <AlertCircle size={12} className="text-gray-400 mt-0.5 flex-shrink-0" />
              <p className="text-gray-600">{table.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Bottom Section - Total or Action */}
      <div className="flex items-center justify-between">
        {table.totalAmount !== undefined ? (
          <div>
            <p className="text-xs text-gray-600 font-medium uppercase tracking-wide">Total</p>
            <p className={`text-lg font-bold ${config.textColor}`}>
              ${table.totalAmount.toFixed(2)}
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-500 font-medium">Available</p>
        )}

        <ChevronRight
          size={18}
          className={`text-gray-400 group-hover:text-gray-600 transition-colors ${isSelected ? 'text-blue-500' : ''}`}
        />
      </div>

      {/* More Options */}
      <button
        className="absolute top-3 right-3 p-1.5 rounded-md hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
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
