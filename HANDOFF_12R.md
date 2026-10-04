# HANDOFF — 12r (Metbex sweep: station-scoped ready + false-empty board + modifier text + heartbeat)

**Tarix:** 2026-10-03 · **Vəziyyət:** kod bitdirilib + E2E'də təsdiqlənib; **docs yenilənİB** (MFM §10 journal + §15 rows, POS_COMPETITIVE_COMPARISON §0/§1, bu handoff).

## 1. Owner tələbləri (orijinal, AZ)

1. "modifikatorlar niyə chip oldu — evvəl text idi; bir əlavə ×3 ola bilər, digəri ×1" → modifier-lar text kimi (miqdarla).
2. "sifarişlər modalına girdikdə bir mətbəxin sifarişi digərinə düşməsin".
3. "ümumi mətbəxdə servise ver basıram, icra olunur, sonra geri qayırır — qəribə şeylər".
4. "metbəxi backend+frontend yoxla, hamısını ən xırda detallaqədər duzelt; sonra tekliflər".

## 2. Diaqnostika (browser E2E r13/r13c/r13v/r13d + live DB + server log)

- **DB təmizdir** (live, 2026-10-03): `table_number` duplicate YOXDUR — per-floor, cross-floor (NULL floor_id daxil), cross-location; 31 masa / 3 location. Kitchen orders API = PostgREST FK nesting (`order_items(*,products(...))`) — JOIN fanout YOX. Products API təmiz.
- **Audit-dəki təkrar `mark_ready`** (f48aac33: 4×, 297cfeb4: 8×) = **əvvəlki agent-in E2E fixture-ləri** (explicit timestamp-lu item-lər; item created_at 23:59 < order created_at 00:15; audited olmayan psql reset-lər) — owner bug-u DEYİL.
- **Təmiz flow-da "servise ver revert" repro OLMADI**: whole-order CTA → HAZIRLANIR→SERVİSƏ HAZIRDİR t60-a qədər stabil, console 0; POS serve → SERVİS EDİLDİ stabil. → Görünən "revert" = aşağıdakı BUG 1 + BUG 2 (+ dev Fast Refresh remount).

## 3. Düzəlişlər (hamısı E2E verified)

### BUG 1 — STATION OVERRREACH (canlı repro, r13v STEP 4.1)
Ticket MODAL "Hazırdır" CTA = tam order idi (`handleMakeReady(o.id)`, `item_ids=null`). **Bar (BDS) chef-i basanda Main Kitchen-un yeməyi də 'ready' olundu** (STANSIYALAR Bar 1/1 + Main 1/1; header səhvən SERVİSƏ HAZIRDİR). Bu = owner-in "bir mətbəxin sifarişi digərinə düşməsi".
**Fix (`KDSView.tsx`):** `scopeStId`/`inScope` — unified board = navbar-da AKTİV stansiya, BDS = board familyası (`itemInBoard`). Modal CTA + `fireableCourses` İNDİ yalnız scope daxilinə toxunur:
`handleMakeReady(o.id, scopeIds)` (scopeIds = scope-un bitməmiş item-ləri). Order son stansiya bitəndə DB rollup ilə TƏBİİ 'ready' olur (fake order-ready stamp YOX). Scope paylaşısı bitəndə CTA → sükut emerald `kds_serving_hint` (disabled).
**E2E r13d:** Bar CTA → Bar 1/1 + Main 0/1 + header HAZIRLANIR ✓ · Main CTA → SERVİSƏ HAZIRDİR ✓ · reopen → quiet hint ✓ · POS serve → board təmiz ✓.

### BUG 2 — FALSE-EMPTY BOARD (canlı repro, r13d)
(a) Initial load: board data gəlməyəndə **yalan "Bütün sifarişlər hazırdır"** (hər load/remount, 1-3s). (b) Stations fetch BİR-ATƏŞLİ idi; fail/boş → `boardStations=[]` BÜTÜN sessiya → **30s boş board** (`/api/orders` 124 aktiv order qaytararkən; yalnız reload bərpa). (c) Uzun dev sessiyasında hər code-edit → Fast Refresh remount → (a)+(b) amplifikasiya.
**Fix (`KDSView.tsx`):** (1) **loading gate** — `loading || !stationsLoaded` halında sükut spinner + `kds_loading` ("Yüklenir…" az / "Loading…" en / "Загрузка…" ru) — İKİ yalan empty state-in (all_orders_ready + kds_station_empty) önündə. (2) **stations retry** — transient boş/error → 3× 800ms, sonra `setStationsLoaded(true)` (legit empty də settle olur, sonsuz spinner YOX).
Qeyd: `/api/stations` 53/53 200 idi (HTTP fail YOX) — empty stick mənbəyi remount + one-shot no-retry idi; retry + gate artıq hər iki halı bağlayır.

### BUG 3 — DEVICES HEARTBEAT 500 (server log: hər ~5s)
İki browser profili (owner Chrome + built-in vtab — ayrı localStorage → fərqli `device_id`) eyni `device_name` paylaşır → upsert `onConflict='location_id,device_id'` real constraint `(location_id,device_name)`-i pozur → **23505 → 500 hər heartbeat**.
**Fix (`api/devices/route.ts`):** 23505 → real constraint üzərindən upsert retry (last-writer-wins by name). **Verified:** 4 eyni-vaxt terminal, log-da 500 YOX.

### MODIFIER TEXT (owner tələbi)
KDS kart + modal (BDS eyni komponent) — chip-lər → **sükut text**: `Standart · Əlavə Losos ×3 · Sesam Toxumu` (kart 11px zinc-500/white-40, modal 12px zinc-500/white-45, join ` · `). ×N artıq per-modifier merge olunur (DB/API doğrulandı; r13v ×3 = tək "Əlavə Losos ×3"). Course chip (MAIN) + allergen chip (⚠ safety) qorunur. **E2E r13v:** dark + light verified (light = oxunaqlı, ikincil kontrast — §6 teklif).

## 4. E2E shot-ları
`artifacts/saito-admin/e2e-shots/`: `r13-*` (ilk repro), `r13c-*` (whole-order CTA + POS serve + station isolation), `r13v-*` (mixed order ORD-2957 — BUG 1 repro + modifier text dark/light), `r13d-*` (mixed order ORD-2958 — scope fix + false-empty repro + heartbeat). Hər tapda `*-findings.md`.

## 5. Qalan / OPEN (növbəti agent)

1. **POS 115× duplicate-key burst** (12q §6.1): 3 browser sessiyasında (real order-larla) repro OLMADI, DB/API təmiz, console 0. Ehtimal: 12q seq guard + optimistic window kökü aradan qaldırıb. **Monitorinq** — yenə çıxarsa: ilk `Encountered two children with the same key`-in key VALUE + component stack-ini götür.
2. **Light mode modifier text kontrastı** — zinc-500/white-45 ikincil; owner istəsə zinc-600/white-55 bump.
3. **[MAIN] course badge hər item-də** — POS default course-u explicit 'main' saxlayır (11g/12m design); 11o "deviation-only chip" niyyətinə candidate (config-də default course müqayisəsi lazımdır — settings-də course sütunu YOXDUR, əlavə edilməlidir).
4. **tsc pre-existing** — `src/__tests__/{staff,shifts}-api.test.ts` jest types tapılmır (@types/jest yoxdur) — bu raundun xaricində; app kodu tsc-təmiz.
5. **Superadmin cash shift** r12q2-dən AÇIQ qalıb (12q OPEN) — hələ də açıqdır (test order-ları buna görə gedir). Bağlamaq owner GO-sudur.

## 6. Owner teklifləri (12r sonu — "daha yaxşı etmək üçün")

1. **Course badge "deviation-only"** (yuxarı §5.3) — yemək içərisində hamısı [MAIN] olsa chip səs olur; yalnız default-dən fərqli course chip göstərmək (Toast-ın per-course color-larına gedən yol).
2. **KDS per-item ETA** — rəqiblərdə 2026 trend (per-ticket ETA); DB-də `estimated_delivery_time` order-level var, per-item prep-time (settings-dən) ilə item-level "gözlənilən" zamanı çıxmaq olar.
3. **Expo addımı** (MFM §15 🟡 Addım 2) — course firing + station-scoped ready hazırlandı; expo station = növbəti parity addımı.
4. **Modifier text light-mode kontrastı** bump (kosmetik).
5. **Stale 12q fixture-lərinin təmizliyi** — live DB-də ~10 test order (r12q/r12q2/r13/r13c/r13v/r13d) qalıb; hamısı served/cancel-safe, lakin GÜN view-də səsdir. Owner GO ilə batch-cancel.

## 7. Qısa reference

- **Dev server:** `corepack pnpm --filter @workspace/saito-admin dev` (repo root-dan; port 3000). Root `pnpm dev` bu shell-də nested `pnpm` tapmır — filter formu. **Server NOHUP-da** (exec sessiya 15dk limitindən asılı deyil): `nohup corepack pnpm --filter @workspace/saito-admin dev > /tmp/saito-dev-handover.log 2>&1 &`.
- **psql (işləyir, pooler):** `postgresql://postgres.jbxmlnsicbfkbsatnoej:<DB_PASSWORD>@aws-1-eu-central-1.pooler.supabase.com:6543/postgres` (şifrə = agent diary / owner; psql = `/opt/homebrew/opt/libpq/bin/psql`).
- **Supabase:** ref `jbxmlnsicbfkbsatnoej`, URL `https://jbxmlnsicbfkbsatnoej.supabase.co`. Service role key + anon key = `artifacts/saito-admin/.env.local` (anon key BİLDİ — əvvəlki agent-in .env.local-dan gətirildi; empty anon key = bütün admin sayfası "supabaseKey is required" crash).
- **GitHub:** repo PUBLİC. Push üçün valid owner token = agent diary-da (`ghp_…`; `ghp_JMBoKww…` variant INVALID idi). Remote artıq valid token-la.
- **Login:** `/login` PIN **4321** (superadmin).
- **Qaydalar:** AZ cavab · "supabase yoxla" = HƏMİŞƏ real DB (REST service-role / pooler psql) · HMR canlı — test ortasında server restart ETMƏ (Fast Refresh board-u remount edir — 12r gate artıq bunu sükutla örtür) · commit `<round>: <desc>` → push main · hər UI işi 2 temada test · console 0.
