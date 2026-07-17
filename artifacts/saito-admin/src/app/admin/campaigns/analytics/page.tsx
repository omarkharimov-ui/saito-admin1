'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { toast } from '@/lib/toast';
import { PageTransition } from '@/components/PageTransition';
import { CampaignsSkeleton } from '../components/CampaignsSkeleton';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Campaign } from '@/types';

interface CampaignPerformance {
  id: string;
  title: string;
  type: string;
  status: string;
  priority: number;
  total_orders: number | null;
  unique_customers: number | null;
  total_discount_given: number | null;
  total_items_sold: number | null;
  avg_discount_per_order: number | null;
  last_used_at: string | null;
  campaign_created_at: string;
}

export default function CampaignAnalyticsPage() {
  const { t } = useLanguage();
  const [campaigns, setCampaigns] = useState<CampaignPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/campaigns/performance');
      if (!res.ok) throw new Error('Failed to fetch performance data');
      const data = await res.json();
      setCampaigns(data.data || []);
    } catch {
      toast.error('Məlumatlar yüklənərkən xəta baş verdi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredCampaigns = campaigns.filter(c => {
    const q = searchQuery.toLowerCase();
    return (c.title || '').toLowerCase().includes(q) || (c.type || '').toLowerCase().includes(q);
  });

  const totalStats = {
    orders: campaigns.reduce((sum, c) => sum + (c.total_orders || 0), 0),
    customers: campaigns.reduce((sum, c) => sum + (c.unique_customers || 0), 0),
    discount: campaigns.reduce((sum, c) => sum + (c.total_discount_given || 0), 0),
  };

  if (loading) {
    return (
      <PageTransition>
        <div className="p-6">
          <h1 className="text-2xl font-bold text-white mb-6">Kampaniya Performansı</h1>
          <CampaignsSkeleton />
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Kampaniya Performansı</h1>
          <button onClick={fetchData} className="px-4 py-2 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] text-xs font-bold uppercase tracking-wider hover:bg-[var(--theme-panel)] transition-all">
            Yenilə
          </button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[var(--theme-panel)] border border-[var(--theme-border)] rounded-2xl p-5">
            <p className="text-[10px] uppercase tracking-widest text-[var(--theme-text-muted)] mb-1">Toplam Sifariş</p>
            <p className="text-3xl font-black text-white">{totalStats.orders}</p>
          </div>
          <div className="bg-[var(--theme-panel)] border border-[var(--theme-border)] rounded-2xl p-5">
            <p className="text-[10px] uppercase tracking-widest text-[var(--theme-text-muted)] mb-1">Müştəri</p>
            <p className="text-3xl font-black text-white">{totalStats.customers}</p>
          </div>
          <div className="bg-[var(--theme-panel)] border border-[var(--theme-border)] rounded-2xl p-5">
            <p className="text-[10px] uppercase tracking-widest text-[var(--theme-text-muted)] mb-1">Endirim</p>
            <p className="text-3xl font-black text-emerald-400">-₼{totalStats.discount.toFixed(0)}</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <input type="text" placeholder="Kampaniya axtar..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full md:w-96 pl-10 pr-4 py-2.5 bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] hover:border-[var(--theme-border-strong)] focus:border-[var(--theme-border-strong)] rounded-xl text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none transition-all" />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </div>

        {/* Campaigns List */}
        <div className="bg-[var(--theme-panel)] border border-[var(--theme-border)] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--theme-border)]">
                  <th className="text-left px-5 py-3 text-[10px] uppercase tracking-widest text-[var(--theme-text-muted)] font-semibold">Kampaniya</th>
                  <th className="text-left px-5 py-3 text-[10px] uppercase tracking-widest text-[var(--theme-text-muted)] font-semibold">Növ</th>
                  <th className="text-left px-5 py-3 text-[10px] uppercase tracking-widest text-[var(--theme-text-muted)] font-semibold">Status</th>
                  <th className="text-right px-5 py-3 text-[10px] uppercase tracking-widest text-[var(--theme-text-muted)] font-semibold">Sifariş</th>
                  <th className="text-right px-5 py-3 text-[10px] uppercase tracking-widest text-[var(--theme-text-muted)] font-semibold">Müştəri</th>
                  <th className="text-right px-5 py-3 text-[10px] uppercase tracking-widest text-[var(--theme-text-muted)] font-semibold">Endirim</th>
                  <th className="text-left px-5 py-3 text-[10px] uppercase tracking-widest text-[var(--theme-text-muted)] font-semibold">Son istifadə</th>
                </tr>
              </thead>
              <tbody>
                {filteredCampaigns.map((campaign, idx) => (
                  <motion.tr
                    key={campaign.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className="border-b border-[var(--theme-border)] last:border-0 hover:bg-[var(--theme-surface-soft)] transition-colors"
                  >
                    <td className="px-5 py-4">
                      <p className="text-sm font-semibold text-white truncate max-w-[200px]">{campaign.title}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gold/80 bg-[var(--theme-accent-soft)] px-2 py-0.5 rounded-full border border-[var(--theme-accent-border)]">
                        {campaign.type}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider ${campaign.status === 'active' ? 'text-emerald-400' : 'text-[var(--theme-text-muted)]'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${campaign.status === 'active' ? 'bg-emerald-400' : 'bg-white/20'}`} />
                        {campaign.status === 'active' ? 'Aktiv' : campaign.status === 'inactive' ? 'Deaktiv' : campaign.status === 'draft' ? 'Qaralama' : 'Bitib'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className="text-sm font-bold text-white">{campaign.total_orders || 0}</span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className="text-sm font-bold text-white">{campaign.unique_customers || 0}</span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className="text-sm font-bold text-emerald-400">-₼{(campaign.total_discount_given || 0).toFixed(0)}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs text-[var(--theme-text-muted)]">
                        {campaign.last_used_at ? new Date(campaign.last_used_at).toLocaleDateString('az-AZ') : '-'}
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
