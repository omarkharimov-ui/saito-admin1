'use client';

import { useState, useEffect } from 'react';
import { getSettings, updateSettings } from '@/lib/settings-client';
import { Loader2, Star, Save } from 'lucide-react';
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

export default LoyaltyTab;
