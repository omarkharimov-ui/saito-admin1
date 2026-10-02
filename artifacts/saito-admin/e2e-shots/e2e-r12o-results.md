# SAITO POS KDS — "12o" E2E: Tick semantika dəyişikliyi verify

**Tarix:** 2026-10-02 · **Səhifə:** http://localhost:3000/admin/kds · **Theme:** dark→light→dark
**Hədəf sifariş:** `3062bf17-0784-4290-9a4d-f1b97cb34c53` ("E2E Wolt", ÇATDIRILMA, Dragon Roll ×1)
**Nəticə:** ✅ **8/8 PASS** — tick artıq order state machine-ə toxunmur; "Hazırdır" yeganə ready-ə bəyan; recall net-sıfır; footer artıq button deyil.

> Qeyd: Sistemdə **2 ədəd "E2E Wolt"** sifarişi var idi — `3062bf17` (test hədəfi) və əvvəlcədən mövcud `d74319c3` (artıq `ready`). Eyni ad/telefon/qeyd olduğu üçün kart identifikasiyası `created_at` sıralaması ilə aparıldı (KDS kartları created_at ASC; API isə DESC qaytarır). Hədəf kart = ən kiçik created_at-li Wolt kartı. Recall-dan sonra psql hədəf sifarişin dəyişdiyini, digərinin toxunulmadığını təsdiqlədi (aşağıda).

---

## Addım 2 — DB BASELINE
| Sahə | Dəyər |
|---|---|
| order.kitchen_status | `pending` |
| order.kitchen_accepted_at | `NULL` |
| item.kitchen_status | `pending` |
| item.prepared_quantity | `0` |
**PASS** (gözlənilən baseline).

## Addım 3 — Tick (✓) NON-ready item-də → PASS ✅
- (a) Emerald **yanır**, counter **1/1** ✅
- (b) Order **YENƏ GÖZLƏYİR** — "Qəbul et" pill görünür, **auto-accept OLMADI** ✅
- (c) Kart emerald yuxarı qrupa **QALXMADI** (in-progress qrupda, aşağı-sağda, qırmızı border) ✅
- (d) psql: `order.kitchen_status=pending`, `kitchen_accepted_at=NULL`, `item.kitchen_status=pending`, `prepared_quantity=1` ✅
- Console errors: **0** · Capture: `r12o-tick-pending.png`

## Addım 4 — Un-tick (✓ təkrar) → PASS ✅
- Circle **söndü**, counter **0/1**, hələ **GÖZLƏYİR** ✅
- psql: `prepared_quantity=0` (order/item hələ pending) ✅
- Console errors: **0** · Capture: `r12o-untick.png`

## Addım 5 — Tick → "Hazırdır" CTA → PASS ✅
- psql: `order.kitchen_status=ready`, `item.kitchen_status=ready`, `prepared_quantity=1` ✅
- Kart yuxarı **emerald qrupda**, "SERVİSƏ HAZIRDIR" ✅
- Kartın ALTINDA "Servis POS-dan edilir" = **kiçik emerald QIET TEXT** ✅
  - DOM: `<span class="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-400/70">` (+ 12px icon svg)
  - Font: **11px** / weight 500
  - Bu sahənin konteyneri (`div.mt-3.px-0.5`) → **button sayı = 0** (button DEYİL) ✅
- **"Servis et" YOX** (button sayı: 0) ✅ · Emerald **dolu bar YOXDUR** ✅
- Console errors: **0** · Capture: `r12o-ready-quiet.png`

## Addım 6 — RECALL (hazır kartda ✓) → PASS ✅ (net sıfır)
- Kart **in-progress qrupa qayıtdı**, circle **OFF**, **"Qəbul et" pill geri**, **GÖZLƏYİR** ✅
- psql (hər iki Wolt):
  | order id | kitchen_status | accepted | item_kst | prepared |
  |---|---|---|---|---|
  | `3062bf17` (hədəf) | **pending** | NULL | **pending** | **0** ✅ = BASELINE |
  | `d74319c3` (digər) | ready | NULL | ready | 0 (toxunulmadı) |
- Console errors: **0** · Capture: `r12o-restored.png`

## Addım 7 — Light mode → PASS ✅
- `html.class = "h-full antialiased light"`; kart fonu `rgb(255,255,255)` (ağ)
- Quiet text **computed color** = `oklab(0.508 -0.114 0.029 / 0.8)` (tünd mid-emerald, 11px) → ağ fonda **oxunaqlı** ✅
- Sonra dark-a geri qaytarıldı (`html.class = "h-full antialiased dark"`) ✅
- Capture: `r12o-light.png`

## Addım 8 — Console cəmi → PASS ✅
- **Total console errors: 0**
- JS exceptions (errors utility): **0**
- **React key warning: 0**
- Console-da yalnız: React DevTools info, `[HMR] connected`, `[Fast Refresh]` log-ları

---

## Xülasə
| Addım | Nəticə |
|---|---|
| 2 DB baseline | PASS |
| 3 Tick=prepared only (no auto-accept) | PASS |
| 4 Un-tick | PASS |
| 5 Hazırdır=ready + quiet text footer | PASS |
| 6 Recall (net zero) | PASS |
| 7 Light mode oxunaqlılıq | PASS |
| 8 Console/React warning cəmi | PASS (0/0) |

**Semantika təsdiqi:** NON-ready item-də tick YALNIZ `order_items.prepared_quantity` yazır; order state machine toxunulmur (GÖZLƏYİR qalır, "Qəbul et" pill qalır, kart emerald qrupa qalxmır). READY item-in un-tick-i = RECALL (ready→pending). "Hazırdır" CTA yeganə ready-ə bəyandır. Footer "Servis POS-dan edilir" button deyil, kiçik emerald qiet text-dir.

## Artefaktlar (PNG)
`r12o-tick-pending.png`, `r12o-untick.png`, `r12o-ready-quiet.png`, `r12o-restored.png`, `r12o-light.png`
