# Supabase RLS — Saito Admin

## Tətbiq

1. [Supabase Dashboard](https://supabase.com/dashboard) → layihə → **SQL Editor**
2. `supabase/migrations/20250523_rls_policies.sql` faylının məzmununu yapışdırıb **Run**
3. Xəta alarsanız: cədvəl adları layihənizdə fərqlidirsə (məs. `staff` yoxdur) — həmin `ALTER TABLE` / policy bloklarını şərh edin və yenidən işə salın

CLI ilə:

```bash
supabase link --project-ref <PROJECT_REF>
supabase db push
```

## Rol matrisi

| Cədvəl | anon (QR / sayt) | admin | kitchen | superadmin |
|--------|------------------|-------|---------|------------|
| reservations | INSERT | CRUD | — | CRUD |
| orders / order_items | SELECT, INSERT, UPDATE* | CRUD | CRUD | CRUD |
| products / categories | SELECT (stokda) | CRUD (dashboard) | SELECT + `is_available` | tam |
| campaigns | SELECT + HH söndür | CRUD | — | CRUD |
| settings | SELECT | SELECT | SELECT delay | CRUD |
| staff | — | — | — | CRUD |
| combos / combo_items | SELECT (aktiv) | — | — | CRUD |
| admin_users | — | öz sətir | — | tam |
| cancelled_orders | — | INSERT/SELECT | — | INSERT/SELECT |
| storage `product-images` | oxuma | yükləmə | yükləmə | + silmə |

\* Anon sifariş yeniləməsi yalnız `status IN ('new','confirmed')` olan sətirlərdə.

## API route-lar

`/api/auth/*`, `/api/reservations`, `/api/combos`, `/api/orders` və s. **service role** istifadə edir — RLS onları blok etmir. Brauzerdə `NEXT_PUBLIC_SUPABASE_ANON_KEY` ilə gedən sorğular bu policy-lərə tabedir.

## İlk superadmin (bootstrap)

`admin_users` boşdursa, admin paneldə **Setup** ilə `auth.signUp` + `admin_users` insert işləyir (`admin_users_insert_bootstrap` policy).

Alternativ:

```bash
SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/seed-admin-users.mjs
```

## Təhlükəsizlik qeydləri

- `settings` anon üçün tam sətir açıqdır (Footer `select *`) — SMTP parolları eyni sətirdədirsə, gələcəkdə `settings_public` **view** yaradın və anon yalnız ona icazə verin.
- QR sifarişlərində `orders` anon SELECT açıqdır (UUID ilə izləmə) — masa nömrəsi ilə aktiv sifariş axtarışı üçün lazımdır.
- `admin_users` üçün rol yoxlaması `SECURITY DEFINER` funksiyaları ilə edilir — policy içində `admin_users`-ə birbaşa subquery yoxdur (recursion riski aradan qalxır).

## Realtime

Migration `orders`, `reservations`, `order_items`, `campaigns` cədvəllərini `supabase_realtime` publication-a əlavə etməyə çalışır. Dashboard → **Database → Replication** bölməsindən də yoxlayın.

## `new row violates row-level security policy for table "products"`

**Səbəb:** Login yalnız cookie yazırdı, Supabase JWT (`authenticated` rol) yox idi — sorğular `anon` kimi gedirdi.

**Həll:**
1. Layihəni yeniləyin (`useAdminAuth` indi `setSession` edir).
2. **Çıxış → yenidən login** edin (köhnə cookie JWT-siz qala bilər).
3. SQL Editor-də `20250524_fix_products_write_policies.sql` işə salın (optional, policy təmizliyi).

**Yoxlama:** Brauzer konsolunda `await supabase.auth.getSession()` — `session` null olmamalıdır.
