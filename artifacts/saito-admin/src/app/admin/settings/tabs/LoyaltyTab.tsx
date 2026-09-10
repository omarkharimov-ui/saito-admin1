'use client';

import { useState, useEffect } from 'react';
import { getSettings, updateSettings } from '@/lib/settings-client';
import { apiFetch } from '@/lib/api-fetch';
import { Loader2, Star, Save, Trash2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { GsLoader, inputCls, labelCls } from './_shared';

const LoyaltyTab = () => {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [pointsPerManat, setPointsPerManat] = useState('1');
  const [pointValue, setPointValue] = useState('0.01');
  const [minRedeem, setMinRedeem] = useState('10');

  useEffect(() => {
    (async () => {
      const d = await getSettings('loyalty');
      setEnabled(Boolean(d.loyalty_enabled));
      if (d.loyalty_points_per_manat != null) setPointsPerManat(String(d.loyalty_points_per_manat));
      if (d.loyalty_point_value != null) setPointValue(String(d.loyalty_point_value));
      if (d.loyalty_min_redeem != null) setMinRedeem(String(d.loyalty_min_redeem));
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const res = await updateSettings('loyalty', {
      loyalty_enabled: enabled,
      loyalty_points_per_manat: parseFloat(pointsPerManat) || 1,
      loyalty_point_value: parseFloat(pointValue) || 0.01,
      loyalty_min_redeem: parseInt(minRedeem, 10) || 0,
    });
    setSaving(false);
    if (res.ok) toast.success(t('settings_saved') || 'Yadda saxlanıldı');
    else toast.error(res.error || 'Save failed');
  };

  if (loading) return <GsLoader />;

  return (
    <div className="space-y-6 max-w-xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
          <Star size={20} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-white">Məxsusiyyət proqramı (Loyalty)</h2>
          <p className="text-[10px] text-white/30">Ödənişdə avtomatik xal toplama, refund-da geri alma</p>
        </div>
      </div>

      <label className="flex items-center justify-between p-4 rounded-2xl bg-[var(--theme-surface)] border border-[var(--theme-border)] cursor-pointer">
        <div>
          <p className="text-xs font-bold text-white">Proqram aktivdir</p>
          <p className="text-[10px] text-white/30 mt-0.5">İstifadəçi bağlanmış sifarişdə ödəniş etdikdə xal qazanır</p>
        </div>
        <button
          type="button"
          onClick={() => setEnabled(v => !v)}
          className={`w-12 h-7 rounded-full transition-colors relative ${enabled ? 'bg-sky-500' : 'bg-white/10'}`}
        >
          <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white transition-all ${enabled ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </label>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>Xal / manat</label>
          <input className={inputCls} type="number" step="0.1" min="0" value={pointsPerManat} onChange={e => setPointsPerManat(e.target.value)} disabled={!enabled} />
          <p className="text-[9px] text-white/25 mt-1">1 manat = N xal</p>
        </div>
        <div>
          <label className={labelCls}>Xal dəyəri (₼)</label>
          <input className={inputCls} type="number" step="0.001" min="0" value={pointValue} onChange={e => setPointValue(e.target.value)} disabled={!enabled} />
          <p className="text-[9px] text-white/25 mt-1">1 xal = N manat endirim</p>
        </div>
        <div>
          <label className={labelCls}>Min. istifadə</label>
          <input className={inputCls} type="number" step="1" min="0" value={minRedeem} onChange={e => setMinRedeem(e.target.value)} disabled={!enabled} />
          <p className="text-[9px] text-white/25 mt-1">Minimum xal sayı</p>
        </div>
      </div>

      <div className="bg-[var(--theme-surface-muted)] border border-[var(--theme-border)] rounded-2xl p-4">
        <p className="text-[10px] text-white/40 leading-relaxed">
          <span className="font-bold text-white/60">Necə işləyir:</span> istifadəçi sifarişə bağlanır və ödəniş etdikdə sistem
          xalları avtomatik qeyd edir (refund olduqda geri alınır). Ödəniş ekranında “Məxsusiyyət xalları” bölməsindən
          xal endirimə çevrilir və sifariş cəmi avtomatik yenilənir.
        </p>
      </div>

      {/* Per-product earn rules (OS BUILD #1b) */}
      <RulesSection />

      <button
        onClick={save}
        disabled={saving}
        className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gold text-black text-xs font-black uppercase tracking-widest hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        Yadda saxla
      </button>
    </div>
  );
};

// ── Per-product / per-category earn rules ─────────────────────────────
const RulesSection = () => {
  const { t } = useLanguage();
  const [rules, setRules] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<'product' | 'category'>('product');
  const [targetId, setTargetId] = useState('');
  const [mode, setMode] = useState<'points_per_unit' | 'multiplier'>('points_per_unit');
  const [pointsPerUnit, setPointsPerUnit] = useState('1');
  const [multiplier, setMultiplier] = useState('1');
  const [cap, setCap] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [r, p] = await Promise.all([
        apiFetch('/api/settings/loyalty/rules'),
        apiFetch('/api/admin/products'),
      ]);
      if (r.ok) setRules(await r.json());
      if (p.ok) {
        const d = await p.json();
        setProducts(Array.isArray(d?.products) ? d.products.filter((x: any) => x?.is_active !== false).map((x: any) => ({ id: x.id, name: x.name })) : []);
        setCategories(Array.isArray(d?.categories) ? d.categories.map((x: any) => ({ id: x.id, name: x.name })) : []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const targetName = (r: any) =>
    scope === 'product'
      ? (r.products?.name || products.find((p) => p.id === r.product_id)?.name || r.product_id)
      : (r.categories?.name || categories.find((c) => c.id === r.category_id)?.name || r.category_id);

  const saveRule = async () => {
    if (!targetId) return;
    setBusy(true);
    try {
      const res = await apiFetch('/api/settings/loyalty/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope,
          product_id: scope === 'product' ? targetId : undefined,
          category_id: scope === 'category' ? targetId : undefined,
          mode,
          points_per_unit: pointsPerUnit,
          multiplier,
          cap_points_per_order: cap,
          label,
        }),
      });
      if (res.ok) {
        toast.success('Qayda yadda saxlanıldı');
        setTargetId(''); setLabel(''); setCap('');
        void load();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || 'Qayda saxlanmadı');
      }
    } finally {
      setBusy(false);
    }
  };

  const removeRule = async (id: string) => {
    const res = await apiFetch('/api/settings/loyalty/rules', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) void load();
  };

  if (loading) return <GsLoader />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-white">Məhsul bazalı xal qaydaları</h3>
        <span className="text-[9px] text-white/30">məhsul → kateqoriya → default sırası ilə</span>
      </div>

      <div className="space-y-1.5 max-h-56 overflow-y-auto">
        {rules.length === 0 && (
          <p className="text-[10px] text-white/25 p-3 rounded-xl border border-dashed border-[var(--theme-border)]">
            Qayda yoxdur — bütün sifarişlər default dərəcədə (Xal/manat) xal qazanır.
          </p>
        )}
        {rules.map((r) => (
          <div key={r.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${r.is_active ? 'bg-[var(--theme-surface)] border-[var(--theme-border)]' : 'bg-transparent border-[var(--theme-border)] opacity-40'}`}>
            <span className="text-[10px] font-bold text-white flex-1">
              {targetName(r)} <span className="text-white/30">({r.scope === 'product' ? 'məhsul' : 'kateqoriya'})</span>
            </span>
            <span className="text-[10px] font-black text-sky-400">
              {r.mode === 'points_per_unit' ? `${r.points_per_unit} xal/vahid` : `×${r.multiplier}`}
              {r.cap_points_per_order ? ` (max ${r.cap_points_per_order})` : ''}
            </span>
            <button onClick={() => removeRule(r.id)} className="text-white/25 hover:text-red-400 transition-colors" title="Söndür">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl bg-[var(--theme-surface)] border border-[var(--theme-border)]">
        <select className={inputCls} value={scope} onChange={e => { setScope(e.target.value as any); setTargetId(''); }}>
          <option value="product">Məhsul</option>
          <option value="category">Kateqoriya</option>
        </select>
        <select className={inputCls} value={targetId} onChange={e => setTargetId(e.target.value)}>
          <option value="">{scope === 'product' ? 'Məhsul seç' : 'Kateqoriya seç'}</option>
          {(scope === 'product' ? products : categories).map((x: any) => (
            <option key={x.id} value={x.id}>{x.name}</option>
          ))}
        </select>
        <select className={inputCls} value={mode} onChange={e => setMode(e.target.value as any)}>
          <option value="points_per_unit">Sabit xal / vahid</option>
          <option value="multiplier">Cəm × multiplier</option>
        </select>
        {mode === 'points_per_unit' ? (
          <input className={inputCls} type="number" min="0" value={pointsPerUnit} onChange={e => setPointsPerUnit(e.target.value)} placeholder="Xal / vahid" />
        ) : (
          <input className={inputCls} type="number" step="0.1" min="0" value={multiplier} onChange={e => setMultiplier(e.target.value)} placeholder="Multiplier" />
        )}
        <input className={inputCls} value={cap} onChange={e => setCap(e.target.value)} placeholder="Max xal (boş = yox)" />
        <input className={inputCls} value={label} onChange={e => setLabel(e.target.value)} placeholder="Etiket (ixtiyari)" />
        <button
          onClick={saveRule}
          disabled={busy || !targetId}
          className="col-span-2 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-sky-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-sky-400 active:scale-[0.98] transition-all disabled:opacity-40"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Star size={13} />}
          Qayda əlavə et
        </button>
      </div>
      <p className="text-[9px] text-white/25">
        Nümunə: Coca-Cola → “1 xal/vahid” = hər bot. Coca-Cola 1 xal gətirir. Kateqoriya qaydası
        o kateqoriyadakı bütün məhsullara tətbiq olunur (məhsul qaydası üstünlük təşkil edir).
      </p>
    </div>
  );
};

export default LoyaltyTab;
