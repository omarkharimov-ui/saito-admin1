# SAITO — PARKED + NÖVBƏTİ PLANLAR (2026-09-21, user qərarı ilə)

> Qaynaq: `MASTER_FEATURE_MAP.md` (canonical) + 2026-09-21 session qərarları.
> Bu fayl = "nə saxlanılır / nə növbədədir / nə missing-dir"ın birləşdirilmiş siyahısı.

---

## 1. PARKED — saxlanıldı, İNDİ YAPILMIR (user: "mənə hələ lazım deyil")

| # | Mövzu | Niyə park | Yenidən açılanda nə lazımdır |
|---|---|---|---|
| P-1 | **Kiosk** (self-order + payment + loyalty, Wave B #2) | User qərarı 2026-09-21: hələ lazımdır | Portrait 15.6–21.5" (9:16) = QSR standartı (araşdırma 09-21); responsive layout landscape-ə də; kiosk = ayrı surface (frozen W-A1/W-A2 contract-ları ilə) |
| P-2 | **Customer-facing upsell (kiosk-da)** | Upsell kiosk ilə birlikdə gəlir — ofisiant versiyasından ayrı dizayn (dil: "sən al" / cəlbedici, A/B variant) | Engine v2 artıq hazırdır (`/api/upsell/suggest` stateful, budget/cooldown) — kiosk yalnız yeni UI qatı |
| P-3 | **Staff POS upsell UI (son forma)** | Engine v2 shipped (`8732fdc2`), UI forması user co-design-da AÇIQ: A = predictive text bar (klaviatura kimi) / B = menyu gridində ✦ işarəsi / A+B | Seçilən variant 1 UI pass + E2E; engine/ro
<omitted chars="1985" />