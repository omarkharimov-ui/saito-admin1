# HANDOFF 13i — Stok hub 0-dan rewrite: 4 niyyət tab (2026-10-05)

## Owner mandatı (söz-lə-söz)
> Audit sualı: "bu stok sehifesi cox betbatdir, ilk önce teklif edek neler var sehifede ne işe yarayirlar"
> Qərar: "4 edirik ... ui yeniden yaz ... 0 dan yenidən daha qəşəng et, micro-interactions, state machine transitions, user anlasında 3 saniyədə ne etmelidir"

Mandat = 4 tab birləşdirməsi (audit təklifi A) + inventory UI-nın 0-dan rewrite-i:
daha qəşəng, micro-interactions, state machine transitions, 3 saniyə qaydası.

## Nə üçün "bət" idi (audit qeydləri)
10 chip → yadda saxlanma yükü · Tədarükçülər ×2 (yalın tab + Tədarük içi) · tab-daxili
sub-tab ×8 (~28 ekran) · AI səthi ×3 (Advisor + Ağıllı Analiz + İnsaytlar) · "İtki" 5 yerdə ·
**ölü "Sifariş et" linki** (`?tab=procurement` — hub yalnız `?view=` oxuyurdu) · boş panellər
(Anomaliyalar/İnsaytlar/Trendlər `catch {}`) · **₼228,209 stok dəyəri şişkin** (8 mənfi/şübhəli
maddə — sayıma qədər fikstir) · "Aşağı Stok" KPI = **hard 0** (`status==='low'` belə status
Yoxdur — InventoryStatus: normal/critical/out_of_stock) · OrderGuideSection tam hardcoded
white (light-da görünmürdü).

## Yeni arxitektur (15 files, +2432/−1995)
```
stock/page.tsx            — 4 niyyət tab shell (191 sətir, 0-dan)
stock/hooks/useAsyncView.ts — STATE MACHINE: loading/error/ready, SWR, seq-guard
stock/components/
  ViewFrame.tsx            — skeleton shimmer / error+retry / empty CTA / LiveNumber pulse
  TabHero.tsx              — 3 SANİƏ QAYDASI: hesablanan status cümləsi + 1 CTA (+tone)
  StockTab.tsx             — Stok: hero + 4 KPI (real) + Advisor + Anbar + bütün modallar
  ProcurementHub.tsx       — Tədarük: Nə Alım / Faktura / Sifarişlər / Tədarükçülər
  InvoiceUploadSection.tsx — (ProcurementTab-dan çıxarıldı, theme-var)
  SuppliersSection.tsx     — (ProcurementTab-dan çıxarıldı, #0C0C0E → theme vars)
  OperationsHub.tsx        — Sayım & İtki: Sayım / İtki / Qaytarış / Anomaliyalar
  AnalyticsHub.tsx         — Analiz: Hesabat / Trend / Audit
  OrderGuideSection.tsx    — light-fix + autoSelectId (ölü-link fix)
  CalibrationSuggestionsPanel / AdvisorCard / InspectorPanel — saxlanıldı
  ✂ IntelligenceTab.tsx · ProcurementTab.tsx · InventoryHealthCard.tsx — SİLİNDİ
recipes/recipes-content.tsx — global KALİBRASİYA paneli (təklif varsa görünür)
```

### 3 saniyə qaydası (TabHero hesablama)
- **Stok:** kritik>0 → "N xammal tədarük tələb edir" + CTA "Nə Alım →" · mənfi>0 → "N mənfi
  stok qeydi var" + CTA "Sayım et →" · təzəlik>0 → warning · yoxsa → "Hamı normaldır" (ok).
- **Tədarük:** "N xammal sifariş olunmalı • Təxmini xərc ₼M".
- **Sayım & İtki:** "N kritik anomaliya açıqdır" → Anomaliyalar CTA / "Hamı uyğundur".
- **Analiz:** info-tone "Hesabat, trend və tam tarixçə".

### URL
`/admin/stock?view=stock|procurement|operations|analytics&sub=...` + LEGACY_VIEW_MAP
(intelligence/procurement→procurement:buy, po→procurement:orders, suppliers→procurement:suppliers,
counts/waste/returns→operations:*, report/audit→analytics:*, recipes→/admin/recipes).
ELEVATED_SUBS = orders/counts/returns/waste (superadmin/owner).

## E2E (r33 dark + r33b light, console 0)
- r33 (13 shot): 4/4 tab + bütün sub-pill-lər · dead-link PASS (Bənövşəyi soğan → Order Guide
  checkbox auto-check + scroll) · legacy `?view=po`/`?view=audit`/`?view=recipes` PASS ·
  KPI: Aşağı 0 / Kritik 7 / Mənfi 5 / Tazelik 0 · Order Guide 25 sətir.
- **r33 TAPINTI:** `?view=po` sub-u "Nə Alım"-a düşdü + sub-pill "2-ci click" → KÖK:
  `useAdminAuth().role` = `null` (undefined DƏYİL) → ilk render role-gate sub-un yedi.
  FIX: `elevatedVisible = !authChecked || isElevated` (optimistik) + auth-sonrası drop effect.
- r33b (4 shot): deep-link Sifarişlər active ✓ · single-click PASS ×3 · light: Stok/Tədarük/
  Audit oxunaq, **Order Guide dark-on-light ✓** (hardcoded-white kök aradan qalxdı).

## Səhifənin hal-hazırkı canlı məzmunu (E2E-görülən)
Stok hero: "7 xammal tədarük tələb edir" · Tədarük hero: "34 xammal sifariş olunmalı • ₼32" ·
Order Guide 25 sətir (avokado −1290g kimi nəfs stoklar par-a bərpa ilə) · Report: ₼228,209
val + ₼14,200 COGS · Audit: 4029.0 sərф / 1000.0 itki / 10021.0 tənzim / 11321.0 giriş.
(Əməliyyat rəqəmləri = DB-dən canlı; sayımdan sonra dəyişəcək.)

## Qalan / növbəti
- Owner GÖZLƏYİR: **sayım** (5 mənfi + 2 şişkin maddə) → Stok → hero CTA "Sayım et" → APPLY.
- §1d yeganə qalan zəif = multi-location (biznes qərarı).
- Inventarizasiya modalı (anbar sətiri → İnventarizasiya) = tək maddə üçün fiziki düzəliş;
  kütləvi = Sayım tab (count sheet). İki yol da canlıdır.
