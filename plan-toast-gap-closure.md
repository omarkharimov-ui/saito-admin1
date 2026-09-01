# Toast POS vs Saito Admin — Staff Relations Gap Analysis & Implementation Plan

## Executive Summary
Saito Admin currently matches Toast at ~75% for staff/workforce features. This plan closes the remaining 25% gap with 9 focused workstreams, prioritized by business impact and UX coherence.

---

## Gap Categories

### 1. CRITICAL — Operations Blockers
| Feature | Toast Equivalent | Business Impact | Complexity |
|---------|------------------|-----------------|------------|
| Auto clock-out | Auto clock-out at 4 AM | Prevents forgotten open shifts, payroll errors | Low |
| Shift review + declared tips | Post-shift review flow | Tip compliance, accurate payroll | Medium |
| Job-based permission filter | Job-based access | Security, correct permissions at clock-in | Medium |
| Break adherence check | Real-time break eligibility | Labor compliance, missed break prevention | Low |

### 2. HIGH — Financial Accuracy
| Feature | Toast Equivalent | Business Impact | Complexity |
|---------|------------------|-----------------|------------|
| Declared cash tips | Cash tip declaration | Accurate tip reporting, tax compliance | Medium |
| Tip shortfall automation | Tip credit calculations | Minimum wage compliance | Medium |
| TipOut configuration UI | TipOut settings | Manager control over tip distribution | Low |

### 3. MEDIUM — Management Depth
| Feature | Toast Equivalent | Business Impact | Complexity |
|---------|------------------|-----------------|------------|
| SPLH (Sales Per Labor Hour) | Hourly sales report | Labor cost optimization | Low |
| Scheduled vs actual labor | Labor forecast vs actual | Scheduling accuracy | Medium |
| Multi-location permission hierarchy | Group + location overrides | Multi-unit management | High |

---

## Implementation Strategy

### UX Principle: Add to Existing Surfaces
- **NO new top-level pages** unless absolutely necessary
- **Add to Staff Detail Sheet** tabs (General, Time & Attendance, Financials, Security)
- **Extend Staff Directory** with new KPI chips and alerts
- **Add to POS shift-close flow** rather than creating separate review page
- **Use modals/drawers** for configuration (TipOut rules, break thresholds)

### Phase 1: Critical Operations (Week 1)
1. Auto clock-out (RPC + cron)
2. Break adherence check (API + UI indicator)
3. Job-based permission filter (clock-in middleware)

### Phase 2: Financial Accuracy (Week 2)
4. Declared tips flow (shift review modal)
5. Tip shortfall automation (RPC + report)
6. TipOut configuration UI (drawer in Financials tab)

### Phase 3: Management Depth (Week 3)
7. SPLH calculation (dashboard + staff cards)
8. Scheduled vs actual labor (Attendance tab extension)
9. Multi-location permission hierarchy (Roles page extension)

---

## Feature Specifications

### 1. Auto Clock-Out
**Where:** Background cron job
**Trigger:** Every day at 4:00 AM (configurable)
**Action:** Auto-close all open shifts from previous day
**UI:** Admin dashboard alert showing auto-closed shifts
**Config:** Settings → Operations → "Auto clock-out time"

### 2. Shift Review + Declared Tips
**Where:** POS flow (after clock-out) + Staff Detail Sheet (Time & Attendance tab)
**Flow:**
1. Employee clocks out → shift review modal appears
2. Shows: hours worked, sales, non-cash tips
3. Employee declares: cash tips, tip-out amounts
4. Manager can review/adjust before finalizing
**UI:** Modal with 3 sections: Hours → Tips → Summary

### 3. Job-Based Permission Filter
**Where:** API middleware (`lib/api-auth.ts`)
**Logic:**
- Staff has multiple jobs/roles
- On clock-in, active job determines effective permissions
- Override: manager can switch active job without re-clocking
**UI:** POS top bar shows active job with dropdown to switch

### 4. Break Adherence
**Where:** Time & Attendance tab + POS warning
**Logic:**
- Calculate eligible break times based on hours worked
- Real-time warning if employee misses break window
- Manager dashboard shows break compliance score
**UI:** Red/amber/green indicator on staff cards

### 5. Declared Tips
**Where:** Shift review modal (same as #2)
**Fields:**
- Declared cash tips (employee input)
- Declared tip-out (employee input)
- Manager verification/adjustment
**Storage:** `shifts.declared_cash_tips`, `shifts.declared_tip_out`

### 6. Tip Shortfall Automation
**Where:** Financials tab → Tips section
**Logic:**
- Calculate: (hours × minimum wage) vs (hours × tipped wage + tips)
- If shortfall exists, flag for manager
- Auto-export to payroll adjustment
**UI:** Tip shortfall alert + adjustment modal

### 7. TipOut Configuration
**Where:** Financials tab → TipOut settings (drawer)
**Config:**
- Role-based percentages (waiters 70%, bussers 30%, etc.)
- Hour-based vs sales-based distribution
- Minimum tip-out threshold
- Auto-distribute at shift end

### 8. SPLH (Sales Per Labor Hour)
**Where:** Staff Directory + Staff Detail → Overview
**Formula:** `total_revenue / total_hours_worked`
**Display:**
- Staff card: "₼XXX/SLH" chip
- Dashboard: Average SPLH trend
- Manager view: Per-employee SPLH ranking

### 9. Scheduled vs Actual Labor
**Where:** Attendance tab extension
**Display:**
- Side-by-side: Scheduled hours vs Actual hours
- Variance indicator (green/red)
- Cost impact: (variance × hourly rate)
**UI:** Table with 3 columns: Scheduled | Actual | Variance ($)

### 10. Multi-Location Permission Hierarchy
**Where:** Roles page → Advanced tab
**Logic:**
- Group-level permissions (base)
- Location-level overrides (add/remove)
- Effective permissions = group ∩ location
**UI:** Matrix with location columns, toggle per permission

---

## Migration Strategy

### Database Changes
- `shifts` table: add `declared_cash_tips`, `declared_tip_out`, `auto_closed`
- `shift_reviews` table: new (review_status, declared_tips, manager_approved)
- `tip_shortfalls` table: new (staff_id, period, shortfall_amount, resolved)
- `break_adherence` table: new (staff_id, shift_id, scheduled_break, actual_break, compliant)
- `settings` table: add `auto_clockout_time`, `tip_shortfall_enabled`

### API Routes
- `POST /api/shifts/auto-close` — cron trigger
- `POST /api/shifts/{id}/review` — shift review submission
- `POST /api/tips/shortfall` — calculate shortfall
- `GET /api/breaks/adherence` — real-time break compliance
- `POST /api/permissions/effective` — get effective permissions for staff

### UI Additions (No new pages)
- Staff Detail Sheet → Time & Attendance tab: +Shift Review section
- Staff Detail Sheet → Financials tab: +TipOut config drawer
- Staff Directory: +SPLH chips on role cards
- POS: +Active job selector in header
- Roles page: +Location override matrix

---

## Success Metrics
- [ ] All 10 features implemented and functional
- [ ] Zero new top-level pages added
- [ ] Typecheck passes with no new errors
- [ ] Dev server stable on port 3000
- [ ] Each feature has at least one UI indicator/alert
- [ ] All sensitive operations require manager approval

---

## Risk Mitigation
- **Feature creep:** Stick to spec, no "nice-to-haves"
- **UX overload:** Add features to existing surfaces, use drawers/modals
- **Performance:** Batch API calls, cache permission checks
- **Data integrity:** Use transactions for tip/shift updates
