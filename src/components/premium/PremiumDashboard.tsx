'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Users, ShoppingCart, Award, AlertCircle } from 'lucide-react';
import { Card, MetricCard, Badge } from '@/components/premium/PremiumComponents';

export function PremiumDashboard() {
  const metrics = {
    revenue: { value: '$12,450.00', trend: { direction: 'up' as const, percentage: 12 }, context: 'vs yesterday' },
    orders: { value: '324', trend: { direction: 'up' as const, percentage: 8 }, context: 'today' },
    customers: { value: '1,240', trend: { direction: 'up' as const, percentage: 5 }, context: 'this month' },
    avgTicket: { value: '$38.50', trend: { direction: 'down' as const, percentage: 2 }, context: 'average' },
  };

  const topProducts = [
    { name: 'Grilled Salmon', sales: 145, revenue: '$2,175' },
    { name: 'Caesar Salad', sales: 132, revenue: '$924' },
    { name: 'ribeye Steak', sales: 118, revenue: '$2,360' },
    { name: 'Pasta Carbonara', sales: 156, revenue: '$1,092' },
  ];

  const alerts = [
    { type: 'warning', message: 'Table 5 - Bill pending for 45 minutes' },
    { type: 'info', message: 'Inventory: Salmon stock below minimum' },
  ];

  return (
    <div className="min-h-screen bg-[var(--theme-background)] text-[var(--theme-text)]">
      {/* Header */}
      <header className="bg-[var(--theme-surface)]/90 backdrop-blur-xl border-b border-[var(--theme-border)] px-6 md:px-8 py-6 md:py-7 shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
        <div>
          <h1 className="text-3xl md:text-[2rem] font-semibold tracking-[-0.03em] text-[var(--theme-text)]">Dashboard</h1>
          <p className="text-sm text-[var(--theme-text-secondary)] mt-1">Friday, January 10, 2025 • 14:35</p>
        </div>
      </header>

      {/* Content */}
      <main className="px-6 md:px-8 py-6 md:py-8 space-y-7 md:space-y-8">
        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="space-y-3">
            {alerts.map((alert, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex items-start gap-3 p-4 rounded-[18px] border shadow-[0_8px_24px_rgba(0,0,0,0.04)] ${
                  alert.type === 'warning'
                    ? 'bg-amber-50/80 border-amber-200/80 text-amber-950'
                    : 'bg-[var(--theme-surface)] border-[var(--theme-border)] text-[var(--theme-text)]'
                }`}
              >
                <AlertCircle size={18} className="flex-shrink-0" />
                <p className="text-sm font-medium">{alert.message}</p>
              </motion.div>
            ))}
          </div>
        )}

        {/* Key Metrics */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Key Metrics</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="Revenue"
              value={metrics.revenue.value}
              trend={metrics.revenue.trend}
              context={metrics.revenue.context}
            />
            <MetricCard
              label="Orders"
              value={metrics.orders.value}
              trend={metrics.orders.trend}
              context={metrics.orders.context}
            />
            <MetricCard
              label="Customers"
              value={metrics.customers.value}
              trend={metrics.customers.trend}
              context={metrics.customers.context}
            />
            <MetricCard
              label="Avg Ticket"
              value={metrics.avgTicket.value}
              trend={metrics.avgTicket.trend}
              context={metrics.avgTicket.context}
            />
          </div>
        </section>

        {/* Top Products */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Selling Products</h2>
          <Card>
            <div className="space-y-0 divide-y divide-gray-200">
              {topProducts.map((product, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between py-4 first:pt-0 last:pb-0"
                >
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{product.name}</p>
                    <p className="text-sm text-gray-600">{product.sales} sold</p>
                  </div>
                  <p className="font-bold text-gray-900">{product.revenue}</p>
                </div>
              ))}
            </div>
          </Card>
        </section>

        {/* Quick Stats */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-gray-900">Service Stats</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Avg Service Time</span>
                  <span className="font-medium text-gray-900">24 mins</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Tables in Use</span>
                  <span className="font-medium text-gray-900">12/20</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Wait Time</span>
                  <span className="font-medium text-gray-900">8 mins</span>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-gray-900">Inventory Health</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Low Stock Items</span>
                  <Badge variant="warning">3</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Out of Stock</span>
                  <Badge variant="danger">0</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Optimal Stock</span>
                  <Badge variant="success">47</Badge>
                </div>
              </div>
            </div>
          </Card>
        </section>
      </main>
    </div>
  );
}
