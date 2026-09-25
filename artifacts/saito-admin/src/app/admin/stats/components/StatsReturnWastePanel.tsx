'use client';

// 2026-09-25 (owner): "loglamada səbəb məcburi şəkildə DB-də saxlanılsın,
// çünki bu bizim statistics səhifəsində lazım olacaq" — this panel renders
// the mandatory return/waste REASON codes logged by the POS return flow
// (audit_logs_canonical: return_to_stock / item_waste).
import { RotateCcw, XCircle, ArchiveRestore } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useLanguage } from '@/lib/i18n';

export interface ReturnWasteEntry {
  reason: string;
  fate: 'stock' | 'waste';
  count: number;
  qty: number;
  products: string[];
  notes: string[];
}

interface Props {
  stats: ReturnWasteEntry[];
  totals: { count: number; qty: number; stock: number; waste: number } | null;
}

// Canonical reason codes (match the POS return view chips + record_item_waste
// enum). Labels are inline az/en/ru — same pattern as the POS reason chips.
const REASON_LABELS: Record<string, { az: string; en: string; ru: string }> = {
  customer_return: { az: 'Müştəri qaytarır', en: 'Customer return', ru: 'Возврат клиентом' },
  kitchen_error: { az: 'Mətbəx xətası', en: 'Kitchen error', ru: 'Ошибка кухни' },
  wrong_item: { az: 'Yanlış məhsul', en: 'Wrong item', ru: 'Неверное блюдо' },
  burned: { az: 'Yanmış', en: 'Burned', ru: 'Сгорело' },
  spilled: { az: 'Dökülüb', en: 'Spilled', ru: 'Разлито' },
  expired: { az: 'Sürəti keçib', en: 'Expired', ru: 'Протухло' },
  spoilage: { az: 'Bozulub', en: 'Spoiled', ru: 'Испортилось' },
  other: { az: 'Digər', en: 'Other', ru: 'Другое' },
  unknown: { az: 'Naməlum', en: 'Unknown', ru: 'Неизвестно' },
};

const PALETTE = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#eab308', '#71717a'];

export default function StatsReturnWastePanel({ stats, totals }: Props) {
  const { t, language } = useLanguage();

  if (!totals || totals.count === 0 || stats.length === 0) return null;

  const label = (code: string) => REASON_LABELS[code]?.[language as 'az' | 'en' | 'ru'] || REASON_LABELS[code]?.az || code;

  const pieData = stats.map((s, i) => ({
    key: s.reason,
    name: label(s.reason),
    value: s.qty,
    color: PALETTE[i % PALETTE.length],
  }));

  return (
    <div className="bg-card border border-white/5 p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl">
          <RotateCcw size={20} />
        </div>
        <h3 className="text-xl font-serif font-bold text-white">{t('stats_return_waste_title') || 'Geri qaytar & İtki (səbəb üzrə)'}</h3>
        <span className="text-[10px] text-white/30 uppercase tracking-widest ml-auto">
          {totals.count} {t('stats_return_event') || 'hadisə'} · {totals.qty} {t('stats_portion') || 'porsiyon'}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
        {/* Donut: portions by reason */}
        <div className="h-[280px] relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={58} outerRadius={95} paddingAngle={4} dataKey="value">
                {pieData.map((entry, index) => (
                  <Cell key={`rw-${index}`} fill={entry.color} stroke="transparent" />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#0d0d0d', border: '1px solid #ffffff20', borderRadius: '8px', fontSize: '12px' }}
                labelStyle={{ color: '#ffffff60' }}
                formatter={(value: any, name: any) => [`${value || 0} ${t('stats_portion') || 'porsiyon'}`, name]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-black text-white">{totals.qty}</span>
            <span className="text-[9px] uppercase tracking-widest text-white/30">{t('stats_portion') || 'porsiyon'}</span>
          </div>
        </div>

        {/* Reason list */}
        <div className="space-y-2">
          {stats.map((s, i) => (
            <div key={s.reason} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/5">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white truncate">{label(s.reason)}</span>
                  <span
                    className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
                      s.fate === 'stock' ? 'bg-blue-500/10 text-blue-400' : 'bg-red-500/10 text-red-400'
                    }`}
                    title={s.fate === 'stock' ? (t('stats_to_stock') || 'Anbara qaytarıldı') : (t('stats_to_waste') || 'İtkiyə yazıldı')}
                  >
                    {s.fate === 'stock' ? <ArchiveRestore size={9} /> : <XCircle size={9} />}
                    {s.fate === 'stock' ? (t('stats_to_stock') || 'Anbar') : (t('stats_to_waste') || 'İtki')}
                  </span>
                </div>
                {(s.products.length > 0 || s.notes.length > 0) && (
                  <p className="text-[10px] text-white/35 truncate mt-0.5">
                    {[s.products.slice(0, 3).join(', '), s.notes[0] ? `“${s.notes[0]}”` : ''].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <span className="text-base font-black text-white tabular-nums">{s.qty}</span>
                <span className="text-[9px] text-white/30 uppercase ml-1">porsiyon</span>
                <p className="text-[10px] text-white/30 tabular-nums">{s.count} {t('stats_return_event') || 'hadisə'}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Fate summary strip */}
      <div className="mt-6 flex items-center gap-4 text-[11px] font-bold uppercase tracking-wider">
        <span className="flex items-center gap-1.5 text-blue-400">
          <ArchiveRestore size={12} /> {totals.stock} {t('stats_to_stock') || 'anbara qaytarıldı'}
        </span>
        <span className="flex items-center gap-1.5 text-red-400">
          <XCircle size={12} /> {totals.waste} {t('stats_to_waste') || 'itkiyə yazıldı'}
        </span>
      </div>
    </div>
  );
}
