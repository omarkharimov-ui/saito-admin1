'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Plus, Percent, Search, X } from 'lucide-react';
import { toast } from '@/lib/toast';

import { PageTransition } from '@/components/PageTransition';
import { EmptyState } from '@/components/ui/primitives';
import { CampaignsSkeleton } from './components/CampaignsSkeleton';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import CampaignCard from './components/CampaignCard';
import CampaignModal from './components/CampaignModal';
import { DeleteCampaignModal, DeleteAllCampaignsModal } from './components/CampaignModals';
import { Campaign, Product, Category } from '@/types';
import type { FormState } from './components/CampaignModal';

type CampaignWithPerformance = Campaign & {
  rules?: any[];
  targets?: any[];
  schedules?: any[];
  total_orders?: number | null;
  unique_customers?: number | null;
  total_discount_given?: number | null;
  total_items_sold?: number | null;
  last_used_at?: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

export default function CampaignsPage() {
  const { t } = useLanguage();
  const [campaigns, setCampaigns] = useState<CampaignWithPerformance[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<CampaignWithPerformance | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [form, setForm] = useState<FormState>({
    name: '',
    title: '',
    description: '',
    type: 'PERCENTAGE',
    status: 'active',
    priority: 0,
    stackable: false,
    exclusive: false,
    max_uses: null,
    max_uses_per_customer: null,
    max_uses_per_day: null,
    max_uses_per_order: null,
    min_order_amount: null,
    max_order_amount: null,
    dining_type: ['dine_in', 'takeaway', 'delivery'],
    table_numbers: [],
    auto_apply: true,
    requires_coupon: false,
    coupon_code: '',
    start_date: '',
    end_date: '',
    rules: [{ rule_type: 'percentage', percentage: 0 }],
    targets: [{ target_type: 'whole_order' }],
    schedules: [{ is_recurring: false, weekdays: [1,2,3,4,5,6,7] }],
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [campRes, prodRes, catRes, perfRes] = await Promise.all([
        fetch('/api/campaigns'),
        fetch('/api/pos/products'),
        fetch('/api/categories'),
        fetch('/api/campaigns/performance'),
      ]);
      const campData = await campRes.json();
      const prodData = await prodRes.json();
      const catData = await catRes.json();
      const perfData = perfRes.ok ? await perfRes.json() : { data: [] };

      const performanceMap = new Map((perfData.data || []).map((p: any) => [p.id, p]));
      const campaignsWithPerformance = (campData.data || []).map((c: any) => ({
        ...c,
        ...(performanceMap.get(c.id) || {}),
      }));

      setCampaigns(campaignsWithPerformance);
      setProducts(prodData.products || []);
      setCategories(catData || []);
    } catch {
      toast.error('Məlumatlar yüklənərkən xəta baş verdi');
    } finally {
      setLoading(false);
    }
  }, []);

  const filteredCampaigns = campaigns.filter(c => {
    const q = searchQuery.toLowerCase();
    return (c.title || '').toLowerCase().includes(q) ||
           (c.type || '').toLowerCase().includes(q);
  });

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredProducts = products.filter(p =>
    (p.name || '').toLowerCase().includes(productSearch.toLowerCase())
  );

  const activeCampaigns = filteredCampaigns.filter(c => c.status === 'active');
  const inactiveCampaigns = filteredCampaigns.filter(c => c.status !== 'active');

  const openCreate = () => {
    setEditingCampaign(null);
    setForm({
      name: '',
      title: '',
      description: '',
      type: 'PERCENTAGE',
      status: 'active',
      priority: 0,
      stackable: false,
      exclusive: false,
      max_uses: null,
      max_uses_per_customer: null,
      max_uses_per_day: null,
      max_uses_per_order: null,
      min_order_amount: null,
      max_order_amount: null,
      dining_type: ['dine_in', 'takeaway', 'delivery'],
      table_numbers: [],
      auto_apply: true,
      requires_coupon: false,
      coupon_code: '',
      start_date: '',
      end_date: '',
      rules: [{ rule_type: 'percentage', percentage: 0 }],
      targets: [{ target_type: 'whole_order' }],
      schedules: [{ is_recurring: false, weekdays: [1,2,3,4,5,6,7] }],
    });
    setProductSearch('');
    setModalOpen(true);
  };

  const openEdit = (camp: CampaignWithPerformance) => {
    setEditingCampaign(camp);
    const rule = camp.rules?.[0] || { rule_type: 'percentage', percentage: 0 };
    const target = camp.targets?.[0] || { target_type: 'whole_order' };
    const schedule = camp.schedules?.[0] || {};
    const startDate = schedule.start_date || camp.start_date || '';
    const endDate = schedule.end_date || camp.end_date || '';

    setForm({
      name: camp.name || camp.title || '',
      title: camp.title || '',
      description: camp.description || '',
      type: camp.type || 'PERCENTAGE',
      status: camp.status === 'expired' ? 'inactive' : (camp.status || 'active'),
      priority: camp.priority || 0,
      stackable: camp.stackable || false,
      exclusive: camp.exclusive || false,
      max_uses: camp.max_uses || null,
      max_uses_per_customer: camp.max_uses_per_customer || null,
      max_uses_per_day: camp.max_uses_per_day || null,
      max_uses_per_order: camp.max_uses_per_order || null,
      min_order_amount: camp.min_order_amount || null,
      max_order_amount: camp.max_order_amount || null,
      dining_type: camp.dining_type || ['dine_in', 'takeaway', 'delivery'],
      table_numbers: camp.table_numbers || [],
      auto_apply: camp.auto_apply ?? true,
      requires_coupon: camp.requires_coupon || false,
      coupon_code: camp.coupon_code || '',
      start_date: startDate,
      end_date: endDate,
      rules: [rule],
      targets: [target],
      schedules: [schedule],
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() && !form.title.trim()) return;
    setIsSubmitting(true);
    try {
      const payload: Record<string, any> = {
        name: form.name.trim() || form.title.trim(),
        title: form.title.trim() || form.name.trim(),
        description: form.description.trim() || null,
        type: form.type,
        status: form.status,
        priority: form.priority,
        stackable: form.stackable,
        exclusive: form.exclusive,
        max_uses: form.max_uses,
        max_uses_per_customer: form.max_uses_per_customer,
        max_uses_per_day: form.max_uses_per_day,
        max_uses_per_order: form.max_uses_per_order,
        min_order_amount: form.min_order_amount,
        max_order_amount: form.max_order_amount,
        dining_type: form.dining_type,
        table_numbers: form.table_numbers,
        auto_apply: form.auto_apply,
        requires_coupon: form.requires_coupon,
        coupon_code: form.coupon_code || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        rules: form.rules,
        targets: form.targets,
        schedules: form.schedules,
      };

      if (editingCampaign) payload.id = editingCampaign.id;

      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(editingCampaign ? 'Kampaniya yeniləndi' : 'Kampaniya yaradıldı');
      setModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/campaigns?id=${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('Kampaniya silindi');
      setDeleteTarget(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <PageTransition className="min-h-screen bg-[var(--theme-bg)] text-[var(--theme-text)] pb-20">
      <div className="absolute inset-x-0 top-0 h-[20rem] bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.08),transparent_50%)] pointer-events-none" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10 space-y-8">
        {/* Hero Section - styled like Stock page */}
        <motion.div
          initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-[32px] border border-[var(--theme-border)] bg-[var(--theme-surface)] px-6 py-6 sm:px-8 sm:py-8 shadow-[var(--theme-shadow)]"
        >
          <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-gold/10 bg-gold/5 px-3 py-1 text-[10px] font-bold tracking-[0.2em] text-gold uppercase">
                <Percent size={12} /> PREMIUM MARKETING
              </div>
              <h1 className="text-3xl sm:text-4xl font-serif font-bold text-[var(--theme-text)]">{t('campaigns_title')}</h1>
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="flex items-center gap-2 sm:gap-3 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-[10px] sm:text-[11px] font-semibold text-emerald-400 uppercase tracking-wide">{activeCampaigns.length} {t('active_campaigns')}</span>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.08]">
                  <span className="w-2 h-2 rounded-full bg-white/20" />
                  <span className="text-[10px] sm:text-[11px] text-[var(--theme-text-muted)] font-semibold uppercase tracking-wide">{inactiveCampaigns.length} {t('passive') || 'Passiv'}</span>
                </div>
              </div>
            </div>
            
            {/* Right side controls */}
            <div className="relative flex items-center gap-3">
              <div className="relative">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)]" />
                <input
                  type="text"
                  placeholder={t('search') || 'Axtar...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full sm:w-64 bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] rounded-2xl pl-12 pr-10 py-3 text-sm text-[var(--theme-text)] outline-none focus:border-gold/30 placeholder:text-[var(--theme-text-muted)] transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <button
                onClick={openCreate}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-[11px] uppercase tracking-widest transition-all bg-[var(--theme-accent)] text-black border border-[var(--theme-accent-border)] hover:brightness-95 whitespace-nowrap"
              >
                <Plus size={15} />
                {t('combo_new')}
              </button>
            </div>
          </div>
        </motion.div>

        {/* Content */}
        {loading ? (
          <CampaignsSkeleton />
        ) : filteredCampaigns.length === 0 ? (
          <EmptyState
            icon={<Percent size={20} />}
            title={campaigns.length === 0 ? 'Hələ kampaniya yaradılmayıb' : t('no_campaigns') || 'Kampaniya tapılmadı'}
            description={campaigns.length === 0 ? t('campaigns_subtitle') : searchQuery ? `"${searchQuery}" üzərində axtarış...` : ''}
            action={
              campaigns.length === 0 ? (
                <button onClick={openCreate} className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-[11px] uppercase tracking-widest transition-all bg-[var(--theme-accent)] text-black border border-[var(--theme-accent-border)] hover:brightness-95">
                  <Plus size={14} />
                  İlk Kampaniyanı Yarat
                </button>
              ) : null
            }
          />
        ) : (
          <>
            {activeCampaigns.length > 0 && (
              <section>
                <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-emerald-400/70 mb-4">
                  Aktiv Kampaniyalar ({activeCampaigns.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeCampaigns.map(c => (
                    <CampaignCard
                      key={c.id}
                      camp={c}
                      products={products}
                      categories={categories}
                      onEdit={openEdit}
                      onDelete={(id, title) => setDeleteTarget({ id, title })}
                    />
                  ))}
                </div>
              </section>
            )}
            {inactiveCampaigns.length > 0 && (
              <section>
                <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-[var(--theme-text-muted)] mb-4">
                  Passiv Kampaniyalar ({inactiveCampaigns.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {inactiveCampaigns.map(c => (
                    <CampaignCard
                      key={c.id}
                      camp={c}
                      products={products}
                      categories={categories}
                      onEdit={openEdit}
                      onDelete={(id, title) => setDeleteTarget({ id, title })}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      <CampaignModal
        open={modalOpen}
        campaign={editingCampaign as any}
        form={form}
        isSubmitting={isSubmitting}
        productSearch={productSearch}
        filteredProducts={filteredProducts}
        products={products}
        categories={categories}
        onClose={() => setModalOpen(false)}
        onFormChange={setForm}
        onProductSearch={setProductSearch}
        onSubmit={handleSubmit}
      />

      <DeleteCampaignModal
        campaign={deleteTarget}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </PageTransition>
  );
}
