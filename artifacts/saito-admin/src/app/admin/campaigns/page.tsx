'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Percent, AlertCircle, Search, X } from 'lucide-react';
import { toast } from '@/lib/toast';

import { PageTransition } from '@/components/PageTransition';
import CampaignCard from './components/CampaignCard';
import CampaignModal from './components/CampaignModal';
import { DeleteCampaignModal, DeleteAllCampaignsModal } from './components/CampaignModals';
import { CampaignsSkeleton } from './components/CampaignsSkeleton';
import { Product, Category } from '@/types';

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<any | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [productSearch, setProductSearch] = useState('');
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

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredProducts = products.filter(p =>
    (p.name || '').toLowerCase().includes(productSearch.toLowerCase())
  );

  const activeCampaigns = campaigns.filter(c => c.status === 'active');
  const inactiveCampaigns = campaigns.filter(c => c.status !== 'active');

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
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#1e1600,#140f00)', border: '1px solid rgba(212,175,55,0.2)' }}>
              <Percent size={20} className="text-[#D4AF37]" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-serif font-bold tracking-tight leading-none">
                Qiymət Kampaniyaları
              </h1>
              <p className="text-[11px] text-[var(--theme-text-muted)] uppercase tracking-[0.2em] mt-1">
                Pricing Campaigns
              </p>
            </div>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold tracking-wide transition-all active:scale-[0.97]"
            style={{ background: '#111111', color: '#ffffff', border: '1px solid rgba(255,255,255,0.16)' }}
          >
            <Plus size={15} /> Yeni Kampaniya
          </button>
        </motion.div>

        {/* Content */}
        {loading ? (
          <CampaignsSkeleton />
        ) : campaigns.length === 0 ? (
          <div className="text-center py-20">
            <Percent size={48} className="mx-auto mb-4 opacity-20 text-[var(--theme-text-muted)]" />
            <p className="text-sm font-medium text-[var(--theme-text-secondary)]">Hələ kampaniya yaradılmayıb</p>
            <button onClick={openCreate} className="mt-4 px-5 py-2.5 rounded-xl text-sm font-bold"
              style={{ background: '#111111', color: '#ffffff', border: '1px solid rgba(255,255,255,0.16)' }}>
              <Plus size={14} className="inline mr-1.5" />İlk Kampaniyanı Yarat
            </button>
          </div>
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
