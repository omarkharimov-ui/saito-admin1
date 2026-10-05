# HANDOFF 13k — Owner UX pass: 6 düzəliş (2026-10-05)

## Owner mandatı (söz-lə-söz, screenshot ilə)
> "navbar onlar kvadrat formadasdır pill formasina sal. yeni xammal ve xammal girişi ayrı
> buttonlar çox maneə olur. atdıgım şəkildəki 4 sablon kartı sil, yerine daha uyğun bir şey
> düşün. xammal modalları isə en axıra qədər açılan (eyni şəkildə gift-cards-da olan sidebar
> varsa ora qədər, yoxdursa tam açılan olsun). hazırda içi yaxşıdır lakin 4 dənə emeliyyat
> kartı çox sablon kimidir. tedarük çox zəifdir UX baxımından, hər şey bir arada. Nə Alım
> hər şey alt-alta, anlamaq çətindir — belki orada sütun istifadə edək, iki sütuna bölək:
> lazım olanlar sağda göstərilən, soldan sifariş draft yalnız teklifdir bu. faktura bilirik
> atanda işləyirmi. sifarişlər/tədarükçülər səhifəsi də çirkindir, şaxəsin hər modal/şəhifə
> ümumi berbatdır. sayım və analizdə də deməməyə ehtiyac yoxdur — ümid edirəm heçə bası
> başa düşdün."

## 13j (commit 6f6df4e) — content-layer foundation
`stock-ui.tsx` design system: Btn (solid/ghost/soft/danger/success · small · type/title) ·
Chip (ok/warn/crit/info/neutral + `light:`) · **DataTable\<T\>** (config cols, `__actions`,
`onRow`, `actionsWidth`) · Seg · Card · Stat · SearchInput · IconBtn · Field/fieldCls ·
**Modal** (shared spring, theme-surface) · SpinnerBlock.
- 6 content page cədvəlləri → DataTable (PO / counts / returns / audit / waste-standards)
- 8 hardcoded-dark modal → themed shared Modal
- RecipeConstructorModal light-mode fix (white-on-white)
- `globals.css`: `color-scheme: light` / `dark` → native select/date controls tema izləyir

Owner feedback: **"hazırda içi yaxşıdır"** → 13k UX düzəlişlərinə keçdi.

## 13k (commit 53eff96; 11 files, +646/−501)

### 6 nöqtə → 6 fix
| # | Owner şikayəti | Fix |
|---|---|---|
| 1 | navbar kvadrat → pill | Main 4-tab bar + **bütün** sub-pills `rounded-full` + sliding pill (`layoutId`, SPRING): `page.tsx`, `ProcurementHub`, `OperationsHub`, `AnalyticsHub`, `stock-ui Seg` |
| 2 | 2 CTA maneədir | "Yeni Xammal" = **ghost icon** (`+`, title) · "Xammal Girişi" = yeganə solid — `StockTab.tsx` |
| 3 | 4 template KPI kartı | **SİLİNDİ** → inline metrics strip: `34 xammal · 0 aşağı · 7 kritik · 5 mənfi · 0 ≤3g` (colored dots; kritik → `setFilter('critical')`, mənfi → `onNavigate('operations','counts')` = "Sayım et") |
| 4 | modallar en axıra qədər | **Full-height right drawer** (gift-cards pattern, app-sidebar kənarına; mobildə full-screen): `ModalShell` (StockTab — 4 xammal modalı birdəfə) + **yeni `Drawer`** komponenti (stock-ui) + InspectorPanel tam rewrite |
| 5 | 4 emeliyyat kartı sablon | InspectorPanel: 4 böyük kart → **compact 2×2 `h-11` icon+label row** (`tone` prop) |
| 6 | Tədarük zəif / Nə Alım alt-alta / Sifarişlər+Tədarükçülər çirkin / modallar berbat | **Nə Alım = 2 SÜTUN**: `lg:grid-cols-[5fr_7fr]` — sol **Təkliflər** (suggestion rows + auto-order notifs, `ArrowDownCircle` = sağda preselect) · sağ **"Lazım Olanlar · Sifariş Taslağı"** (OrderGuide, `autoSelectId` qorunur). Tədarükçülər: card grid → **DataTable** + detail/create/edit = **full-height Drawers** (detail-da 2×2 metrik + Məhsul Kataloqu CRUD + WhatsApp/Redaktə footer). Sifarişlər (13j DataTable). Hesabat: 3 valuation kartı → 1 `divide-x` stat bar. AZN → ₼ |

Sayım & Analiz = eyni design systemdən keçdi (13j/13k: DataTable, pill, theme vars, Drawer)
— ayrıca pass tələb etmədi (owner: "deməməyə ehtiyac yoxdur").

### E2E r34 (dark+light, 19 shot `e2e-shots/r34-*`) — **9/10 PASS, console 0**
- PASS: pill bars (main+sub), metrics strip, merged CTA, full-height drawers (stock-in /
  action / new-ingredient / history / inspector / supplier detail+form), Inspector 2×2 row,
  Nə Alım 2 sütun + preselect, Tədarükçülər table+drawer, Hesabat stat bar, light mode
  (dark-on-light ✓, native controls ✓)
- **FAIL = real backend bug (UI-də düzəldildi):** faktura upload → `POST /api/invoice-ocr`
  **HTTP 500** + **sükutla keçirdi** (error toast yox idi).
  - Kök: `.env`-də **GROQ_API_KEY YOXDUR** (yalnız `NEXT_PUBLIC_SUPABASE_ANON_KEY` +
    `SUPABASE_SERVICE_ROLE_KEY` var). OCR = GROQ llama-4-scout.
  - Eyni kök → `/api/inventory/advisor` `data_only:true` → AdvisorCard "hamı normaldır"
    deyib **aldatırdı** (5 mənfi stok varkən).
  - Fix: OCR non-ok → konkret toast (`GROQ_API_KEY` missing = "AI ərsaşi yoxdur — .env-ə
    əlavə edin"); AdvisorCard → honest fallback: "AI analizi aktiv deyil" + raw stats
    (tükənən / nəfs stok / tazəlik / itki / qiymət sürüşməsi).
  - Test fakturası: `e2e-shots/test-invoice-1005.png` (COCA COLA BAKU, 5 sətir, ₼68.10).

## Owner action (bloklanmış)
**`GROQ_API_KEY` .env-ə əlavə edilməlidir** → açar:
1. Faktura OCR (`/api/invoice-ocr`) — upload → item extrakt → DRAFT PO
2. AI Inventory Advisor kartları (`/api/inventory/advisor`)
3. Recipe kalibrasiya LLM delta (`/api/recipes/calibrate`)

UI artıq key yoxdurkən aldatmır (toast + honest fallback).

## Qalan (13i-dən daşılan)
- Sayım: 8 mənfi/şübhəli maddə (Avokado −1290, Qırmızı kələm −650, Bənövşəyi soğan −550,
  Sésam −190, Tofu −100, Doner əti 0, avakado 192000, Qızardılmış soğan 199460) —
  Stok tab → metrics strip "mənfi" → Sayım et
- §1d yeganə qalan zəif: **multi-location** (biznes qərarı)
- Monitoring: pooler transient 500 · Masa 2 (ORD-2959) owner test order board-da

## Dev
```
corepack pnpm --filter @workspace/saito-admin dev   # port 3000
tsc: corepack pnpm --filter @workspace/saito-admin exec tsc --noEmit | grep 'error TS' | grep -v 'src/__tests__/'
```
`.env` HEÇ VAXT commit olunmur (gitignored DEYİL — diqqət).
