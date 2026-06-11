'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Sparkles, BrainCircuit, FileScan, Repeat2, TrendingUp, Wand2,
  Upload, Search, ArrowRight, Activity, AlertTriangle, BarChart3,
} from 'lucide-react';
import { toast } from '@/lib/toast';

const cards = [
  {
    title: 'AI Recipe Builder',
    icon: Wand2,
    description: 'Generate ingredient proposals for new dishes with editable output before saving.',
    action: 'Generate recipe idea',
  },
  {
    title: 'OCR Invoice Import',
    icon: FileScan,
    description: 'Upload invoices to extract supplier, items, cost and quantities.',
    action: 'Scan invoice',
  },
  {
    title: 'Reverse Inventory Analysis',
    icon: Repeat2,
    description: 'Compare sales, recipes and real stock to find discrepancy suggestions.',
    action: 'Analyze stock gap',
  },
  {
    title: 'AI Inventory Insights',
    icon: BrainCircuit,
    description: 'Ask the assistant for shortages, anomalies and top actions to take now.',
    action: 'Open insight panel',
  },
  {
    title: 'AI Stock Forecasting',
    icon: TrendingUp,
    description: 'Project future consumption and replenishment needs from recent activity.',
    action: 'Forecast demand',
  },
];

export default function AiPage() {
  const [query, setQuery] = useState('Chicken Pizza');
  const [resultMode, setResultMode] = useState<'recipe' | 'invoice' | 'analysis' | 'forecast'>('recipe');

  const results = useMemo(() => {
    if (resultMode === 'invoice') {
      return [
        { name: 'Flour', qty: 25, unit: 'kg', cost: 42.5, supplier: 'Metro Supply' },
        { name: 'Mozzarella', qty: 8, unit: 'kg', cost: 96, supplier: 'Fresh Dairy' },
        { name: 'Tomato Sauce', qty: 12, unit: 'l', cost: 54, supplier: 'Kitchen Pro' },
      ];
    }
    if (resultMode === 'analysis') {
      return [
        'Cheese is consumed 18% faster than recipe baseline.',
        'Chicken stock likely under-recorded by 6.2 kg.',
        '2 ingredients are below replenishment threshold for 3 days.',
      ];
    }
    if (resultMode === 'forecast') {
      return [
        { label: 'Flour', days: 12, confidence: 0.91 },
        { label: 'Chicken', days: 4, confidence: 0.84 },
        { label: 'Cheese', days: 6, confidence: 0.88 },
      ];
    }
    return [
      { name: query, ingredient: 'Chicken breast', qty: '180g', note: 'primary protein' },
      { name: query, ingredient: 'Mozzarella', qty: '120g', note: 'bind + richness' },
      { name: query, ingredient: 'Tomato sauce', qty: '90g', note: 'base + acidity' },
      { name: query, ingredient: 'Pizza dough', qty: '1 pcs', note: 'serving vessel' },
    ];
  }, [query, resultMode]);

  return (
    <div className="min-h-screen bg-[#080808] text-white px-4 py-6 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-6 shadow-2xl">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[11px] font-bold uppercase tracking-[0.22em]">
                <Sparkles size={12} /> AI Operations Suite
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight">Inventory Intelligence</h1>
              <p className="mt-2 text-white/45 max-w-2xl">Build recipes, import invoices, inspect stock anomalies and forecast replenishment from one visible workspace.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Active insights', '12'],
                ['Pending scans', '3'],
                ['Forecast alerts', '5'],
                ['Recipe drafts', '8'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-white/30">{label}</p>
                  <p className="mt-1 text-2xl font-black">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-5">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                {[
                  ['recipe', 'AI Recipe Builder'],
                  ['invoice', 'OCR Invoice Import'],
                  ['analysis', 'Reverse Analysis'],
                  ['forecast', 'Forecasting'],
                ].map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => setResultMode(mode as typeof resultMode)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border ${resultMode === mode ? 'bg-[#D4AF37]/15 border-[#D4AF37]/30 text-[#D4AF37]' : 'bg-white/[0.03] border-white/[0.06] text-white/45 hover:text-white/70'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
                  <input value={query} onChange={e => setQuery(e.target.value)} className="w-full rounded-2xl border border-white/[0.08] bg-[#0f0f0f] pl-9 pr-4 py-3 text-sm outline-none focus:border-[#D4AF37]/35" placeholder="Enter product, supplier or inventory question" />
                </div>
                <button onClick={() => toast.success('AI action queued')} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#D4AF37] px-4 py-3 text-sm font-black text-black">
                  Run AI <ArrowRight size={14} />
                </button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {cards.map(card => {
                const Icon = card.icon;
                return (
                  <motion.button key={card.title} whileHover={{ y: -2 }} className="text-left rounded-3xl border border-white/[0.08] bg-white/[0.03] p-5 hover:border-[#D4AF37]/25 transition-all">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/20 text-[#D4AF37]">
                          <Icon size={18} />
                        </div>
                        <h3 className="mt-4 text-lg font-bold">{card.title}</h3>
                        <p className="mt-2 text-sm text-white/45 leading-6">{card.description}</p>
                      </div>
                      <span className="text-[10px] uppercase tracking-[0.22em] text-white/25">Open</span>
                    </div>
                    <div className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-white/70">
                      {card.action} <ArrowRight size={12} />
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-white/30"><Activity size={12} /> Live AI result</div>
              <div className="mt-4 space-y-3">
                {resultMode === 'recipe' && results.map((row: any) => (
                  <div key={row.ingredient} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <p className="font-bold">{row.ingredient}</p>
                    <p className="text-sm text-white/45">{row.qty} · {row.note}</p>
                  </div>
                ))}
                {resultMode === 'invoice' && results.map((row: any) => (
                  <div key={row.name} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <p className="font-bold">{row.name}</p>
                    <p className="text-sm text-white/45">{row.qty} {row.unit} · ₼{row.cost} · {row.supplier}</p>
                  </div>
                ))}
                {resultMode === 'analysis' && results.map((row: string) => (
                  <div key={row} className="flex items-start gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <AlertTriangle size={14} className="mt-0.5 text-amber-400" />
                    <p className="text-sm text-white/50">{row}</p>
                  </div>
                ))}
                {resultMode === 'forecast' && results.map((row: any) => (
                  <div key={row.label} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <div className="flex items-center justify-between">
                      <p className="font-bold">{row.label}</p>
                      <span className="text-xs text-emerald-400">{Math.round(row.confidence * 100)}%</span>
                    </div>
                    <p className="text-sm text-white/45">Estimated runway: {row.days} days</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-white/30"><Upload size={12} /> Attachments</div>
              <div className="mt-4 rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.02] p-6 text-center text-sm text-white/40">
                Drop invoice PDFs, images or spreadsheets here to open OCR invoice import.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
