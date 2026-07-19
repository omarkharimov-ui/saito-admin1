# POS Bugs — Dərin Analiz (Repo + Supabase)

**Layihə:** `saito-admin1` · `artifacts/saito-admin` (Next.js 16) · Supabase `jbxmlnsicbfkbsatnoej`
**Tarix:** 2026-07-19 · Analiz canlı DB-yə qarşı aparılıb (realtime, RLS, publication yoxlanılıb).

---

## A. Təsdiqlənmiş kök səbəblər (live DB ilə sübut olunub)

### 1) Qonaq sayı işləmir (`guest sayi islemir / azalmir`)
**Fayl:** `artifacts/saito-admin/src/app/admin/pos/hooks/usePos.tsx` → `updateGuestCount` (sətir ~479)
**Kök səbəb:** `updateGuestCount` aktiv sifarişi tapmaq üçün belə sorğu göndərir:
```
GET /api/orders?table_number=eq.5&status=not.in.(paid,cancelled)&select=id&...
```
Amma `/api/orders` GET route (`api/orders/route.ts:21-27`) yalnız `status` parametrini oxuyur və onu belə yapışdırır:
```
&status=eq.not.in.(paid,cancelled)
```
Supabase REST-də bu **yalnış filter**-dir (`eq` operatoru `not.in.(...)` dəyərini olduqca qəbul edir) → **`[]` qaytarır**.
Canlı yoxlama:
- `status=eq.not.in.(paid,cancelled)` → `[]` (boş)
- `status=neq.paid&status=neq.cancelled` → düzgün sifarişlər

Nəticə: `activeOrder` heç vaxt tapılır → `return` edilir → `guest_count` heç vaxt yazılmır. Yerli `setCart` ilə vizual azalma olsa da, serverə yazılmadığı üçün refresh-dən sonra geri qayıdır. İstifadəçi bunu "ümumiyyətlə işləmir" kimi görür.

**Düzəliş:** `updateGuestCount`-i `/api/orders`-i olduğu kimi çağırıb, aktiv sifarişi JS tərəfində `table_number` + status filtri ilə tapmaqla əvəz etmək.

### 2) Səbətdəki məhsullar yox olur (`sebetdeki mehsullar yox olur`)
**Fayl:** `usePos.tsx` → `selectTable` (sətir ~89-193) və `placeOrder` (sətir ~397-403)
**Kök səbəblər:**
- **(a)** `selectTable` içində sətr 111: `if (!sameTable || !cart || cart.items.length === 0)` şərti ilə səbət *boş* sıfırlanır. `sameTable` yalnız `activeView === 'order'` olduqda `true` hesab olunur. İstifadəçi sifariş ekranından geri qayıdıb eyni masaya yenidən daxil olanda `activeView==='floor'` olduğundan `sameTable=false` olur və səbət yenidən yaradılır. Sonra sətr 162-187-də server item-ləri ilə **merge** edilir, amma `prev` artıq boş səbətdir → *göndərilməmiş (unsent)* yerli item-lər itir.
- **(b)** `placeOrder` sətr 397-403: əgər göndəriləcək yeni item yoxdursa (`unsent.length === 0`) `setCart(null)` edilir və ekran `floor`-a keçir. İstifadəçi "send" basanda səbətin təmizləndiyini görür.
- **(c)** `selectTable` sətr 162-187 merge loqikasında: server item-ləri ilə birləşdirmə yalnız `prev` (yeni boş səbət) əsasında işləyir; yerli `sentQuantity===0` item-lər itir.

**Düzəliş:** `selectTable`-i eyni masa yenidən seçildikdə mövcud səbəti (göndərilməmiş item-lərlə birlikdə) saxlamağa, fərqli masa seçildikdə isə təmizləməyə qərar vermək. `placeOrder` boş-göndərmə davranışını saxlamaq (bu gözlənilən).

### 3) Masa əməliyyatları yalnız refresh-dən sonra görünür
**Nəticə (live yoxlama):** Supabase realtime **işləyir**.
- `supabase_realtime` publication `table_floors`, `orders`, `order_items`, `products`, `reservations`, `settings`, `campaigns` cədvəllərini ehtiva edir (təsdiqlənib).
- `pg_publication` `pubinsert/pubupdate/pubdelete/pubtruncate` = hamısı `true`.
- `table_floors`/`orders` `REPLICA IDENTITY` uyğundur.
- Anon açar ilə realtime abunəliyi (`SUBSCRIBED`) `table_floors` UPDATE-də **hadisə alır** (test skripti ilə sübut olunub).
- RLS: `table_floors` `anon_select` (`qual=true`), `orders` `orders_select_public` (`qual=true`) anon oxununa icazə verir.

Yəni realtime konfiqurasiyası **düzgündür**. Problem **frontend realtime→fetchData zəncirində** idi və hissəlik düzəldilib, amma zəif yerlər qalır:
- `usePos.tsx` `fetchData` sətr 48-53: əgər `/api/pos/tables` cavabı `ok` deyilsə (məs. token yenilənməsi zamanı keçici 401), **heç bir xəta göstərilmir və UI yenilənmir** — yalnız `console.error`. Manual refresh isə tam yükləmə ilə düzəlişi görür. Bu, "yalnız refresh-dən sonra" simptomunu izah edir.
- Bütün masa əməliyyatları (merge/transfer/dismiss/unmerge) uğurdan sonra açıq şəkildə `pos.fetchData()` çağırır, amma realtime-triggered `fetchData` uğursuz olsa, UI yapışıq qalır.

**Düzəliş:** `fetchData` uğursuzluqlarını görünən etmək (toast) və realtime handler-in həmişə zorla yeniləməsini təmin etmək.

---

## B. Supabase tərəfində müşahidə olunan digər risklər

| # | Yer | Problem | Təsir |
|---|-----|---------|-------|
| S1 | `orders` GET (`api/orders/route.ts:21-27`) | `status=not.in.(...)` filter-ini düzgün emal etmir; `table_number` query param tamamilə ignore edilir | Guest count + istənilən `table_number` filteri sınıq |
| S2 | RLS `table_floors` | `anon_update` yoxdur; yalnız `anon_select/insert/delete` var. Service-role istisna olmaqla, anon yeniləyə bilməz (doğru, çünki yazılar API üzərindən service_role ilə gedir) | Yoxlama: OK, amma realtime üçün yalnız SELECT lazımdır |
| S3 | `merge_tables_v3` / `transfer_tables_v3` RPC | Həqiqi INSERT/UPDATE edir, realtime üçün uyğundur | OK |
| S4 | `cancel_table_orders` RPC | `order_items` və `orders` statusunu `cancelled` edir; draft item-ləri `dismiss_table_session` silir | OK (item itkisi yalnız draft üçün) |

---

## C. Repo tərəfində (frontend) qeydə alınan digər problemlər

| # | Fayl:sətir | Problem | Ağırlıq |
|---|-----------|---------|--------|
| R1 | `usePos.tsx:479` `updateGuestCount` | Orders sorğusu yalnış `status=not.in.(...)` filteri göndərir → guest count heç yazılmır | Kritik |
| R2 | `usePos.tsx:111` `selectTable` | Eyni masa yenidən seçildikdə göndərilməmiş item-lər itir | Yüksək |
| R3 | `usePos.tsx:48-53` `fetchData` | Non-ok cavabda səssiz uğursuzlıq → realtime yenilənməsi görünmür | Yüksək |
| R4 | `usePos.tsx:397-403` `placeOrder` | Boş göndərmədə `setCart(null)` — gözlənilən, amma istifadəçiyə qarışıq ola bilər | Orta |
| R5 | `api/orders/route.ts:21-27` | `table_number` / `not.in` query param-ları emal edilmir | Orta (R1-in səbəbi) |

---

## D. Tətbiq olunacaq düzəlişlər
1. `updateGuestCount` → düzgün aktiv sifariş axtarışı (R1/S1).
2. `selectTable` → eyni masa üçün səbəti saxla, fərqli masa üçün təmizlə (R2).
3. `fetchData` → uğursuzluqları görünən et, realtime handler-i möhkəmləndir (R3).
4. (`api/orders` GET) `table_number` + `not.in` filter dəstəyi əlavə et (R5/S1) — seçim olaraq.
