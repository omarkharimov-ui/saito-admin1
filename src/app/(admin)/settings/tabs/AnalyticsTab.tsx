'use client';

import React, { useState, useEffect } from 'react';
import { useFormDirtyCompare } from '@/hooks/useFormDirty';
import { supabase } from '@/lib/supabase';
import { Save, Loader2, BrainCircuit, Store, Cloud, Bot, Sunrise, TrendingUp, Eye, Wand2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import GoldSelect from '@/components/GoldSelect';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { labelCls, saveButtonCls } from './_shared';
import { useAiFlags } from '@/hooks/useAiFlags';
import { LiquidToggle } from '../../components/ui/MotionControls';

const AnalyticsTab = ({ initialData }: { initialData?: Record<string, any> | null }) => {
  const { t } = useLanguage();
  const { flags: aiFlags, setFlag: setAiFlag } = useAiFlags();
  const [loading, setLoading] = useState(false); // Instant load
  const [saving, setSaving] = useState(false);
  const [greetingEnabled, setGreetingEnabled] = useState<boolean>(() => {
    try { const m = localStorage.getItem('saito_settings_meta'); if (m) { const p = JSON.parse(m); if (p.greetingEnabled !== undefined) return p.greetingEnabled; } } catch {}
    return true;
  });
  const [translating, setTranslating] = useState(false);
  const [translateResult, setTranslateResult] = useState<{ translated: number; skipped: number; total: number; categoriesTranslated: number; categoriesTotal: number; combosTranslated: number; combosTotal: number; variantsTranslated: number; variantsTotal: number; modifiersTranslated: number; modifiersTotal: number } | null>(null);
  const [cfg, setCfg] = useState({ city: 'Baku', revenue_limit: 10000 });

  const { isDirty } = useFormDirtyCompare(cfg, [!loading]);

  useEffect(() => {
    if (initialData) {
      setCfg({
        city: initialData.city || 'Baku',
        revenue_limit: initialData.revenue_limit ?? 10000,
      });
      setLoading(false);
      return;
    }
    supabase.from('settings').select('city, revenue_limit').single().then(({ data }) => {
      if (data) setCfg({
        city: data.city || 'Baku',
        revenue_limit: data.revenue_limit ?? 10000,
      });
      setLoading(false);
    });
  }, [initialData]);

  const handleTranslateAll = async (force = false) => {
    setTranslating(true);
    setTranslateResult(null);
    try {
      const [{ data: products, error: pErr }, { data: cats, error: cErr }] = await Promise.all([
        supabase.from('products').select('id, name, description, ingredients, name_az, name_en, name_ru, description_az, description_en, description_ru, ingredients_az, ingredients_en, ingredients_ru'),
        supabase.from('categories').select('id, name, name_az, name_en, name_ru'),
      ]);
      if (pErr) throw new Error(pErr.message);
      if (cErr) throw new Error(cErr.message);

      // ── Products ──
      const toTranslateProds = (products ?? []).filter(p =>
        force || !(p as any).name_az || !(p as any).name_en || !(p as any).name_ru
      );

      let translatedProducts = (products ?? []).length - toTranslateProds.length;
      const skippedProducts = (products ?? []).length - toTranslateProds.length;

      if (toTranslateProds.length > 0) {
        const CHUNK = 10;
        const CONCURRENCY = 3;
        const chunks: typeof toTranslateProds[] = [];
        for (let i = 0; i < toTranslateProds.length; i += CHUNK) chunks.push(toTranslateProds.slice(i, i + CHUNK));

        const processChunk = async (chunk: typeof toTranslateProds) => {
          const variants = chunk.map(p => {
            const rawName = typeof p.name === 'string' ? p.name : (p.name as Record<string,string>)?.az || '';
            const rawDesc = typeof p.description === 'string' ? p.description : (p as any).description_az || '';
            const rawIngr = Array.isArray(p.ingredients) && p.ingredients.length > 0
              ? p.ingredients.map((i: unknown) => typeof i === 'string' ? i : (i as Record<string,string>)?.az || '').filter(Boolean).join(', ')
              : ((p as any).ingredients_az || '');
            return {
              key: p.id,
              name: rawName,
              description: rawDesc,
              ingredients: rawIngr,
            };
          }).filter(v => v.name);

          let batchResult: Record<string, Record<string, { name?: string; description?: string; ingredients?: string }>> = {};
          let attempt = 0;
          let success = false;
          while (attempt < 3 && !success) {
            attempt++;
            try {
              const res = await fetch('/api/translate-text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ variants, languages: ['English', 'Russian'] }),
              });
              if (res.ok) {
                const data = await res.json();
                batchResult = data.result || {};
                success = true;
              }
            } catch { /* retry */ }
          }

          for (const p of chunk) {
            const tr = batchResult[p.id];
            const rawName = typeof p.name === 'string' ? p.name : (p.name as Record<string,string>)?.az || '';
            const rawDesc = typeof p.description === 'string' ? p.description : (p as any).description_az || '';
            const rawIngr = Array.isArray(p.ingredients) && p.ingredients.length > 0
              ? p.ingredients.map((i: unknown) => typeof i === 'string' ? i : (i as Record<string,string>)?.az || '').filter(Boolean).join(', ')
              : ((p as any).ingredients_az || '');
            const flatCols: Record<string, string> = {};
            if (!(p as any).name_az || force) flatCols.name_az = rawName;
            if (!(p as any).description_az || force) flatCols.description_az = tr?.az?.description || rawDesc;
            if (!(p as any).ingredients_az || force) flatCols.ingredients_az = tr?.az?.ingredients || rawIngr;
            if (tr?.en?.name) { flatCols.name_en = tr.en.name; flatCols.description_en = tr.en.description || rawDesc; flatCols.ingredients_en = tr.en.ingredients || rawIngr; }
            if (tr?.ru?.name) { flatCols.name_ru = tr.ru.name; flatCols.description_ru = tr.ru.description || rawDesc; flatCols.ingredients_ru = tr.ru.ingredients || rawIngr; }
            // Fallback after 3 failed attempts
            if (!flatCols.name_en) flatCols.name_en = rawName;
            if (!flatCols.name_ru) flatCols.name_ru = rawName;
            if (!flatCols.description_en) flatCols.description_en = rawDesc;
            if (!flatCols.description_ru) flatCols.description_ru = rawDesc;
            if (!flatCols.ingredients_en) flatCols.ingredients_en = rawIngr;
            if (!flatCols.ingredients_ru) flatCols.ingredients_ru = rawIngr;
            if (Object.keys(flatCols).length > 0) {
              await supabase.from('products').update(flatCols).eq('id', p.id);
              translatedProducts++;
            }
          }
        };

        // Process chunks with limited concurrency (max 3 parallel requests)
        for (let i = 0; i < chunks.length; i += CONCURRENCY) {
          await Promise.all(chunks.slice(i, i + CONCURRENCY).map(processChunk));
        }
      }

      // ── Categories ──
      const toTranslateCats = (cats ?? []).filter(c => {
        const rawName = typeof c.name === 'string' ? c.name : '';
        return rawName.trim() && (force || !(c as any).name_az || !(c as any).name_en || !(c as any).name_ru);
      });

      let translatedCategories = 0;

      if (toTranslateCats.length > 0) {
        const catVariants = toTranslateCats.map(c => ({
          key: c.id,
          name: typeof c.name === 'string' ? c.name : '',
        })).filter(v => v.name);

        let catBatch: Record<string, Record<string, { name?: string }>> = {};
        let catAttempt = 0;
        let catSuccess = false;
        while (catAttempt < 3 && !catSuccess) {
          catAttempt++;
          try {
            const catRes = await fetch('/api/translate-text', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ variants: catVariants, languages: ['English', 'Russian'] }),
            });
            if (catRes.ok) {
              const catData = await catRes.json();
              catBatch = catData.result || {};
              catSuccess = true;
            }
          } catch { /* retry */ }
        }

        await Promise.all(toTranslateCats.map(async c => {
          const tr = catBatch[c.id];
          const rawCatName = typeof c.name === 'string' ? c.name : '';
          const catFlatCols: Record<string, string> = {};
          if (!(c as any).name_az || force) catFlatCols.name_az = tr?.az?.name || rawCatName;
          if (tr?.en?.name) catFlatCols.name_en = tr.en.name;
          if (tr?.ru?.name) catFlatCols.name_ru = tr.ru.name;
          // Fallback after 3 failed attempts
          if (!catFlatCols.name_en) catFlatCols.name_en = rawCatName;
          if (!catFlatCols.name_ru) catFlatCols.name_ru = rawCatName;
          if (Object.keys(catFlatCols).length > 0) {
            await supabase.from('categories').update(catFlatCols).eq('id', c.id);
            translatedCategories++;
          }
        }));
      }

      // ── Combos ──
      const { data: combos, error: comboErr } = await supabase
        .from('combos').select('id, name, description, name_az, name_en, name_ru, description_az, description_en, description_ru');
      if (comboErr) throw new Error(comboErr.message);
      const toTranslateCombos = (combos ?? []).filter(c =>
        force || !(c as any).name_az || !(c as any).name_en || !(c as any).name_ru
      );
      let translatedCombos = (combos ?? []).length - toTranslateCombos.length;
      if (toTranslateCombos.length > 0) {
        const comboVariants = toTranslateCombos.map(c => ({
          key: c.id,
          name: typeof c.name === 'string' ? c.name : '',
          description: typeof c.description === 'string' ? c.description : '',
        })).filter(v => v.name);
        let comboBatch: Record<string, Record<string, { name?: string; description?: string }>> = {};
        let comboAttempt = 0;
        let comboSuccess = false;
        while (comboAttempt < 3 && !comboSuccess) {
          comboAttempt++;
          try {
            const comboRes = await fetch('/api/translate-text', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ variants: comboVariants, languages: ['English', 'Russian'] }),
            });
            if (comboRes.ok) {
              const comboData = await comboRes.json();
              comboBatch = comboData.result || {};
              comboSuccess = true;
            }
          } catch { /* retry */ }
        }
        await Promise.all(toTranslateCombos.map(async c => {
          const tr = comboBatch[c.id];
          const rawName = typeof c.name === 'string' ? c.name : '';
          const rawDesc = typeof c.description === 'string' ? c.description : '';
          const comboFlat: Record<string, string> = {};
          if (!(c as any).name_az || force) comboFlat.name_az = tr?.az?.name || rawName;
          if (tr?.en?.name) comboFlat.name_en = tr.en.name;
          if (tr?.ru?.name) comboFlat.name_ru = tr.ru.name;
          if (tr?.en?.description) comboFlat.description_en = tr.en.description;
          if (tr?.ru?.description) comboFlat.description_ru = tr.ru.description;
          if (!comboFlat.name_en) comboFlat.name_en = rawName;
          if (!comboFlat.name_ru) comboFlat.name_ru = rawName;
          if (!comboFlat.description_en) comboFlat.description_en = rawDesc;
          if (!comboFlat.description_ru) comboFlat.description_ru = rawDesc;
          if (Object.keys(comboFlat).length > 0) {
            await supabase.from('combos').update(comboFlat).eq('id', c.id);
            translatedCombos++;
          }
        }));
      }

      // ── Product Variants (size) ──
      const { data: variants, error: varErr } = await supabase
        .from('product_variants').select('id, name, name_az, name_en, name_ru, product_id');
      if (varErr) throw new Error(varErr.message);
      const toTranslateVars = (variants ?? []).filter(v =>
        force || !(v as any).name_az || !(v as any).name_en || !(v as any).name_ru
      );
      let translatedVariants = (variants ?? []).length - toTranslateVars.length;
      if (toTranslateVars.length > 0) {
        const varChunks: typeof toTranslateVars[] = [];
        for (let i = 0; i < toTranslateVars.length; i += 15) varChunks.push(toTranslateVars.slice(i, i + 15));
        for (const vChunk of varChunks) {
          const varVariants = vChunk.map(v => ({ key: v.id, name: v.name })).filter(v => v.name);
          let varBatch: Record<string, Record<string, { name?: string }>> = {};
          let varAttempt = 0;
          let varSuccess = false;
          while (varAttempt < 3 && !varSuccess) {
            varAttempt++;
            try {
              const varRes = await fetch('/api/translate-text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ variants: varVariants, languages: ['English', 'Russian'] }),
              });
              if (varRes.ok) {
                const varData = await varRes.json();
                varBatch = varData.result || {};
                varSuccess = true;
              }
            } catch { /* retry */ }
          }
          await Promise.all(vChunk.map(async v => {
            const tr = varBatch[v.id];
            const rawName = v.name;
            await supabase.from('product_variants').update({
              name_az: tr?.az?.name || rawName,
              name_en: tr?.en?.name || rawName,
              name_ru: tr?.ru?.name || rawName,
            }).eq('id', v.id);
            translatedVariants++;
          }));
        }
      }

      // ── Product Modifiers ──
      const { data: modifiers, error: modErr } = await supabase
        .from('product_modifiers').select('id, name, name_az, name_en, name_ru, product_id');
      if (modErr) throw new Error(modErr.message);
      const toTranslateMods = (modifiers ?? []).filter(m =>
        force || !(m as any).name_az || !(m as any).name_en || !(m as any).name_ru
      );
      let translatedModifiers = (modifiers ?? []).length - toTranslateMods.length;
      if (toTranslateMods.length > 0) {
        const modChunks: typeof toTranslateMods[] = [];
        for (let i = 0; i < toTranslateMods.length; i += 20) modChunks.push(toTranslateMods.slice(i, i + 20));
        for (const mChunk of modChunks) {
          const modVariants = mChunk.map(m => ({ key: m.id, name: m.name })).filter(v => v.name);
          let modBatch: Record<string, Record<string, { name?: string }>> = {};
          let modAttempt = 0;
          let modSuccess = false;
          while (modAttempt < 3 && !modSuccess) {
            modAttempt++;
            try {
              const modRes = await fetch('/api/translate-text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ variants: modVariants, languages: ['English', 'Russian'] }),
              });
              if (modRes.ok) {
                const modData = await modRes.json();
                modBatch = modData.result || {};
                modSuccess = true;
              }
            } catch { /* retry */ }
          }
          await Promise.all(mChunk.map(async m => {
            const tr = modBatch[m.id];
            const rawName = m.name;
            await supabase.from('product_modifiers').update({
              name_az: tr?.az?.name || rawName,
              name_en: tr?.en?.name || rawName,
              name_ru: tr?.ru?.name || rawName,
            }).eq('id', m.id);
            translatedModifiers++;
          }));
        }
      }

      void skippedProducts;
      setTranslateResult({ translated: translatedProducts, skipped: skippedProducts, total: (products ?? []).length, categoriesTranslated: translatedCategories, categoriesTotal: (cats ?? []).length, combosTranslated: translatedCombos, combosTotal: (combos ?? []).length, variantsTranslated: translatedVariants, variantsTotal: (variants ?? []).length, modifiersTranslated: translatedModifiers, modifiersTotal: (modifiers ?? []).length });
      toast.success(`${translatedProducts} məhsul, ${translatedCategories} kateqoriya, ${translatedCombos} kombo, ${translatedVariants} variant, ${translatedModifiers} modifier tərcümə edildi`, { id: 'action-toast', duration: 4000 });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Naməlum xəta';
      toast.error('Xəta: ' + msg, { id: 'action-toast' });
    } finally {
      setTranslating(false);
    }
  };

  const toggleGreeting = async (next: boolean) => {
    setGreetingEnabled(next);
    await supabase.from('settings').upsert([{ id: '1', morning_greeting_enabled: next }]);
    try { const m = localStorage.getItem('saito_settings_meta'); const p = m ? JSON.parse(m) : {}; localStorage.setItem('saito_settings_meta', JSON.stringify({ ...p, greetingEnabled: next })); } catch {}
    toast.success(next ? t('gen_morning_greeting') + ' aktiv edildi' : t('gen_morning_greeting') + ' deaktiv edildi', { id: 'action-toast' });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from('settings').upsert([{ id: '1', ...cfg }]);
    if (error) {
      toast.error(error.message, { id: 'action-toast' });
    } else {
      toast.success(t('analytics_saved'), { id: 'action-toast', duration: 3000 });
    }
    setSaving(false);
  };

  // Loading spinner removed - instant render

  return (
    <form noValidate onSubmit={save} className="space-y-10 max-w-2xl">

      {/* ── UI Köməkçiləri ── */}
      <div className="space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--theme-text-muted)]">UI Köməkçiləri</p>

        <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
          <div className="flex items-center gap-3">
            <Sunrise size={15} className="text-gold/70" />
            <div>
              <p className="text-sm font-semibold text-white">{t('gen_morning_greeting')}</p>
              <p className="text-[11px] text-[var(--theme-text-secondary)] mt-0.5">
                {greetingEnabled ? t('gen_greeting_active') : t('gen_greeting_inactive')}
              </p>
            </div>
          </div>
          <LiquidToggle checked={greetingEnabled} onChange={(next) => { void toggleGreeting(next); }} />
        </div>
      </div>

      {/* ── AI Funksiyaları ── */}
      <div className="space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--theme-text-muted)]">{t('ai_features_section')}</p>

        <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
          <div className="flex items-center gap-3">
            <Eye size={15} className="text-gold/70" />
            <div>
              <p className="text-sm font-semibold text-[var(--theme-text)]">{t('ai_vision_label')}</p>
              <p className="text-[11px] text-[var(--theme-text-secondary)] mt-0.5">
                {aiFlags.visionEnabled ? t('ai_vision_desc_on') : t('ai_vision_desc_off')}
              </p>
            </div>
          </div>
          <LiquidToggle checked={aiFlags.visionEnabled} onChange={(next) => { setAiFlag('visionEnabled', next); toast.success(next ? t('ai_vision_label') + ' aktiv edildi' : t('ai_vision_label') + ' deaktiv edildi', { id: 'action-toast' }); }} />
        </div>

        <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
          <div className="flex items-center gap-3">
            <Wand2 size={15} className="text-gold/70" />
            <div>
              <p className="text-sm font-semibold text-[var(--theme-text)]">{t('ai_autocorrect_label')}</p>
              <p className="text-[11px] text-white/45 mt-0.5">
                {aiFlags.autoCorrectEnabled ? t('ai_autocorrect_desc_on') : t('ai_autocorrect_desc_off')}
              </p>
            </div>
          </div>
          <LiquidToggle checked={aiFlags.autoCorrectEnabled} onChange={(next) => { setAiFlag('autoCorrectEnabled', next); toast.success(next ? t('ai_autocorrect_label') + ' aktiv edildi' : t('ai_autocorrect_label') + ' deaktiv edildi', { id: 'action-toast' }); }} />
        </div>
      </div>

      {/* ── Analitika Konfiqurasiyası ── */}
      <div className="space-y-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--theme-text-muted)]">{t('tab_analytics')}</p>

        <div>
          <label className={labelCls}><Cloud size={11} /> {t('analytics_city_label')}</label>
          <div className="max-w-xs">
            <GoldSelect
              options={[
                'Baku', 'Ganja', 'Sumqayit', 'Lankaran', 'Mingachevir', 'Nakhchivan',
                'Shaki', 'Shirvan', 'Shusha', 'Yevlakh', 'Khankendi', 'Imishli',
                'Agdash', 'Agjabadi', 'Agsu', 'Astara', 'Balakan', 'Barda',
                'Beylagan', 'Bilasuvar', 'Dashkasan', 'Fuzuli', 'Gadabay',
                'Gobustan', 'Goychay', 'Goygol', 'Hajigabul', 'Jalilabad',
                'Kalbajar', 'Khachmaz', 'Khizi', 'Kurdamir', 'Lachin', 'Lerik',
                'Masally', 'Neftchala', 'Oguz', 'Qabala', 'Qakh', 'Qazakh',
                'Quba', 'Qubadli', 'Qusar', 'Saatly', 'Sabirabad', 'Shabran',
                'Shahbuz', 'Shamakhi', 'Shamkir', 'Sharur', 'Siyazan', 'Tartar',
                'Tovuz', 'Ujar', 'Yardimly', 'Zaqatala', 'Zardab',
              ].map(c => ({ value: c, label: c }))}
              value={cfg.city || 'Baku'}
              onChange={v => setCfg({ ...cfg, city: v })}
              placeholder={t('analytics_city_placeholder')}
            />
            <p className="text-[10px] text-[var(--theme-text-muted)] mt-1.5">{t('analytics_city_hint')}</p>
          </div>
        </div>

        <div>
          <label className={labelCls}><TrendingUp size={11} /> {t('analytics_revenue_limit_label')}</label>
          <div className="relative max-w-xs">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gold/60 text-sm font-bold pointer-events-none">₼</span>
            <input
              type="number" min={0} step={100}
              value={cfg.revenue_limit}
              onChange={e => setCfg({ ...cfg, revenue_limit: Number(e.target.value) })}
              className="w-full bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] focus:border-[var(--theme-border-strong)] rounded-xl pl-8 pr-4 py-3 text-[var(--theme-text)] text-sm outline-none transition-all"
            />
          </div>
          <p className="text-[10px] text-[var(--theme-text-muted)] mt-1.5">{t('analytics_revenue_limit_hint')}</p>
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={saving || !isDirty}
          className={`${saveButtonCls} ${!isDirty && !saving ? 'opacity-40 pointer-events-none' : ''}`} style={{ background: 'var(--theme-surface)', color: 'var(--theme-text)', border: '1px solid var(--theme-border)' }}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {t('analytics_save')}
        </button>
      </div>

      {/* ── Translation section ── */}
      <div className="border-t border-[var(--theme-border)] pt-8 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gold/10 border border-gold/20 flex items-center justify-center flex-shrink-0">
            <Store size={14} className="text-gold" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--theme-text)]">{t('analytics_translations_title')}</p>
            <p className="text-[11px] text-[var(--theme-text-secondary)] mt-0.5">{t('analytics_translations_desc')}</p>
          </div>
        </div>
        {translateResult && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-4 px-4 py-3 rounded-xl bg-gold/[0.06] border border-gold/15 text-[12px]">
              <span className="text-[var(--theme-text-muted)] font-bold uppercase tracking-wider text-[10px]">{t('analytics_col_products')}</span>
              <span className="text-[var(--theme-text-secondary)]">{t('analytics_col_total')} <span className="text-[var(--theme-text)] font-bold">{translateResult.total}</span></span>
              <span className="text-emerald-400/80">{t('analytics_col_translated')} <span className="text-emerald-400 font-bold">{translateResult.translated}</span></span>
            </div>
            <div className="flex flex-wrap items-center gap-4 px-4 py-3 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] text-[12px]">
              <span className="text-[var(--theme-text-muted)] font-bold uppercase tracking-wider text-[10px]">{t('analytics_col_categories')}</span>
              <span className="text-[var(--theme-text-secondary)]">{t('analytics_col_total')} <span className="text-[var(--theme-text)] font-bold">{translateResult.categoriesTotal}</span></span>
              <span className="text-emerald-400/80">{t('analytics_col_translated')} <span className="text-emerald-400 font-bold">{translateResult.categoriesTranslated}</span></span>
            </div>
          </div>
        )}
        <button type="button" onClick={() => handleTranslateAll(true)} disabled={translating}
          className="flex items-center gap-2.5 px-5 py-2.5 rounded-2xl bg-[var(--theme-surface)] border border-[var(--theme-border)] text-[var(--theme-text)] text-[12px] font-bold tracking-wider uppercase transition-all disabled:opacity-40 shadow-[0_8px_24px_rgba(0,0,0,0.03)]">
          {translating ? <Loader2 size={14} className="animate-spin" /> : <BrainCircuit size={14} />}
          {translating ? t('analytics_translating') : t('analytics_translate_btn')}
        </button>
      </div>
    </form>
  );
};

export default AnalyticsTab;
