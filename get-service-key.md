# Supabase Service Role Key əldə etmə

1. Supabase Dashboard-a girin: https://app.supabase.com
2. Layihəni seçin: jbxmlnsicbfkbsatnoej
3. Sol menyu → Project Settings → API
4. "service_role secret" bölməsindən kopyalayın

# Veya yeni key yaradın:
1. Project Settings → Database → Connection Pooling
2. Veya Secrets → Generate new key

# Vercel-ə əlavə et:
Variable name: SUPABASE_SERVICE_ROLE_KEY
Value: (yuxarıdan kopyaladığınız key)
