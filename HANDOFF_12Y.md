# HANDOFF — ROUND 12y (2026-10-04)

**Scope (owner, "sənə neçə dəfə dedim" + flicker + deep verify):**
1. "Servis POS-dan edilir" button **SON render yolu** sil (modal footer) — 12o/12v/12y: 3-cü tələb.
2. "İzləmə" chip TAM sil (navbar = bare Eye icon; card/modal footer = timestamps only).
3. **2s FLICKER dərin kök-fix**: hər əməliyyat 1 dəfə icra olunur, ~2s sonra "sanki icra
   olunmayıb" kimi geri gəlir, sonra yenidən yox olur.
4. KITCHEN + BAR **0-dan browser deep-verify** (flicker, forbidden text, serve flow, tema).
5. **Backend tam verify** (psql, real DB).
6. Hər şey yaşansa → növbəti modul = **INVENTORY**.

## 1. "Servis POS-dan edir" — TAM SİLİNDİ (son yol = modal CTA)

12o (kart text) + 12v (modal button, ready/serving/scopeEmpty branches) silinmişdi — amma
modal CTA IIFE-inin **inactive branch-i** yenə də emerald "Servis POS-dan edilir"
buttonunu render edirdi (screenshot: RUSH ghost + emerald button). 12y:

- `KDSView.tsx` modal footer = **yeni IIFE**: `showRush = pending|preparing`;
  `ctaActive = showRush && scopeIds.length > 0`; `showServed = wf === 'served'`.
  Hazır/serving → **HEÇ NƏ render** (return null; sətir özünü gizlədir).
  Active = yalnız RUSH + "Hazırdır" (actionable); `served` = `✓ SERVİS EDİLDİ` label.
- `kds_serving_hint` i18n key = **az/en/ru-dan silindi** (0 usage).
- `kds_watch` key = silindi (0 usage — navbar chip → bare `<Eye size={11}/>`, 12y).

## 2. "İzləmə" — TAM SİLİNDİ

Navbar watch tab = bare Eye icon (text chip yox) · watch card caption yox (12y, kart CTA
rewrite ilə) · watch modal footer chip yox (yalnız Qəbul/Hazır timestamps + RUSH marker).
Qalıq "İzləmə" hit-ləri = **yalnız code comments** + `/track` + `/kitchen/track` səhifələri
( müştəri order-tracking — ayrı feature, toxunulmadı).

## 3. 2s FLICKER — kök + fix (optimistic merge window genişləndi)

**Kök (12q-nun OPTIMISTIC_MS 15s window-u yalnız tick/ready-ı qoruydu):**
RUSH / 86-void / course-fire = **qeydə alınmayan** optimistik əməliyyat idilər. Poll
(5s) in-flight "köhnə" snapshot gətirdikdə (EU pooler ~2-3s) UI 2-3s-ə "geri" yazırdı:
red border yox → geri, voided row → geri, fired item → pending. Sonra növbəti poll
düz əməliyyatı gətirirdi → "icra olunur". = owner-in gördüyü "2 saniyə sonra yenidən
gəlir" vibe.

**Fix (`KDSView.tsx` `optimisticRef` — hər order üçün protection fields):**
- `rush: boolean | null` — `handleRush`: klik anında `opt.rush = next` (4xx/catch → null;
  success → `d.data.is_rush` ilə təsdiq). Merge: snapshot `is_rush` protected value-dan
  fərqlidirsə → **snap yox, optimistic qalır**.
- `voidedItems: string[]` — `handleVoid86`: void olunandan sonra item id push. Merge:
  bu id-lər `kitchen_status !== 'voided'` gəlirsə → **qəsbən 'voided'**.
- `firedItems: string[]` — `handleFireCourse`: fired id-lər push. Merge: `pending/accepted`
  gəlirsə → **qəsbən 'preparing'**.
- `stillNeed` release şərti = 3 yeni sahə də daxildir (snapshot real dəyişiklik gətirməyincə
  protection 15s window-da qalır).

**E2E r24 flicker verdict: HEÇ VAXT təkrarlanmadı** (sampler, real polls):
| Əməliyyat | Sample | Nəticə |
|---|---|---|
| tick (✓ prepared_qty) | 56× / 27.5s | ON qaldı, DB `prepared_quantity=1` |
| HAZİRLANİR→HAZIRDİR move | 52× / 25.5s | count sabit, revert YOX |
| RUSH toggle | 54× / 21.2s | red sabit (yalnız pre-render 1 sample off) |
| 86 void (PIN 4321) | 26× / 24.9s | row **HEÇ** geri çıxmadı |

## 4. E2E r24 — 0-dan DEEP VERIFY (KDS + BDS + POS; dark+light; console 0)

S1–S16 = `e2e-shots/r24-findings.md` (22 screenshot). Cədvəl:

- **S1 KDS board**: nav Kitchen/Bar(bare Eye)/Expo/GÜN + pill; "İzləmə" YOX; console 0 ✅
- **S2-3 test order** (Masa 3, VIP floor): Filadelfiya + Green Tea + note
  `filadelfiya kremli, çay soyuq olsun, təşəkkür` → **routing verbatim ✓**
  (Kitchen kart = "filadelfiya kremli · təşəkkür"; Bar kart = "çay soyuq olsun · təşəkkür")
- **S4 sub-tabs**: HAZİRLANİR·1 / HAZIRDİR·1, default prep ✅
- **S5 modal**: tam qeyd + RUSH + active "Hazırdır"; 15s hold = sətirlər sabit ✅
- **S6-7**: tick+Hazırdır (Kitchen) → HAZIRDİR; BDS-də bar tick → order ready → **Expo gate** ✅
- **S8 RUSH / S9 86+PIN**: yuxarıdakı flicker cədvəli ✅
- **S10 FORBIDDEN-TEXT AUDIT**: ready modal footer = **BOŞ** (button/text YOX) ✅;
  watch modal = yalnız "Qəbul 21:34 · Hazır 21:36" ✅; `document.body.innerText` scan:
  KDS "Servis POS"=0 / "İzləmə"=0; BDS eyni =0/0 ✅
- **S11 Expo** = view-only ✅ · **S12 POS "SERVİSƏ VER"** (context menu) → Masa 3 =
  "SERVİS EDİLDİ" (`kds_st_served` chip, screenshot r24-12) → KDS ~5s-də clean ✅
- **S13 BDS**: Bar operable / Kitchen watch (bare Eye, view-only) ✅
- **S14 toast routing**: bar-only order (ORD-2970) KDS Kitchen tab-da **0 toast** ✅
  (BDS-local toast harness limit — subagent BDS nav switch edə bilmədi; routing məntiqi
  12v r21c-də artıq verified = eyni `ownStationIds` gate)
- **S15 LIGHT theme**: board/modal/watch/Expo/sub-tabs — hamısı correct+readable, console 0 ✅
- **S16 CLEANUP**: ORD-2968/2969/2970 cancel+dismiss (dismiss CSRF rotate → fresh read = 200);
  Masa 3 + 401 = BOŞ; KDS = yalnız Masa 2. **Masa 2 / 4/5 toxunulmadı** ✅

## 5. BACKEND VERIFY (psql, live DB — 2026-10-04 ~17:45 UTC)

- `orders`: ORD-2968/2969/2970 = `cancelled`/`cancelled`; ORD-2969 `is_rush=t` (S8,
  qorunan audit), `kitchen_ready_at=17:36:24` (rollup stamp = Filadelfiya `ready_at` ilə
  bit-tibi). ORD-2959 (Masa 2) = `confirmed/ready`, is_rush f — **TOXUNULMAYIB** ✓.
- `order_items`: 86-lənən Green Tea (ORD-2969) = **`voided`** (frozen machine —
  cancel voided-ı overwrite ETMİR ✓); digər test item-ləri = `cancelled`;
  prepared_quantity-lar UI-ın tiki ilə uyğun (1/1, 0/1).
- `table_order_contract`: t3 = `empty` (open_orders 0), t401 = `empty`, t2 = occupied
  (owner), t5 = occupied (merged group, öz order-u — toxunulmayıb) ✓.
- `operation_logs` (17:30–17:45): hər order üçün tam audit zənciri —
  `place_order → accept_kitchen_ticket → order_item.voided (reason="Tükəndi") →
  order_item.cancelled (kitchen_cancel) → dismiss_table`. 86 reason = **log-da** ✓.
- Serve: `mark_order_served_atomic` screenshot-dan verified (r24-12 "SERVİS EDİLDİ"
  chip); son `is_served=f` = canonical cleanup (kitchen-cancel) reset — gözlənilən.
- **Natiçə: orphan state YOX; voided/cancelled/ready timestamp-ləri bit-tibi uyğun.**

## 6. Commit / Docs

- Commit: `12y: ...` → main (bu handoff + MFM §10/§15 + comparison 12y + r24 evidence +
  əvvəlki round-ların untracked r20/r21 shot-ları da daxil).
- `.env` / `next-env.d.ts` = STAGED ETMƏDİ (secret-scan 0).

## 7. Qalıq / Növbəti

- **INVENTORY** = növbəti modul (owner: "her sey olunubsa uje kece bilerik inventory").
  Hazır baza: §16 — ingredients/units/stock/transactions/recipes(FROZEN
  `consume_stock_for_item`)/waste/stocktake/PO/suppliers/invoices/auto-86 cron;
  boşluqlar: batch/expiry tracking (⚪), multi-location transfers (❌), auto-PO (🟡).
- Micro-polish (info, blocker YOX): KDS ilk render = stations resolve olana qədər
  1-frame false-empty flash (loading gate var; cold-start yalnız).
- Monitoring: POS 115× duplicate-key burst + transient pooler 500 — 12y zamanında
  təkrarlanmadı (r24-da 0).
