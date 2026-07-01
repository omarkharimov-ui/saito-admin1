import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const [productsRes, categoriesRes, ingredientsRes, recipesRes, variantsRes, combosRes, campaignsRes] = await Promise.all([
      supabase.from('products').select('*, category:category_id(name,name_az,name_en,name_ru)').order('created_at', { ascending: false }),
      supabase.from('categories').select('*').order('name', { ascending: true }),
      supabase.from('ingredients').select('id, name, current_stock, unit'),
      supabase.from('recipes').select('*'),
      supabase.from('product_variants').select('*'),
      supabase.from('combos').select('*, items:combo_items(*, product:products(*))').eq('is_active', true),
      supabase.from('campaigns').select('*').eq('status', 'active'),
    ]);

    // Compute effective prices server-side
    const now = new Date().toISOString();
    const products = (productsRes.data || []).map((p: any) => ({
      ...p,
      effective_price: computeEffectivePrice(p, (campaignsRes.data || []), now),
    }));

    // Compute combo pricings server-side
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
      headers: { 'Cache-Control': 'no-store, must-revalidate' },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

interface Campaign {
  id: string;
  status: string;
  discount_type: string | null;
  discount_value: number | null;
  target_type: string | null;
  target_id: string | null;
  start_time: string | null;
  end_time: string | null;
  start_date: string | null;
  end_date: string | null;
  priority: number | null;
  max_discount_amount: number | null;
  max_uses: number | null;
  current_uses: number | null;
  label: string | null;
  badge_color: string | null;
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

  const sorted = [...campaigns]
    .filter(c => {
      if (c.status !== 'active') return false;
      if (c.max_uses && c.current_uses !== null && c.current_uses >= c.max_uses) return false;
      if (c.start_date && c.start_date > nowDate) return false;
      if (c.end_date && c.end_date < nowDate) return false;
      if (c.start_time && c.start_time > nowTime) return false;
      if (c.end_time && c.end_time < nowTime) return false;
      if (c.target_type === 'product' && c.target_id !== product.id) return false;
      if (c.target_type === 'category' && c.target_id !== (product.category_id || '')) return false;
      return true;
    })
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));

  const best = sorted[0];
  if (!best) {
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
  if (best.discount_type === 'percentage') {
    discount = Math.round(basePrice * (best.discount_value || 0) / 100 * 100) / 100;
  } else if (best.discount_type === 'fixed') {
    discount = Math.min(best.discount_value || 0, basePrice);
  }
  if (best.max_discount_amount && discount > best.max_discount_amount) {
    discount = best.max_discount_amount;
  }

  return {
    base_price: basePrice,
    effective_price: Math.max(0, basePrice - discount),
    discount_amount: discount,
    discount_type: best.discount_type,
    campaign_id: best.id,
    campaign_label: best.label || null,
    campaign_badge: best.badge_color || null,
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
