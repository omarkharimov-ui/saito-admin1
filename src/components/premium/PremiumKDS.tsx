'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, CheckCircle, Clock, Flame } from 'lucide-react';
import { Badge } from '@/components/premium/PremiumComponents';

interface KDSOrder {
  id: string;
  orderNumber: number;
  table: number;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    modifiers?: string[];
    status: 'pending' | 'preparing' | 'ready' | 'served';
  }>;
  priority: 'normal' | 'high' | 'urgent';
  createdAt: Date;
  stage: 'new' | 'preparing' | 'ready' | 'served';
  notes?: string;
}

export function PremiumKitchenDisplaySystem() {
  const [orders, setOrders] = useState<KDSOrder[]>([
    {
      id: '1',
      orderNumber: 1024,
      table: 5,
      stage: 'preparing',
      priority: 'normal',
      createdAt: new Date(Date.now() - 8 * 60000),
      items: [
        { id: '1', name: 'Grilled Salmon', quantity: 1, modifiers: ['No butter', 'Lemon'] , status: 'preparing' },
        { id: '2', name: 'Caesar Salad', quantity: 2, status: 'ready' },
      ],
    },
    {
      id: '2',
      orderNumber: 1025,
      table: 8,
      stage: 'new',
      priority: 'urgent',
      createdAt: new Date(),
      items: [
        { id: '3', name: 'Ribeye Steak', quantity: 2, modifiers: ['Med Rare'] , status: 'pending' },
        { id: '4', name: 'Pasta Carbonara', quantity: 1, status: 'pending' },
      ],
      notes: 'VIP Table - Rush',
    },
    {
      id: '3',
      orderNumber: 1023,
      table: 3,
      stage: 'ready',
      priority: 'normal',
      createdAt: new Date(Date.now() - 15 * 60000),
      items: [
        { id: '5', name: 'Fish & Chips', quantity: 3, status: 'ready' },
      ],
    },
    {
      id: '4',
      orderNumber: 1022,
      table: 12,
      stage: 'preparing',
      priority: 'high',
      createdAt: new Date(Date.now() - 5 * 60000),
      items: [
        { id: '6', name: 'Lamb Chops', quantity: 1, modifiers: ['Well Done'] , status: 'preparing' },
        { id: '7', name: 'Truffle Risotto', quantity: 2, status: 'preparing' },
      ],
    },
  ]);

  // Sort orders by: ready first, then urgent, then by time
  const sortedOrders = [...orders].sort((a, b) => {
    if (a.stage === 'ready' && b.stage !== 'ready') return -1;
    if (a.stage !== 'ready' && b.stage === 'ready') return 1;
    if (a.priority === 'urgent' && b.priority !== 'urgent') return -1;
    if (a.priority !== 'urgent' && b.priority === 'urgent') return 1;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const markReady = (orderId: string) => {
    setOrders(orders.map(o => o.id === orderId ? { ...o, stage: 'ready' as const } : o));
  };

  const markServed = (orderId: string) => {
    setOrders(orders.filter(o => o.id !== orderId));
  };

  const getStageLabel = (stage: KDSOrder['stage']) => {
    return {
      new: 'New Order',
      preparing: 'Preparing',
      ready: 'Ready',
      served: 'Served',
    }[stage];
  };

  const getElapsedTime = (date: Date) => {
    const elapsed = Math.floor((Date.now() - date.getTime()) / 1000);
    if (elapsed < 60) return `${elapsed}s`;
    return `${Math.floor(elapsed / 60)}m`;
  };

  return (
    <div className="h-screen bg-gray-900 text-white overflow-hidden flex flex-col">
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━ HEADER ━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <header className="bg-gray-950 border-b border-gray-800 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold">Kitchen Display</h1>
            <p className="text-gray-400 mt-1">{orders.length} active orders</p>
          </div>
          <div className="text-right">
            <p className="text-5xl font-bold text-green-400">
              {orders.filter(o => o.stage === 'ready').length}
            </p>
            <p className="text-gray-400 text-sm uppercase tracking-wide">Ready</p>
          </div>
        </div>
      </header>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━ CONTENT ━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <main className="flex-1 overflow-y-auto px-8 py-8">
        {sortedOrders.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-2xl text-gray-500">No active orders</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            <AnimatePresence>
              {sortedOrders.map((order) => (
                <KDSOrderCard
                  key={order.id}
                  order={order}
                  onReady={() => markReady(order.id)}
                  onServed={() => markServed(order.id)}
                  getElapsedTime={getElapsedTime}
                  getStageLabel={getStageLabel}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// KDS ORDER CARD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface KDSOrderCardProps {
  order: KDSOrder;
  onReady: () => void;
  onServed: () => void;
  getElapsedTime: (date: Date) => string;
  getStageLabel: (stage: KDSOrder['stage']) => string;
}

function KDSOrderCard({
  order,
  onReady,
  onServed,
  getElapsedTime,
  getStageLabel,
}: KDSOrderCardProps) {
  const stageColors = {
    new: { bg: 'bg-red-900/40', border: 'border-red-500', header: 'bg-red-900/60', accent: 'text-red-300' },
    preparing: { bg: 'bg-yellow-900/40', border: 'border-yellow-500', header: 'bg-yellow-900/60', accent: 'text-yellow-300' },
    ready: { bg: 'bg-green-900/40', border: 'border-green-500', header: 'bg-green-900/60', accent: 'text-green-300' },
    served: { bg: 'bg-gray-700/40', border: 'border-gray-500', header: 'bg-gray-700/60', accent: 'text-gray-300' },
  };

  const colors = stageColors[order.stage];
  const isReady = order.stage === 'ready';
  const isUrgent = order.priority === 'urgent';
  const elapsedTime = getElapsedTime(order.createdAt);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.2 }}
      className={`rounded-lg border-2 ${colors.border} ${colors.bg} overflow-hidden transition-all ${
        isReady ? 'ring-2 ring-green-400' : ''
      }`}
    >
      {/* Header */}
      <div className={`${colors.header} px-6 py-4 border-b border-gray-700`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <p className="text-4xl font-bold">#{order.orderNumber}</p>
            <p className="text-xl text-gray-300">Table {order.table}</p>
          </div>
          <div className="text-right">
            <p className={`text-lg font-bold ${colors.accent}`}>
              {getStageLabel(order.stage)}
            </p>
            <p className="text-xs text-gray-400 mt-1">{elapsedTime}</p>
          </div>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-2">
          {isUrgent && (
            <Badge variant="danger">URGENT</Badge>
          )}
          {isReady && (
            <Badge variant="success">READY</Badge>
          )}
          {order.notes && (
            <Badge variant="warning">NOTE</Badge>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="px-6 py-4 space-y-3 border-b border-gray-700">
        {order.items.map((item) => (
          <div key={item.id} className="space-y-1">
            {/* Item Header */}
            <div className="flex items-center justify-between">
              <p className="text-xl font-bold text-white">
                {item.quantity}x {item.name}
              </p>
              <ItemStatusDot status={item.status} />
            </div>

            {/* Modifiers */}
            {item.modifiers && item.modifiers.length > 0 && (
              <p className="text-sm text-gray-300 ml-1">
                {item.modifiers.map(m => `• ${m}`).join(' ')}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Notes */}
      {order.notes && (
        <div className="px-6 py-3 bg-gray-800/50 border-b border-gray-700">
          <p className="text-sm text-yellow-300 flex items-start gap-2">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            {order.notes}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="px-6 py-4 flex gap-3">
        {!isReady ? (
          <button
            onClick={onReady}
            className="flex-1 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition-colors text-lg"
          >
            Mark Ready
          </button>
        ) : (
          <button
            onClick={onServed}
            className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors text-lg"
          >
            Served
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ITEM STATUS DOT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ItemStatusDot({ status }: { status: string }) {
  const colors = {
    pending: 'bg-gray-500',
    preparing: 'bg-yellow-400',
    ready: 'bg-green-400',
    served: 'bg-blue-400',
  };

  return (
    <div className={`w-4 h-4 rounded-full ${colors[status as keyof typeof colors]}`} />
  );
}
