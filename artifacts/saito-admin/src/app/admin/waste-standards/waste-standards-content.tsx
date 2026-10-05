'use client';

import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Edit3, Loader2, Percent } from '@/components/ui/saito-icons';
import { toast } from '@/lib/toast';
import MobileModal from '@/components/ui/MobileModal';
// 13j: design system (one visual language across the inventory module)
import { Btn, DataTable, SearchInput, IconBtn, SpinnerBlock, Modal, Field, fieldCls } from '../stock/stock-ui';

interface WasteStandard {
  id: string;
  keyword: string;
  keyword_en: string | null;
  waste_percentage: number;
  note: string | null;
  category: string | null;
  created_at: string;
  updated_at: string;
}

interface ModalState {
  mode: 'add' | 'edit' | null;
  data: WasteStandard | null;
}

export default function WasteStandardsPage() {
  const [data, setData] = useState<WasteStandard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<ModalState>({ mode: null, data: null });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const filtered = data.filter(s =>
    s.keyword.toLowerCase().includes(search.toLowerCase()) ||
    (s.keyword_en?.toLowerCase() || '').includes(search.toLowerCase()) ||
    (s.category?.toLowerCase() || '').includes(search.toLowerCase())
  );

  const fetchData = async () => {
    try {
      const res = await fetch('/api/inventory/waste-standards');
      const json = await res.json();
      if (Array.isArray(json)) setData(json);
    } catch {
      toast.error('Məlumat yüklənə bilmədi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/inventory/waste-standards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: fd.get('keyword'),
          keyword_en: fd.get('keyword_en') || null,
          waste_percentage: parseFloat(fd.get('waste_percentage') as string) || 0,
          note: fd.get('note') || null,
          category: fd.get('category') || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Xəta');
      }
      toast.success('Standart əlavə edildi');
      setModal({ mode: null, data: null });
      fetchData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!modal.data) return;
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/inventory/waste-standards', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: modal.data.id,
          keyword: fd.get('keyword'),
          keyword_en: fd.get('keyword_en') || null,
          waste_percentage: parseFloat(fd.get('waste_percentage') as string) || 0,
          note: fd.get('note') || null,
          category: fd.get('category') || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Xəta');
      }
      toast.success('Standart yeniləndi');
      setModal({ mode: null, data: null });
      fetchData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const handleDelete = async (id: string) => {
    setPendingDeleteId(id);
    setDeleteConfirmOpen(true);
  };

  const startInlineEdit = (s: WasteStandard) => {
    setEditingId(s.id);
    setEditValue(String(s.waste_percentage));
  };

  const saveInlineEdit = async (s: WasteStandard) => {
    const val = parseFloat(editValue);
    if (isNaN(val) || val < 0 || val >= 100) {
      toast.error('0-99 arası dəyər daxil edin');
      return;
    }
    try {
      const res = await fetch('/api/inventory/waste-standards', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: s.id, waste_percentage: val }),
      });
      if (!res.ok) throw new Error('Xəta');
      setEditingId(null);
      fetchData();
    } catch {
      toast.error('Yenilənmə xətası');
    }
  };

  // 13j: design system — DataTable + inline edit preserved.
  return (
    <div className="text-[var(--theme-text)]">
      <div className="space-y-4">
        {/* ── Toolbar ── */}
        <div className="flex items-center justify-end">
          <Btn variant="solid" icon={Plus} onClick={() => setModal({ mode: 'add', data: null })}>Yeni Standart</Btn>
        </div>

        <SearchInput value={search} onChange={setSearch} placeholder="Axtar..." className="max-w-sm" />

        {/* ── Table ── */}
        {loading ? (
          <SpinnerBlock height={240} />
        ) : (
          <DataTable
            rows={filtered.map(s => ({ ...s, __actions: (
              <>
                <IconBtn icon={Edit3} title="Redaktə" tone="blue" onClick={() => setModal({ mode: 'edit', data: s })} />
                <IconBtn icon={Trash2} title="Sil" tone="rose" onClick={() => handleDelete(s.id)} />
              </>
            ) }))}
            rowKey={r => r.id}
            actionsWidth={72}
            cols={[
              { key: 'kw', label: 'Keyword (AZ)', width: '1.3fr', render: r => <span className="text-[13px] font-semibold text-[var(--theme-text)] truncate">{r.keyword}</span> },
              { key: 'kwEn', label: 'Keyword (EN)', width: '1fr', hide: 'sm', render: r => <span className="text-xs text-[var(--theme-text-muted)] truncate">{r.keyword_en || '—'}</span> },
              {
                key: 'pct', label: 'İtki %', width: '110px', align: 'right',
                render: r => (
                  <div className="flex justify-end">
                    {editingId === r.id ? (
                      <input
                        type="number" min="0" max="99" step="0.1"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onBlur={() => saveInlineEdit(r)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveInlineEdit(r);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="w-20 text-right bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] rounded-lg px-2 py-1 text-sm text-[var(--theme-text)] outline-none focus:border-[var(--theme-text)]/40 tabular-nums"
                        autoFocus
                      />
                    ) : (
                      <span
                        className="tabular-nums text-[13px] font-black cursor-pointer hover:opacity-70 transition-opacity"
                        style={{ color: r.waste_percentage > 20 ? 'var(--theme-text)' : 'var(--theme-text-secondary)' }}
                        onClick={() => startInlineEdit(r)}
                        title="Dəyişdirmək üçün kliklə"
                      >
                        {r.waste_percentage}%
                      </span>
                    )}
                  </div>
                ),
              },
              { key: 'note', label: 'Qeyd', width: '1.4fr', hide: 'lg', render: r => <span className="text-xs text-[var(--theme-text-muted)] truncate">{r.note || '—'}</span> },
              { key: 'cat', label: 'Kateqoriya', width: '120px', hide: 'md', render: r => <span className="text-xs text-[var(--theme-text-muted)] truncate">{r.category || '—'}</span> },
            ]}
            empty={
              <div className="py-12 text-center">
                <Percent size={32} className="mx-auto mb-3 opacity-25 text-[var(--theme-text-muted)]" />
                <p className="text-sm font-medium text-[var(--theme-text-secondary)]">Standart tapılmadı</p>
                <p className="text-xs text-[var(--theme-text-muted)] mt-1">
                  {search ? 'Axtarışınıza uyğun nəticə yoxdur.' : 'Hələ heç bir itki standartı əlavə edilməyib.'}
                </p>
              </div>
            }
          />
        )}

        {/* ═══════════════════════════════════════════════════════════
            ADD / EDIT MODAL (13j: design-system Modal)
        ═══════════════════════════════════════════════════════════ */}
        <AnimatePresence>
          {modal.mode && (
            <Modal title={modal.mode === 'add' ? 'Yeni Standart' : 'Standartı Redaktə Et'} subtitle="İtki standartları" onClose={() => setModal({ mode: null, data: null })}>
              <form onSubmit={modal.mode === 'add' ? handleCreate : handleUpdate} className="space-y-4">
                <Field label="Keyword (AZ) *">
                  <input name="keyword" required defaultValue={modal.data?.keyword || ''} className={fieldCls} />
                </Field>
                <Field label="Keyword (EN)">
                  <input name="keyword_en" defaultValue={modal.data?.keyword_en || ''} className={fieldCls} />
                </Field>
                <Field label="İtki Faizi (%) *">
                  <input name="waste_percentage" type="number" min="0" max="99" step="0.1" required defaultValue={modal.data?.waste_percentage ?? ''} className={fieldCls} />
                </Field>
                <Field label="Qeyd">
                  <input name="note" defaultValue={modal.data?.note || ''} className={fieldCls} />
                </Field>
                <Field label="Kateqoriya">
                  <input name="category" defaultValue={modal.data?.category || ''} placeholder="məs: tərəvəz, meyvə, ət..." className={fieldCls} />
                </Field>
                <div className="flex gap-3 pt-1">
                  <Btn variant="ghost" className="flex-1" onClick={() => setModal({ mode: null, data: null })}>Ləğv et</Btn>
                  <Btn variant="solid" type="submit" className="flex-1" disabled={saving} icon={saving ? Loader2 : Plus}>
                    {modal.mode === 'add' ? 'Əlavə et' : 'Yadda saxla'}
                  </Btn>
                </div>
              </form>
            </Modal>
          )}
        </AnimatePresence>
      </div>
      <MobileModal open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <div className="space-y-4 text-center">
          <h3 className="text-lg font-bold">Bu standart silinsin?</h3>
          <p className="text-sm text-[var(--theme-text-secondary)]">Bu əməliyyat geri alına bilməz.</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => setDeleteConfirmOpen(false)}
              className="px-4 py-2 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface-soft)] text-[var(--theme-text-secondary)]"
            >
              Ləğv
            </button>
            <button
              onClick={async () => {
                if (!pendingDeleteId) return;
                setDeleteConfirmOpen(false);
                const id = pendingDeleteId;
                setPendingDeleteId(null);
                try {
                  const res = await fetch(`/api/inventory/waste-standards?id=${id}`, { method: 'DELETE' });
                  if (!res.ok) throw new Error('Xəta');
                  toast.success('Standart silindi');
                  fetchData();
                } catch {
                  toast.error('Silinmə xətası');
                }
              }}
              className="px-4 py-2 rounded-xl bg-[var(--theme-accent)] text-black font-semibold"
            >
              Sil
            </button>
          </div>
        </div>
      </MobileModal>
    </div>
  );
}
