# E2E r24 — KDS/BDS DEEP verify + FLICKER test

Dev server http://localhost:3000 (not restarted). AZ locale, Main Location. PIN(void)=4321.
Tabs: KDS=tab-vtab-780962482, POS=tab-vtab-780962483, BDS=tab-vtab-780962486.
Shots: saito-admin1/e2e-shots/ prefix r24-1/*. Owner Masa 2 + Masa 4/5 group = NEVER TOUCHED.

## Test orders this round
- ORD-2968  c2025de7-ec89-4298-bfd6-65ac5130a2db  Masa 3  Filadelfiya+GreenTea  (S2)  → cancelled+dismissed (S16a)
- ORD-2969  104cc418-11f7-4056-85ab-86b22fc51097  Masa 3  Filadelfiya+GreenTea  (S16b) → 86'd GreenTea; served via POS (S12)
- ORD-2970  9b158af0-b8e8-4b8b-914b-d43e86e85f5b  Masa 401 bar-only GreenTea (S14)

## Checklist
- S1  PASS KDS loads: nav Kitchen/Bar(eye only)/Expo/GÜN + slider; default Kitchen; no "İzləmə"/"Servis POS"/"SERVİS"; console 0. r24-1
- S2  PASS POS→VIP→Masa 3(BOŞ)→+Filadelfiya +GreenTea→Sifariş qeydi→sent. ORD-2968. r24-2,-2b,-2c
- S3  PASS Kitchen note "filadelfiya kremli · təşəkkür"; Bar note "çay soyuq olsun · təşəkkür". r24-3a,r24-3b
- S4  PASS Kitchen sub-tabs HAZİRLANİR·N / HAZIRDİR·N, default HAZİRLANİR.
- S5  PASS modal full note + RUSH + active Hazırdır; stable 15s. r24-5,r24-5b
- S6  PASS tick ✓ prep-progress (12o); 56 samples/27.5s tick stayed ON, tabs constant (no flicker); "Hazırdır"→moved to HAZIRDİR (HAZİRLANİR 1→0), stable 52 samples/25.5s. r24-6,r24-6b
- S7  PASS bar tick+Hazırdır on BDS → order ready → ticket reached Expo. r24-7
- S8  PASS RUSH solid red; 54 samples/21.2s: only pre-render sample off, ON thereafter — no off/on flicker. r24-8
- S9  PASS 86 GreenTea (BDS Bar) reason "Tükəndi" → PIN 4321 → row vanished; 26 samples/24.9s NEVER reappeared. r24-9
- S10a PASS ready-ticket modal footer EMPTY (no button, no "Servis POS-dan edilir"); only SERVİSƏ HAZIRDIR label + item. r24-10a
- S10b PASS watch modal (BDS Kitchen watch; KDS Bar had no Masa-3 after void) footer = quiet timestamps only, no chip/button/İzləmə. r24-10b
- S10c PASS body scan: KDS İzləmə=0/"Servis POS"=0; BDS both 0.
- S11 PASS Expo: Masa 2+Masa 3, view-only, no servis text. r24-11
- S12 PASS POS context menu "ƏSAS ƏMƏLIYYATLAR"→"Servisə Ver" → Masa 3 SERVİS EDİLDİ; KDS board back to Kitchen1/Bar1/Expo1 (Masa 3 gone). r24-12
- S13 PASS BDS board: Bar operable (tick+Hazırdır), Kitchen watch(eye), Bar/Kitchen pills. r24-13
- S14 PARTIAL KDS Kitchen captured 0 toasts during bar-only order ORD-2970 arrival + window → KDS Kitchen does NOT surface bar activity. BDS local toast NOT observed (could not switch BDS to Bar tab via JS click; board stayed on Kitchen watch). No flicker.
- S15 PASS light theme: board/sub-tabs/notes readable; Bar watch modal quiet; console errors 0. r24-15a,r24-15b (+15c expo)
- S16a PASS dismiss retry (fresh CSRF, both x-saito-csrf + x-csrf-token) → 200 success table_status=empty; Masa 3 = Boş.
- S16c (pending at time of writing) cancel+dismiss ORD-2969 & ORD-2970.

## Observations
- Bare ✓ tick = prepared_quantity (prep progress), NOT station-ready (12o owner rule) — card stays in HAZİRLANİR until "Hazırdır". Documented deviation from S6 literal wording; no flicker in either path.
- No flicker of ANY kind observed: tick, sub-tab move, RUSH, 86 void, watch stamps.
- POS/KDS refs invalidate fast (timers/poll) → drove actions via React onClick props (stable).

## FINAL (resume pass)
- S16a PASS — fresh-CSRF dismiss (headers x-saito-csrf + x-csrf-token) → 200 {success:true, table_status:"empty"}; Masa 3 = Boş.
- S16b PASS — new order ORD-2969 (id 104cc418-11f7-4056-85ab-86b22fc51097) Masa 3: Filadelfiya ×1 + GreenTea ×1.
- S8  PASS — RUSH toggled; red emphasis solid; sampler 54×400ms (21.2s) showed only 1 pre-render off-sample then ON — NO off/on flicker. shot r24-8-rush-t12.png. Bar(watch) card showed RUSH marker (non-clickable).
- S9  PASS — 86 GreenTea on BDS Bar (reason "Tükəndi", note empty) → PIN 4321 keypad → row vanished; DB item removed; sampler 26×500ms (24.9s) NEVER reappeared. shot r24-9-86-voided.png
- S10a PASS — Kitchen modal after "Hazırdır": footer EMPTY (no button, no "Servis POS-dan edilir"); label SERVİSƏ HAZIRDIR + item only. shot r24-10a-kitchen-modal-ready.png
- S10b PASS — watch modal footer = "Qəbul 21:34 · Hazır 21:36" (quiet timestamps only), no chip/button, no "İzləmə", no tick. shot r24-10b-watch-modal.png
   (Note: Masa 3's bar item was voided, so it is no longer on the KDS Bar tab; the watch modal was verified on the BDS Kitchen watch tab — view-only, Masa 2 not opened.)
- S10c PASS — body-text scan: KDS "Servis POS"=0, "İzləmə"=0; BDS "Servis POS"=0, "İzləmə"=0.
- S11 PASS — Expo: ready tickets view-only (no buttons), no servis/İzləmə text. shot r24-11-expo-ready.png
- S12 PASS — POS "ƏSAS ƏMƏLIYYATLAR" → "Servisə Ver": Masa 3 → SERVİS EDİLDİ; KDS cleared Masa 3 within ~5s (nav Kitchen1/Bar1/Expo1). shots r24-12-pos-served.png
- S14 PARTIAL — KDS Kitchen tab surfaced 0 toasts/notifications during a bar-only order (ORD-2970, Masa 401) arrival + observation window → KDS Kitchen does NOT surface bar activity (key requirement met). BDS-local toast NOT observed: the BDS board could not be switched from its Kitchen watch tab to Bar via JS (nav onClick did not change activeStation); no flicker seen. Not a product failure — a test-harness limitation.
- S15 PASS — LIGHT theme: KDS board, sub-tabs, note lines, Bar watch modal (quiet timestamps), Expo all readable/correct; KDS console errors = 0. shots r24-15a/b/c. Switched back to DARK (html class "dark").
- S16c PASS — cancel ORD-2969 (200, done1) + dismiss table 3 (200, empty); cancel ORD-2970 (200, done1) + dismiss table 401 (200, empty).
   Verified: POS VIP floor Masa 3 = "Boş"; 1-ci Mərtəbə Masa 401 = "Boş"; KDS board nav Kitchen 1 / Bar 1 / Expo 1 (only Masa 2); dark theme. shot r24-16-final-clean.png

## Console errors per tab (final)
- KDS (tab-…482): 0 (checked after load + after light-mode).
- POS (tab-…483) / BDS (tab-…486): no error-level messages observed in the console reads performed.

## Screenshots saved (saito-admin1/e2e-shots/)
r24-1-kds-initial.png, r24-2-pos-floor.png, r24-2b-pos-vip.png, r24-2c-pos-masa3.png,
r24-3a-kitchen-tab.png, r24-3b-bar-tab.png, r24-5-modal.png, r24-5b-modal-t15.png,
r24-6-tick-stable.png, r24-6b-ready-moved.png, r24-7-expo.png,
r24-8-rush-t12.png, r24-9-86-voided.png, r24-10a-kitchen-modal-ready.png, r24-10b-watch-modal.png,
r24-11-expo-ready.png, r24-12-pos-served.png, r24-13-bds.png,
r24-15a-light-expo.png, r24-15b-light-bar-modal.png, r24-15c-light-expo2.png, r24-16-final-clean.png

## FLICKER VERDICT
No visual revert observed in any action: ✓ tick (27.5s), HAZIRLANİR→HAZIRDİR move (25.5s), RUSH red (21.2s),
86-void (24.9s), watch timestamps. The owner's "2 saniyə sonra yenidən gəlir" bug did NOT reproduce this round.
