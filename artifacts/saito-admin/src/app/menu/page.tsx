import { Suspense } from 'react';
import { supabase } from '@/lib/supabase';

interface MenuPageProps {
  searchParams: Promise<{ table?: string }>;
}

export default async function MenuPage({ searchParams }: MenuPageProps) {
  const params = await searchParams;
  const tableNumber = params.table;

  const { data: products, error } = await supabase
    .from('products')
    .select('id, name_az, name_en, name_ru, price, image_url, category:category_id(name_az, name_en, name_ru)')
    .eq('is_available', true)
    .eq('is_in_stock', true)
    .order('name_az', { ascending: true });

  if (error || !products || products.length === 0) {
    return <div className="p-8 text-center text-gray-500">Menyu hazır deyil</div>;
  }

  const grouped = products.reduce((acc: any, p: any) => {
    const catName = p.category?.name_az || p.category?.name_en || p.category?.name_ru || 'Digər';
    if (!acc[catName]) acc[catName] = [];
    acc[catName].push(p);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex items-center gap-3">
          <span className="text-2xl">ℹ️</span>
          <div>
            <p className="text-sm font-semibold text-amber-900">Sifariş üçün ofisiantı çağırın</p>
            <p className="text-xs text-amber-700">QR menyu yalnız göstərmə üçündür. Sifariş vermək üçün ofisiant ilə əlaqə saxlayın.</p>
          </div>
        </div>
        <h1 className="text-3xl font-bold text-center mb-2">Menyu</h1>
        {tableNumber && <p className="text-center text-gray-500 mb-6">Masa {tableNumber}</p>}
        {Object.entries(grouped).map(([cat, items]: any) => (
          <div key={cat} className="mb-8">
            <h2 className="text-xl font-semibold mb-4 pb-2 border-b">{cat}</h2>
            <div className="grid gap-4">
              {items.map((product: any) => (
                <div key={product.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-4">
                  {product.image_url && (
                    <img src={product.image_url} alt="" className="w-16 h-16 rounded-xl object-cover" />
                  )}
                  <div className="flex-1">
                    <h3 className="font-semibold">{product.name_az || product.name_en || product.name_ru}</h3>
                    <p className="text-gold font-bold">₼{Number(product.price).toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
