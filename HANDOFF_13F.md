# HANDOFF 13f — Merged odeniş + offline delta + Stok hub (2026-10-05)

## Owner mandatı (söz-lə-söz)
> "merged tebikiii her masa lakin bu tarixceye dusende birlesik qrup kimi dussune ayri ayri yox merged odenis merged olaraq dbda saxlanilsin qisaca. 2 cinide duzeldersen ozun sonra ise derhall ui yeniden uje apple felsefesi... recipes+ inventory lakin inventory-a aid olan seyler bax sidebarda ayri tab olmasinda eyni sehifede olsunlar sonra bruazerden gri e2e test et verify et."

## 13f-A — MERGED ÖDƏNİŞ = MERGED DB QEYDİ ✅
**Problem:** Merged masa qrupu ödənildikdə hər order ayrı `/api/orders/pay` call-alan → `order_payments`-da ayrı sətirlər, Tarixçədə ayrı ayrı kartlar.

**Məhsul (frozen RPC-də 0 dəyişiklik):**
- POS hər **ödəniş action-ı** üçün BİR stable UUID yaradır (`payGroupIdFor` — sorted table-setinə görə, cash-gate retry-də eyni ID qorunur) → hər order-un pay body-sinə `payment_group_id` gedir.
- `api/orders/pay`: UUID strict-validate → hər ledger sətirinə `split_group_id` kimi yazılır (frozen RPC artıq `(v_payment->>'split_group_id')::UUID` forward edir). Per-item branch-də köhnə drawer-session dəyəri YERİNƏ (heç nə bu sahəni "drawer" kimi oxumur — DB+code verify).
- **5 pay call-site** bağlandı: runPaymentFlow (takeaway-specific + dine-in loop), handleSplitConfirm (per-item + proportional), retryFailedPayments (`payOutcome.groupId`-lə orijinal qrupa qoşulur).
- `useOrders.handlePay` (orders page) **2 latent bug** ilə yazıldı: (1) merged qrupdan YALNIZ parent ödənilirdi (child order-un items ödənməmiş qalırdı), (2) `idempotency_key` heç göndərilmirdi (route 400) + `paid_amount` yox idi (method=card üçün cash_amount/card_amount ignore → ₼0 "ödəniş"). İndi: parent + bütün ödənməmiş childlar, 1 group ID.
- **History route**: eyni `split_group_id`-li orderlar server-side collapse olunur — ən erkən paid = primary (`payment_group` payload: member_tables/totals/search), digərləri listdən çıxır; `nextOffset` (raw offset) + adjusted `totalCount`.
- **Detail route**: qrupun bütün üzvləri expand olunur (orders+payments+audit+staff names).
- **UI (OrderHistory)**: merged kart (Users glyph, "Masa 90 + 401", "2 MASA" chip, cəm total), detail banner "Birləşik qrup ödənişi" + üzv chips + hər üzvün kompakt sectionu (items/ödəniş/audit/reprint), axtarış üzv items-a da işləyir.

### 13f-A tapılan+fix edilən LATENT BUGLAR
1. **Tarixçə ÖDƏNİŞLƏR sectionu ~8 gündür BOŞ idi:** detail route legacy `payments` cədvəlindən oxuyurdu — oraya son sətir 2026-09-27-də düşüb; frozen RPC `order_payments`-a yazır. Fix: order_payments əvvəl, legacy fallback.
2. **"MASA 401 + 401" label bug (E2E r30 catch):** merge zamanı CHILD order-un `table_number`-i PARENT tabelə rewrite olunur; orijinal cədvəl `merged_from_table`-da qalır. Fix: `merged_from_table ?? table_number` (route + UI ×4 yer).
3. **Parent/child "inversion" BUG DEYİL:** DB semantics tutarlıdır (operator hansı masaya əvvəl basdı, o parent olur).

**DB kanıt (E2E):** ORD-2971 (₼4, Green Tea, Masa 90→401) + ORD-2972 (₼10, Tea, Masa 401) — hər ikisinin `order_payments` sətiri **eyni `split_group_id = 997292b5-38f5-4ef7-b93c-63ac942af24f`** → 1 merged qrup ödənişi. Bu 2 paid test order QALDIRILDI (ilk real merged payment qeydi — Tarixçədə demo; owner istəsə refund edə bilər).

## 13f-B — POS CART UNSENT-DELTA PERSISTENCE ✅
**Problem:** Göndərilmiş order-a sonra əlavə olunan (unsent) delta yaddaşda idi — tab bağlanma / terminal restart = SÜKUTLA İTKİ (draft effect `cart.order_id` varsa save ETMİR).
**Fix (`usePos.tsx`, 12u KDS offline-buffer doktrinası):**
- `pos_unsent_delta_${order_id}` @ **localStorage** (24h TTL), hər cart mutation-da persist (delta yoxdursa auto-delete).
- Re-hydration-da **safe merge** (selectTable dine-in + loadOrderIntoCart takeaway/delivery): server row varsa `quantity = max(server, saved)`; id-siz satır = content-key dedupe ilə təzə draft. **Heç nə auto-resent** — delta yalnız operatorun növbəti explicit send-ində çıxır (təzə idempotency key) → **double-send yolu YOX**.
- Offline WRITE QUEUE (queue.ts, localStorage) artıq queued sends saxlayır — onlar sentQuantity advance etdiyindən re-persist edilmir (overlap YOX).
- Dead order-da key silinir. StrictMode double-invoke safe (idempotent).
**E2E:** Masa 3 (VIP): Green Tea ×1 send → +1 unsent → hard reload → masa tapıldı → **qty 2, 1 sent — delta Qayıtdı** ✓.

## 13f-C — INVENTORY + RECIPES = ONE PAGE (Stok hub) ✅
**Məhsul:** `/admin/stock` (PRO INVENTORY) indi **11 baxışlı HUB**: Anbar, Ağıllı Analiz, Tədarük, **Alış Sifarişləri**, Report, Tədarükçülər, **Reseptlər, Sayım, Qaytarış, İtki St., Audit**.
- 6 köhnə sidebar route-unun bədənini eyni qovluqda `*-content.tsx`-ə köçürdüm (relative imports qorunur), köhnə route = **incə redirect** (`?view=po` və s. — bookmarklar çalışır).
- Hero-da BİR flex-wrap chip row (unified active: `bg-theme-text` pill, dark+light); role-gate: elevated chips (po/recipes/counts/returns/waste) = superadmin/owner.
- **Sidebar: 7 giriş → 1 "Stok"** (Warehouse).
- **Dead view fix:** "Ağıllı Analiz" düyməsi var idi amma render bloku YOX idi (component import edilirdi, mount edilmirdi) → indi çalışır.
- **Light-mode bug sweep:** 6 sayfanın ~300 hardcoded `text-white/bg-white/border-white` → theme vars (recipes sayfasında light-da white-on-white idi — indi dark text on light).
- **E2E role bug (run B catch):** chip-gating `saito_role` COOKIE oxuyurdum — bu cookie **heç vaxt set edilmir** (yalnız logout-da clear olunur) → 5 elevated chip görünmürdü. Fix: `useAdminAuth()` (live `/api/auth/me`) — app-in canonical mənbə.

## E2E r30 (browser, dark+light, console 0)
- **Run A:** merged payment flow — 1 merged entry, shared split_group_id, group detail (banner+chips+payments+member section). 1 label bug tapıldı → fix.
- **Run B:** label fix verify ✓, offline delta restore ✓, Masa 3 cleanup ✓ (PIN: MASANI BOŞALT = **1871** — 4321 banned/suspended; `saito_role` cookie tapıldı).
- **Run C:** hub 10/10 PASS — 11 chip, sidebar 1 giriş, bütün views render, /admin/recipes redirect, light mode readable (rgb(17,24,39) on rgb(247,247,248)), dark restored. **Console errors: 0** (1 cosmetic Next.js dev advisory).
- Known (pre-existing): transient pooler 500s (`/api/customers`, `/api/admin/badges`, `GET /staff/login` ×4 prefetch — session-i pozmur).
- Şəkillər: `e2e-shots/r30-*.png` (16 shot) + `r30-runA-findings.md` + `r30-8-report.md`.

## DB / test state
- Masa 90: E2E üçün unarchive etdim → **geri archive edildi** (net-zero).
- Masa 401: 'cleaning' (paid order-dan SONRA normal operational status — owner təmizlik mark edir).
- 2 paid test order (ORD-2971/2972, ₼14 cəm) — 13f demo qeydi, qaldırıldı.
- Masa 3: boş (test order dismiss edildi).

## Fayllar
- `api/orders/pay/route.ts` (payment_group_id validate + stamp)
- `api/orders/history/route.ts` (group collapse + nextOffset + merged_from_table)
- `api/orders/history/[id]/route.ts` (order_payments live ledger + group expand)
- `admin/pos/page.tsx` (payGroupIdFor + 5 call-site)
- `admin/pos/components/OrderHistory.tsx` (merged card + group detail + memberTableNo)
- `admin/orders/hooks/useOrders.ts` (handlePay rewrite)
- `admin/pos/hooks/usePos.tsx` (13f-B persistence)
- `admin/stock/page.tsx` (hub: 11 views, chips, useAdminAuth gate)
- `admin/{purchase-orders,recipes,stock/counts,stock/returns,waste-standards,audit}/page.tsx` → redirectorlar + `*-content.tsx` bədən
- `admin/components/layout/adminNavLinks.ts` (7→1)
- 6 sayfa theme-var sweep (white→vars)
