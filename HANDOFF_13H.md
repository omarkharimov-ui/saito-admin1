# HANDOFF 13h — Stok hub UI TAM REWRITE: Apple minimal frame (2026-10-05)

## Owner mandatı (söz-lə-söz)
> 13g: "ui yeniden yazaq hazirda apple felsefesi deyil yenikii. ui-de minimalliq istifade etmliyikde ... ve userin anlaycaigi qeder rahat olsun ... ve unutmuruqda apple felsefeimizi ona uygun edirik"
> 13h: "basla"

Mandat = inventory UI-nın **TAM REWRITE**-i: Apple felsefəsi + minimalliq + user rahatlığı. Backend toxunulmayıb (13a–13f-də hazır idi).

## 13h-A — Hub shell rewrite (`stock/page.tsx`)
**Əvvəl:** ağır "PRO INVENTORY" hero (icon chip + serif h1 + subtitle + ambient glow + KPI hero row).
**İndi (minimal frame):**
- Tiny uppercase overline **"Stok"** + **aktiv view-ə görə dəyişən** bold title (`activeChip.label`: Anbar/Sayım/Audit/…).
- **Segmented pill tab bar**: 10 chip (Anbar, Ağıllı Analiz, Tədarük, Alış Sifarişləri, Report, Tədarükçülər, Sayım, Qaytarış, İtki St., Audit) — `rounded-2xl bg-surface-soft border p-1` container, sliding pill `layoutId="hub-tab-pill"` + SPRING (12u KDS pattern).
- Anbar view-da header-də **yalnız** 2 action: "Yeni Xammal" (ghost) + "Xammal Girişi" (solid `bg-theme-text`).
- Anbar view-da: 4 KPI stat card (Xammal / Aşağı Stok / Kritik Bitən / Tədarükçü) + AdvisorCard + Anbar cədvəl.
- Role-gate qorunur: elevated chips (po/counts/returns/waste) `useAdminAuth()` ilə (superadmin/owner).
- `?view=` deep-link sync qorunur (router.replace).

## 13h-B — Nested view hero-strip (6 content + 4 tab component)
Hər nested view-dan silindi:
- own hero (icon chip + serif h1 + subtitle),
- `min-h-screen` / ambient-glow / `max-w-7xl` wrapper (hər biri səhifəni ayrı full-page kimi davranmaya məcbur edirdi),
- qalan hardcoded white (`light:` theme-də white-on-white riski),
- waste-standards `bg-[#080808]` hardcode (light-mode dark-bg bug — silindi).

Qorundu (incə `justify-end` toolbar + content):
- PO: "Yeni Sifariş" · Sayım: "Yeni Sayım" · Qaytarış: "Yeni Qaytarma" · İtki St.: "Yeni Standart" · Audit: overline "Stok dəyişikliklərinin tam tarixçəsi" + "Export".

Fayllar: `purchase-orders/purchase-orders-content.tsx`, `stock/counts/counts-content.tsx`, `stock/returns/returns-content.tsx`, `waste-standards/waste-standards-content.tsx`, `audit/audit-content.tsx`, + 4 tab (`ProcurementTab`, `ReportsTab`, `IntelligenceTab`, `AdvisorCard`) theme-var sweep.

## 13h-C — YENİ KÖK TAPINTI: Tailwind v4 `dark:` = MEDIA-BASED
**Problem (E2E r32c):** Audit stat kartlarının light-mode contrast fix-i (ilk cavab: `text-blue-600 dark:text-blue-400`) **light-da işləmədi** — computed color dark-da eyni qaldı.
**Kök:** Tailwind v4-ün builtin `dark:` varianti `prefers-color-scheme`-a (OS) baxır — app theme (`.light`/`.dark` on `<html>`) ilə HEÇ BAĞLANMIR. User OS dark idi → `dark:` həmişə aktiv.
**Fix (additive, globals.css):**
```css
@custom-variant light (&:where(.light, .light *));
```
Mövcud media-based `dark:` istifadələri (gift-cards, reservations, checklists) **toxunulmayıb**. Audit kartları indi: label `text-{c}-400/60 light:text-{c}-700` + value `text-{c}-400 light:text-{c}-600`.
**Verify (r32d, computed):** blue 6.83:1 · red 6.42:1 · amber 5.03:1 · emerald 5.36:1 — 4/4 ≥ 4.5:1.
**Lesson:** yeni light-mode fix-lərində HƏMİŞƏ `light:` variantını istifadə et (media `dark:`-ə güvənmə); E2E computed-color measurement = qısqac.

## E2E r32 + r32c/r32d (browser, dark+light, console 0)
- **r32 (13 shot):** 10/10 view yeni frame-də render (Anbar KPI+advisor+cədvəl · Intelligence 4 stat+rec cards · Procurement feed+Order Guide pill · PO 3 sətir · Report valuation 228,209 AZN+COGS+AvT · Suppliers · Counts empty · Returns 1 sətir · Waste empty · Audit overline+Export+4 card+rows).
- Sidebar: **2 giriş** (Stok + Reseptlər), duplicate YOX (22 nav link total).
- Deep-link: `?view=audit` → Audit active ✓ · `?view=recipes` → `/admin/recipes` redirect ✓ (standalone, own chrome).
- Light: anbar/audit/PO readable, white-on-white YOX.
- Console: dark 0, light 0 (yalnız info: React DevTools, HMR).
- Şəkillər: `e2e-shots/r32-*.png` (13) + `r32b-*` (2) + `r32c-*` (2) + `r32d-01-audit-light-final.png` + `r32-findings.md`.
- Feature loss: **YOX** — bütün action buttonlar (Yeni Sifariş/Sayım/Qaytarma/Standart/Export/Xammal/Girişi) canlı.

## Commit
`69209ff` — 11 files, +266/−311. `.env` toxunulmayıb (untracked qaldı).

## Qalan / növbəti
- §1d competitor zəiflərinin yeganə qalanı = **multi-location** (biznes qərarı).
- Owner GÖZLƏYİR: (1) sayım 8 mənfi/şübhəli maddə (Stok → Sayım chip → fiziki → APPLY) · (2) test-order consumption verify (owner hold).
