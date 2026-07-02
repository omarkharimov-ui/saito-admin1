'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Plus, Percent, Search, X } from 'lucide-react';
import { toast } from '@/lib/toast';

import { PageTransition } from '@/components/PageTransition';
import { EmptyState } from '@/components/ui/primitives';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import CampaignCard from './components/CampaignCard';
import CampaignModal from './components/CampaignModal';
import { DeleteCampaignModal, DeleteAllCampaignsModal } from './components/CampaignModals';
import { Product, Category } from '@/types';

export default function CampaignsPage() {
  const { t } = useLanguage();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<any | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [form, setForm] = useState<any>({
    title: '',
    type: 'PERCENTAGE',
    target_type: 'product',
    target_id: '',
    discount_value: '',
    start_time: '',
    end_time: '',
    end_date: '',
    status: 'active',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [campRes, prodRes, catRes] = await Promise.all([
        fetch('/api/campaigns'),
        fetch('/api/pos/products'),
        fetch('/api/categories'),
      ]);
      const campData = await campRes.json();
      const prodData = await prodRes.json();
      const catData = await catRes.json();
      setCampaigns(campData.data || []);
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
      title: '',
      type: 'PERCENTAGE',
      target_type: 'product',
      target_id: '',
      discount_value: '',
      start_time: '',
      end_time: '',
      end_date: '',
      status: 'active',
    });
    setProductSearch('');
    setModalOpen(true);
  };

  const openEdit = (camp: any) => {
    setEditingCampaign(camp);
    setForm({
      title: camp.title || '',
      type: camp.type || 'PERCENTAGE',
      target_type: camp.target_type || 'product',
      target_id: camp.target_id || '',
      discount_value: String(camp.discount_value || ''),
      start_time: camp.start_time || '',
      end_time: camp.end_time || '',
      end_date: camp.end_date || '',
      status: camp.status || 'inactive',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.discount_value) return;
    setIsSubmitting(true);
    try {
      const payload: Record<string, any> = {
        title: form.title.trim(),
        type: form.type,
        discount_value: parseFloat(form.discount_value) || 0,
        discount_type: form.type === 'FIXED_AMOUNT' ? 'fixed' : 'percentage',
        target_type: form.target_type,
        target_id: form.target_id || null,
        status: form.status || (form.end_date ? 'active' : 'active'),
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        end_date: form.end_date || null,
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10 space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6"
        >
          <div>
            <h1 className="text-2xl font-serif font-bold text-[var(--theme-text)]">{t('campaigns_title')}</h1>
            <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)] mt-1">
              {t('campaigns_subtitle')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)]" />
              <input
                type="text"
                placeholder={t('search') || 'Axtar...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-64 pl-9 pr-8 py-2.5 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] text-[14px] text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-[11px] uppercase tracking-widest transition-all bg-[var(--theme-accent)] text-black border border-[var(--theme-accent-border)] hover:brightness-95"
            >
              <Plus size={15} />
              {t('combo_new')}
            </button>
          </div>
        </motion.div>

        {/* Stats Summary */}
        <div className="flex items-center gap-4 mb-6 text-[10px]">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-emerald-400 font-semibold">{activeCampaigns.length} {t('active_campaigns')}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.08]">
            <span className="w-2 h-2 rounded-full bg-white/20" />
            <span className="text-[var(--theme-text-muted)] font-semibold">{inactiveCampaigns.length} {t('passive') || 'Passiv'}</span>
          </div>
        </div>

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
        campaign={editingCampaign}
        form={form}
        isSubmitting={isSubmitting}
        productSearch={productSearch}
        filteredProducts={filteredProducts}
        products={products}
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
