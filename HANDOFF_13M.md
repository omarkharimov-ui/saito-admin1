# HANDOFF 13m — r36 browser audit defect sweep (2026-10-05)

## Owner mandatı (söz-lə-söz)
> "BUG hələ də var brat, sənçəni ux mənə buraxmırsan. Təkliflərini sən birinci
> brauzerdən bax, ən yarasaını tap. State machine transition, micro, button
> animasiya — məsələn bu səhifədə belə olsa belə yaxşı olacaq inventory.
> Birinci audit et brauzerdən bax, sonra təkliflərini bildir."
> → audit təqdim olundu → "təsdiq edərəm bütün"

## Commit
`2f0674a` — 16 files, pushed to main. E2E: r34 (13k, 19 shot) + r36 audit (23 shot,
`e2e-shots/r36-FINDINGS.md` D1–D20) + r37 verify, console 0, dark+light.

## 1. "Oynayır" KÖK-Ü (r36 tapıntısı)
13l `scrollTop` reset = yalnız SYMPTOM gizlədici. Real kök:
- tab bar **y:12 animated wrapper-in İÇƏRİSİNDƏ** idi → hər switch-də 225-427ms dead frame;
- tab content y-slide transition → iki animasiya üst-üstə.

**Fix:** tab bar animated wrapper-dan çıxarıldı (pixel-stable) + tab content =
instant `key={tab}` div (heç y-transition). Pill spring = yeganə motion.

## 2. Canonical formatters (`stock-ui.tsx` — TƏK MƏNBƏ)
| Helper | Nə etdi | Kök |
|---|---|---|
| `fmtNum(n, digits)` | comma thousands + dot decimal | ICU/locale variance: "192,000" vs "192000.0" vs "4029.0" eyni səhifədə (D9) |
| `fmtQty` | 1 decimal | "4029.0" |
| `fmtAZN` | `₼` + 2dp | "AZN" qalıqları + format |
| `fmtDate(iso, withTime)` | explicit `AZ_MONTHS = [yan,fev,mar,apr,may,iyn,iyl,avq,sen,okt,noy,dek]` | `toLocaleDateString('az',{month:'short'})` = **"M10"** (D10) |
| `fmtClock` / `fmtTime` | HH:MM / full | — |

Sweep: purchase-orders, counts, returns, audit, OrderGuide, Reports, StockTab, PO dates
"05 okt 26, 00:14" (M10 yoxdur).

## 3. COGS chart (D8 — "giant pink block")
Shared `max(cogs+waste)` scale → 1 outlier waste günü (Avokado 10-04) bütün digər
günləri ≈0 render etdi. Fix: **hər seri öz scale-i** (`maxCogs`/`maxWaste`), side-by-side
bars, legend "hər seri öz ölçəsidə", no clip.

## 4. State machine + honest loading
- **AdvisorCard** = skeleton reserve (fixed height — 154px layout shift ✂) + 13k:
  `data_only` fallback ("AI analizi aktiv deyil" — GROQ key yoxduqən raw stats;
  "hamı normaldır" 5 mənfi varkən ALDATICI idi).
- **Loading hero** = muted "Yüklənir…" — data-cümləsi YALNIZ data gəndə (honest).
- **OrderGuide** skeleton · **ViewFrame ViewContent** = FADE only 0.18s (y:10 ✂) ·
  embedded pages-dən (counts/returns/PO/audit) PageTransition ✂.

## 5. Defect sweep (D1–D20-dan)
- TableActionBar = themed (dark-only hardcoded idi) + pill filters.
- DRAFT PO chip light: `light:bg-emerald-600` (light-da görünmürdü).
- Inspector: `max-w-4xl`, delete button = content END (footorda yoxdu).
- `globals.css`: `color-scheme: light/dark` → native select/date controls tema izləyir.

## OPEN (owner)
- **GROQ_API_KEY .env-ə əlavə** — invoice OCR + AI advisor + recipe calibrate deaktiv
  (UI indi toast + honest fallback verir; sükut yoxdur).
- 13m-dən sonra owner: *"səni necə dəfə dedim ki 0-dan yenidən yaz"* → 13n rebuild.
