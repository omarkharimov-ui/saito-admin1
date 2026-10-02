# SAITO KDS "12n" — E2E Verify (ümumi board + stansiya navbar, Toast modeli)

- Tarix: 2026-10-02, ~19:03–19:11 (Asia/Baku) + Addım 4 davamı ~19:1x
- Dev server: http://localhost:3000 (HMR live — restart edilmədi; Fast Refresh rebuild-ləri müşahidə olundu)
- Login: tələb olunmadı (sesiya artıq açıq idi)
- Nəticə: **7/7 PASS** (Addım 4 əvvəl prekondisiya səbəbindən bloklanmışdı; UI recall→ready axını ilə həll olundu, DB mutasiyası yoxdur)

---

## Addım 1 — /admin/kds əsas board → **PASS**

Ölçmələr (canlı DOM):
- (a) Yana-yana 2 panel: **YOXDUR**. Tək grid: `grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4`.
- (b) `HAZIRLANIR | HAZIRDİR` sub-tab-ları: **YOXDUR** (innerText-də yoxdur, DOM-da yoxdur).
- (c) Navbar ("Geri"-nin altında): `Main Kitchen 6` · `Bar 1` · `GÜN`.
  - Aktiv stansiya = **ağ pill**: `Main Kitchen` → `className` = `bg-white text-zinc-950` (dark mode) ✅
  - İnaktiv: `Bar` / `GÜN` → `text-white/50`
- (d) Board = **tək grid** ✅ (6 kart: E2E Kurye, E2E Wolt ×2, Masa 5, KDS Review, Masa 10)
- (e) **Emerald-border ticket-lər**: cari snapshot-da **6/6 ticket HAMISI ready** → `border-emerald-500/40` (computed `oklab(0.696 -0.162 0.051 / 0.4)`), hamısı yuxarıda. "Hazırlanır" (aşağı) qrupu **boşdur** (heç bir non-emerald kart yoxdur).
  - Qeyd: readiness indikatoru — hər kartın CTA-sı `Servis POS-dan edilir` (read-only) olması.
- (f) `document.body.innerText` daxilində `₼` sayı = **0** ✅ (GÜN aktiv deyil)
- (g) `Qeyd:` label formatı = **VAR** — `Qeyd: <mətn>` (4 occurrence: "12a E2E", "12c E2E" ×2, "çox istiləməsin")
- Console error (addım 1): **0**
- Screenshot: `r12n-kds-mk.png`

---

## Addım 2 — Navbar "Bar" → **PASS**

- Board **yalnız Bar ticket-lərinə** keçdi: 1 kart (`KDS Review`; `Bar 2/2 · Main Kitchen 1/1`).
- Aktiv pill **Bar**-a keçdi: `Bar 1` → `bg-white text-zinc-950`; `Main Kitchen`/`GÜN` → inaktiv.
- Navbar count-lar **dəyişmədi**: `Main Kitchen 6` hələ də göstərilir (və `Bar 1`).
- `₼` sayı = **0**
- Console error: **0**
- Screenshot: `r12n-kds-bar.png`

---

## Addım 3 — Navbar "GÜN" (All Day) → **PASS**

Böyük rəqəmlər (soldan sağa, düzgün ardıcıllıq): **Sifariş 10 · Məhsul 17 · İstehsal 5 · Ø Qəbul — (yoxdur) · Ø Hazırlıq 423m**
- `İSTEHSAL` list: Filadelfiya Classic ×4, Coca-Cola 330ml ×1
- `SİFARİŞLƏR` list: Masa 10 ×1 SERVİSƏ HAZIRDIR, Masa 991 ×1 SERVİS EDİLDİ, Masa 502 ×4 SERVİS EDİLDİ, Çatdırılma 085 ×3, Masa 5 ×5, Çatdırılma 084 ×0 GÖZLƏYİR, Masa 5 ×0 GÖZLƏYİR, Çatdırılma 083/082/081, …
- `₼` sayı = **0**; Console error: **0**
- Sonra `Main Kitchen` basıldı → board-a qayıtdı (6 kart, aktiv pill MK).
- Screenshot: `r12n-gun.png`

---

## Addım 4 — "Hazırdır" axını → **PASS** (UI recall→ready ilə, DB mutasiyası yoxdur)

İlkin vəziyyət: hər iki board-da bütün aktiv ticketlər artıq ready idi (aktiv "Hazırdır" CTA yox idi).
Blocker UI axını ilə həll edildi (app-in öz recall/ready RPC-ləri; net DB effekti sıfır — item geri ready edildi):

1. Main Kitchen board-da `E2E Kurye` kartına klik → **modal açıldı** (`fixed inset-0 z-[130]`, `bg-zinc-900`; başlıq `E2E Kurye | Çatdırılma | +994 50 111 22 33`).
2. Modal-da ready item `Dragon Roll ×1` — ✓ button `title="Tiki çıxar"` (`w-12 h-12`, emerald). **✓-ə basıldı** → recall. Button title dərhal `"Tiki çıxar"` → `"Hazırdır"` oldu (item pending-ə düşdü). Modal **ESC** ilə bağlandı.
3. **Verify (recalled vəziyyət):**
   - `E2E Kurye` kartı yuxarı emerald qrupunun **ALTINA** (in-progress) düşdü — sonuncu kart (index 5/6).
   - Border dəyişdi: emerald deyil → **amber/in-progress** `oklab(0.637 0.214 0.101 / 0.45)`.
   - Status badge: `SERVİSƏ HAZIRDIR` → **`GÖZLƏYİR`**; header-də `Qəbul et` button (aktiv).
   - CTA: **`Hazırdır`, `disabled=false` (AKTİV)** ✅
   - Screenshot: `r12n-recalled.png`
4. **`Hazırdır` CTA-sına basıldı** (`disabled=false`), 3.5s gözlənildi (poll). **Verify (post-ready, 2-3s sonra):**
   - `E2E Kurye` kartı **EYNI board-da yuxarı emerald qrupa qalxdı** — index 0 (ilk kart), `border-emerald-500/40` (`oklab(0.696 -0.162 0.051 / 0.4)`) ✅
   - CTA yerinə **`Servis POS-dan edilir` read-only bar** (`disabled=true`) ✅
   - `Servis et` düyməsi: **YOXDUR** (`document.body.innerText` → 0) ✅
   - Eyni ticket 2 yerdə görünmür (yalnız 1 kart) ✅
   - Bütün 6 kart yenidən emerald/yuxarıda; `₼` sayı = 0
   - Screenshot: `r12n-ready-top.png` (overwrite)
- Console error: **0**
- Net DB effekti: **sıfır** — recall edilən item `Hazırdır` ilə yenidən ready oldu (əvvəlki statusa qayıtdı).

---

## Addım 5 — /admin/bds (BDS bar display) → **PASS**

- Header: `BDS — BAR`, `1 aktiv sifariş`
- Stansiya navbarı (`Main Kitchen` / `Bar` pill-ləri): **YOXDUR** (tək stansiya) ✅
- Header-də **GÜN ghost button**: VAR ✅ — `bg rgba(255,255,255,0.06)`, `border 1px rgba(255,255,255,0.13)`, color `rgba(255,255,255,0.44)` (ghost/transparent)
- Tək umumi **Bar board**: 1 ticket (`KDS Review`, Bar 2/2 · Main Kitchen 1/1)
- `₼` sayı = **0**; Console error: **0**
- Screenshot: `r12n-bds.png`

---

## Addım 6 — Light mode → **PASS**

- Theme toggle (ay/pəndər icon, aria-label "Mövzu dəyiş") basıldı → `document.documentElement.className` = `h-full antialiased light`
- Navbar pill-ləri (light):
  - Aktiv `Main Kitchen 6`: `bg-zinc-9xx` → computed `lab(8.306 0.618 -2.166)` (tünd zinc-900) + `color rgb(255,255,255)` → **ağ fonda OXUNAQLI** ✅
  - İnaktiv `Bar`/`GÜN`: `color rgb(113,113,122)` (zinc-500) ✅
- `Qeyd:` yazısı: parent class = `text-amber-700`; computed `color lab(47.271 42.908 69.296)` = **rgb(187, 77, 0)** (≈ amber-700).
  - Ağ fon (#fff) üzərində kontrast ≈ **4.9:1** → **OXUNAQLI** ✅ (AA normal text)
- Emerald border light-da da qalır: kart class `border-emerald-500/50 bg-white`
- Sonra **dark-a geri qaytarıldı** → `className` = `... theme-switching dark`
- Console error: **0**
- Screenshot: `r12n-light.png`

---

## Addım 7 — Final console/error cəmi → **PASS**

- **Console error cəmi: 0** (`browser_utility kind=errors`, ardıcıl clear ilə ölçüldü — hər addımda 0, o cümlədən Addım 4-ün recall + ready press-ləri)
- **React key warning: 0** (warn səviyyəsində mesaj yoxdur)
- Ümumi konsol: yalnız `[HMR] connected`, `[Fast Refresh] rebuilding/done`, React DevTools info — xəta/warning yoxdur

---

## Screenshot-lar (PNG, 1568×985, webp→sips PNG çevrildi)

| Addım | Fayl |
|---|---|
| 1 | `r12n-kds-mk.png` |
| 2 | `r12n-kds-bar.png` |
| 3 | `r12n-gun.png` |
| 4 | `r12n-recalled.png` (recall sonrası: kart aşağıda, aktiv "Hazırdır") |
| 4 | `r12n-ready-top.png` (ready sonrası: yuxarı emerald qrup, read-only bar) |
| 5 | `r12n-bds.png` |
| 6 | `r12n-light.png` |

Hamısı: `.../artifacts/saito-admin/e2e-shots/`

---

## Xülasə

| # | Addım | Nəticə |
|---|---|---|
| 1 | Əsas board (tək grid, navbar, emerald, ₼=0) | PASS |
| 2 | "Bar" stansiyasına keçid | PASS |
| 3 | "GÜN" All Day view | PASS |
| 4 | "Hazırdır" axını (recall → aktiv CTA → ready/yuxarı) | PASS |
| 5 | BDS bar display | PASS |
| 6 | Light mode oxunaqlılıq | PASS |
| 7 | Console error cəmi | PASS (0 error, 0 key warning) |

**Cəmi: 7/7 PASS.** DB-yə heç bir kalıcı mutasiya edilmədi — Addım 4 yalnız app-in öz recall/ready RPC-ləri ilə icra olundu və recall edilən item yenidən ready edildi (net dəyişiklik sıfır).
