# HANDOFF — ROUND 13c (2026-10-04) — INVENTORY + RECIPES TAMAM (Toast parity + better)

**Scope:** owner mandat (13b-dən): *"qərər vermək artıq sənə keçir… toastdaki hər şey +
onlardan daha yaxşı — bizim mövcud calibration-ı gücləndir; inventory + recipes TAM şəkildə
backend + frontend (UI), Apple fəlsəfəsi + premium, dayanmadan, qərar sənə, tam bitəndən
sonra report."* = §1d müqayisəsinin **8 zəifliyindən 6-sının bağlanması** + AI calib
gücləndirməsi + E2E r27.

## 1. DB SCHEMA (13c-A — hamısı service-role-only RLS)

| Table / column | Məqsəd |
|---|---|
| `stock_batches` (id, ingredient_id FK, qty, expiry_date, source, note, created_at + idx) | Batch/expiry = **təxmini (supplementary) təbəqə** — frozen `consume_stock_for_item`-a toxunulmayıb; satışa gate YOX edir, FEFO attention verir |
| `supplier_items` (id, supplier_id FK, name, unit, unit_price, sku, active, created_at) | Vendor product catalog (Toast parity) — Order Guide qiymət prefill + invoice anchor |
| `stock_counts.assigned_to text` | Staff assignment (Toast BEST parity) |
| `purchase_orders.recurring_weekly boolean default false` | Həftəlik təkrar flag |
| cron `recurring-draft-pos` (`0 6 * * 1`, **active**) + `create_recurring_draft_pos()` | Dördüncü ertə 09:00 (Baku) recurring PO-ların **DRAFT** kopyasını yaradır — avtomatik GÖNDƏRİLMİR, insan göndərir (E2E dry-run verified: 0 RECUR- PO, çünki 0 recurring PO mövcuddur — doğru) |

## 2. BACKEND (13c-B — hamısı service-role `svc()` + `requireAuth`)

| Endpoint | İş |
|---|---|
| `GET /api/stock/order-guide` | Par (critical_limit) altındakı + mənfi maddələr → 7-günlük tələb üzrə suggested qty + supplier catalog qiymət prefill |
| `POST /api/procurement/from-invoice` | Invoice line-lərindən **DRAFT PO** (Toast flagship bağlandı) |
| `GET /api/inventory/reports` | Valuation, 30-gün COGS, AvT (actual vs theoretical), shrinkage/waste, freshness (FEFO) — 1 call |
| `GET/POST /api/stock/batches` + `DELETE /api/stock/batches/[id]` | Batch CRUD (404 guard, 13a qaydası) |
| `GET/POST /api/suppliers/items` + `PATCH/DELETE /api/suppliers/items/[id]` | Catalog CRUD (PATCH = qiymət yeniləmə/active toggle, DELETE = typo) |
| `POST /api/purchase-orders` | + `recurring_weekly` |
| Qiymət avtomatlaşması | Mövcud `apply_wac_on_stock_in` (frozen trigger) = WAC — stock_in-da avtomatik, toxunulmayıb |

## 3. AI GÜCLƏNDİRMƏ (13c-C — Groq llama-3.3-70b, `groqChat` + `parseJsonFromText`)

- **`GET /api/recipes/calibrate?product_id=`** — yeni kalibrasiya engine: 30-gün
  theoretical demand (BOM × sold units) vs **FAKTİKİ** consumption (per-item
  `order_consumption` logs, `order_item_id` attribution) → cədvəl + LLM **BOM delta
  təklifi** (propose-only; waste fərqi reseptə əlavə ETMİR — ayrıca ölçülür). Apply =
  mövcud atomik `POST /api/recipes/save` (manual sətirlər replace, AI sətirlər toxunulmur).
- **`GET /api/inventory/advisor`** — 30-gün deterministic stats (valuation delta,
  top waste, shrinkage %, FEFO riskləri) + LLM narrative = **AdvisorCard**.

## 4. FRONTEND (13c-D — Apple/premium, saito-icons, both themes)

- **Stock page:** `Report` view (ReportsTab: CARI STOK DƏYƏRİ / COGS / AvT / İTKİ LİDERLƏRİ /
  TAZƏ-FEFO) + hero altı **AdvisorCard** + Anbar sətirlərində **freshness chip**
  (batch bazlı: "MÜDDƏT KEÇİB" red / "DÖYMƏ: N gün" amber, ≤3 gün) + InspectorPanel
  **PARTİYALAR · FEFO** section (CRUD: miqdar/döymə/mənbə; FEFO sort; chips).
- **ProcurementTab:** yeni **Order Guide** pill — supplier filter pills, checkbox select,
  "Həftəlik təkrar (Dü 09:00 draft)" checkbox, **DRAFT PO Yarat** (supplier-a görə
  qruplaşdır, tədarükçüsüz sətir skip+toast) + Tədarükçü detail modal içində
  **MƏHSUL KATALOGU** (inline CRUD: ad/birim/qiymət).
- **Stok Sayımı:** create modal-da **"Sayımı edən"** (assignment) + sətirdə
  "Təyin: X" chip + **offline buffer** (`useCountOfflineQueue.ts` — 12u KDS pattern:
  localStorage FIFO, network fail-də enqueue, `online` event-də replay, 4xx=drop
  (definitive reject), 5xx/network=keep, banner + "İndi göndər").
- **Recipes:** expand içində **KALİBRASİYA (AI)** button (yalnız reseptli məhsulda) →
  modal: XƏMMAL/BOM/TƏXMIN 30G/FAKTİKİ/FƏRQ cədvəli + AI TƏKLİFLƏRİ (card: current →
  suggested + reason + Tətbiq et) — qərar insanındır.
- **Purchase-orders:** "Həftəlik" badge + `RECUR-` order_number cron badge.
- **E2E r27 fix:** DRAFT PO button = CDP "occluded" (stale coords + flex parent
  hit-test) → `type=button` + `relative z-10` + `shrink-0` — retry-də işlədi.

## 5. E2E r27 (browser, 0-dan, dark+light, **console 0**, 12 screenshot, reversable)

- **S1** stock panel + AdvisorCard + 5 view button — PASS
- **S2** batch: "5 gün qalıb" (2026-10-09) + "Müddəti keçib" (2026-10-01) + Anbar row chip
  → ikisi də DELETE (200) — PASS, təmiz
- **S3** supplier catalog: add (₼5) → edit (₼6) → delete — PASS, təmiz
- **S4** order guide → **DRAFT PO yaradıldı** (`bd469146…`, ₼1,150) → **cancelled** (200)
  — PASS (bridge: supplier mapping reversible — qaytarıldı)
- **S5** REPORT: CARI STOK DƏYƏRİ 228,209 ₼, COGS/itki, NƏFS STOK BORCU 5, AvT, İTKİ
  LİDERLƏRİ, FEFO — PASS
- **S6** counts: create + "Təyin: E2E-Staff" chip + item add → cancel + DELETE (200) —
  PASS, təmiz
- **S7** Filadelfiya Classic kalibrasiya: 7-sətir BOM cədvəli + "BOM faktiki sərfiyyata
  uyğundur — düzəliş təklif olunmur" — PASS (apply YOX — qərar owner-in)
- **Light theme:** Anbar + inspector + counts — PASS

## 6. BACKEND VERIFY (psql, son — təmizlik təsdiqi)

`supplier_items=0 · stock_batches=0 · stock_counts=0 · guide draft POs=0 · RECUR-POs=0`
· mənfi stok = 5 (owner sayımı gözləyir — 13a) · cron `recurring-draft-pos` +
`stock-thresholds` = **active**.

## 7. §1d ZƏİFLƏRİN STATUSU (13c-dən sonra)

| # | Zəif | Status |
|---|---|---|
| 1 | Invoice→PO automation (Toast flagship) | ✅ `from-invoice` DRAFT PO |
| 2 | Par-based order guide + recurring | ✅ Order Guide + `recurring_weekly` + cron |
| 3 | Formal COGS/AvT ledger | ✅ ReportsTab (valuation+COGS+AvT+shrinkage) |
| 4 | Offline stocktake + staff assignment | ✅ `useCountOfflineQueue` + `assigned_to` |
| 5 | Batch/expiry (sushi freshness) | ✅ `stock_batches` + FEFO chips |
| 7 | Qiymət avtomatlaşması | ✅ (mövcud WAC trigger + catalog prefill) |
| 6 | Multi-location | ❌ biznes qərarı (franchise?) |
| 8 | Theft/shrinkage pattern (weekly) report | 🟡 discrepancy_alerts var, weekly pattern report YOX |

## 8. NÖVBƏTİ KANDİDATELƏR (13d)

1. **App-wide client-auth audit** (13a note #5): inventory indi API-based (immune);
   digər modullarda (dashboard/customers/…) anon-client bug latent ola bilər.
2. **Shrinkage pattern weekly report** (§1d #8).
3. **Owner sayımı** — 5 mənfi + 2 şübhəli maddə (13a; indi assignment+offline ilə rahatdır).
4. **Test-order consumption verify** (owner "hele etməyə" — hold; BOM indi işləyir).
5. **Multi-location** — franchise kararı ilə.

**Masa 4/5 = MERGED** (test order YOX), **Masa 2** = owner-in öz order-ı — toxunulmaz qaldı.
Test cleanup kanon: `POST /api/kitchen/cancel` + `POST /api/orders/dismiss`.
