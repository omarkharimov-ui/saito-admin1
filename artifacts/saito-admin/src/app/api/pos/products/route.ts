import { NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

export async function GET() {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const supabase = await createAuthClient();

    const [productsRes, categoriesRes, ingredientsRes, recipesRes, variantsRes, combosRes, campaignsRes, productModifiersRes, allergenLinksRes] = await Promise.all([
      supabase.from('products').select('*, category:category_id(name,name_az,name_en,name_ru)').order('created_at', { ascending: false }),
      supabase.from('categories').select('*').order('name', { ascending: true }),
      supabase.from('ingredients').select('id, name, current_stock, unit'),
      supabase.from('recipes').select('*'),
      supabase.from('product_variants').select('*'),
      supabase.from('combos').select('*, items:combo_items(*, product:products(*))').eq('is_active', true),
      supabase.from('campaigns').select('*, rules:campaign_rules(*), targets:campaign_targets(*)').eq('is_active', true).eq('deleted_at', null),
      supabase.from('product_modifiers').select('*').eq('is_available', true).order('created_at', { ascending: true }),
      // Allergenlərin SSOT mənbəyi: allergens + product_allergens junction
      supabase.from('product_allergens').select('product_id, allergen:allergens(code, name, translations)'),
    ]);

    const now = new Date().toISOString();
    const campaigns = (campaignsRes.data || []).map((c: any) => ({
      ...c,
      rule: c.rules?.[0],
      target: c.targets?.find((t: any) => t.target_type === 'product' || t.target_type === 'category'),
    }));

    const modifierRows = productModifiersRes.data || [];
    const modifiersByProduct: Record<string, any[]> = {};
    for (const m of modifierRows) {
      if (!m.product_id) continue;
      (modifiersByProduct[m.product_id] ||= []).push({
        id: m.id,
        name: m.name,
        price: Number(m.price) || 0,
        name_az: m.name_az,
        name_en: m.name_en,
        name_ru: m.name_ru,
      });
    }

    const allergensByProduct: Record<string, Array<{ code: string; name: string }>> = {};
    for (const link of (allergenLinksRes.data || []) as any[]) {
      if (!link.product_id) continue;
      const a = link.allergen;
      const entry = a?.code || a?.name ? { code: String(a.code || ''), name: String(a.name || '') } : null;
      if (!entry) continue;
      const arr = (allergensByProduct[link.product_id] ||= []);
      if (!arr.some(x => x.code === entry.code)) arr.push(entry);
    }

    const products = (productsRes.data || [])
      .map((p: any) => ({
        ...p,
        modifiers: modifiersByProduct[p.id] || [],
        allergens: allergensByProduct[p.id] || [],
        effective_price: computeEffectivePrice(p, campaigns, now),
      }));

    const combos = (combosRes.data || []).map((c: any) => ({
      ...c,
      effective_price: computeComboEffectivePrice(c, now),
    }));

    return NextResponse.json({
      products,
      categories: categoriesRes.data || [],
      ingredients: ingredientsRes.data || [],
      recipes: recipesRes.data || [],
      variants: variantsRes.data || [],
      combos,
      campaigns: campaignsRes.data || [],
    }, {
      headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate' },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

interface Campaign {
  id: string;
  name?: string;
  title?: string;
  status: string;
  type: string;
  priority: number | null;
  max_uses: number | null;
  current_uses: number | null;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  rule?: {
    rule_type: string;
    percentage?: number;
    fixed_amount?: number;
    buy_quantity?: number;
    pay_quantity?: number;
    free_quantity?: number;
    start_time?: string;
    end_time?: string;
    weekdays?: number[];
    is_recurring?: boolean;
  };
  target?: {
    target_type: string;
    target_id?: string;
  };
}

function computeEffectivePrice(product: any, campaigns: Campaign[], now: string): {
  base_price: number;
  effective_price: number;
  discount_amount: number;
  discount_type: string | null;
  campaign_id: string | null;
  campaign_label: string | null;
  campaign_badge: string | null;
} {
  const basePrice = Number(product.price) || 0;
  const nowDate = now.split('T')[0];
  const nowTime = now.split('T')[1]?.slice(0, 5) || '00:00';
  const dayOfWeek = new Date().getDay();

  const sorted = campaigns
    .filter(c => {
      if (c.status !== 'active') return false;
      if (c.max_uses && c.current_uses !== null && c.current_uses >= c.max_uses) return false;
      if (c.start_date && c.start_date > nowDate) return false;
      if (c.end_date && c.end_date < nowDate) return false;
      if (!c.rule) return false;

      if (c.rule.rule_type === 'happy_hour') {
        if (c.rule.start_time && c.rule.start_time > nowTime) return false;
        if (c.rule.end_time && c.rule.end_time < nowTime) return false;
        if (c.rule.weekdays && !c.rule.weekdays.includes(dayOfWeek)) return false;
      }

      if (c.target?.target_type === 'product' && c.target.target_id !== product.id) return false;
      if (c.target?.target_type === 'category' && c.target.target_id !== product.category_id) return false;
      if (!c.target) return false;

      return true;
    })
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));

  const best = sorted[0];
  if (!best || !best.rule) {
    return {
      base_price: basePrice,
      effective_price: basePrice,
      discount_amount: 0,
      discount_type: null,
      campaign_id: null,
      campaign_label: null,
      campaign_badge: null,
    };
  }

  let discount = 0;
  const rule = best.rule;

  if (rule.rule_type === 'percentage') {
    discount = Math.round(basePrice * (rule.percentage || 0) / 100 * 100) / 100;
  } else if (rule.rule_type === 'fixed_amount') {
    discount = Math.min(rule.fixed_amount || 0, basePrice);
  } else if (rule.rule_type === 'happy_hour') {
    discount = Math.round(basePrice * (rule.percentage || 0) / 100 * 100) / 100;
  } else if (rule.rule_type === 'buy_x_pay_y' || rule.rule_type === 'buy_x_get_y') {
    const buy = rule.buy_quantity || 2;
    const pay = rule.pay_quantity || 1;
    const free = rule.free_quantity || 1;
    const freePerGroup = rule.rule_type === 'buy_x_pay_y' ? (buy - pay) : free;
    discount = Math.round(basePrice * (freePerGroup / buy) * 100) / 100;
  }

  const campaignLabel = best.name || best.title || rule.rule_type;

  return {
    base_price: basePrice,
    effective_price: Math.max(0, basePrice - discount),
    discount_amount: discount,
    discount_type: rule.rule_type,
    campaign_id: best.id,
    campaign_label: campaignLabel,
    campaign_badge: null,
  };
}

function computeComboEffectivePrice(combo: any, now: string): number {
  const items = combo.items || [];
  let originalTotal = 0;
  for (const item of items) {
    const product = item.product;
    if (product) {
      originalTotal += (Number(product.price) || 0) * (item.quantity || 1);
    }
  }
  const comboPrice = Number(combo.price) || 0;
  return comboPrice < originalTotal ? comboPrice : originalTotal;
}
