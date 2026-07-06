---
inclusion: manual
---

# Software Requirements Specification
## CliniGrowth — Neonatal & Pediatric Growth Charting Platform

**Document Version:** 1.0  
**Date:** July 6, 2026  
**Status:** Draft  

---

## 1. Introduction

### 1.1 Purpose
This SRS defines the functional and non-functional requirements for CliniGrowth, a web-based clinical growth charting tool for neonatal and pediatric patients. It is intended as a reference for developers, clinical stakeholders, and QA engineers.

### 1.2 Scope
CliniGrowth enables clinicians to:
- Look up a patient by MRN (Medical Record Number) to auto-populate all historical growth data from the connected hospital database.
- Manually enter or edit patient demographics and serial growth measurements.
- Visualise growth trajectories on WHO and Fenton reference charts, with automatic chart selection based on corrected gestational age (CGA).
- Export charts and audit logs as PDFs.
- Track developmental screening (TDSC).

The system is a single-page React application (Vite + TypeScript) running in the browser, connecting to the hospital's existing patient database via a backend API.

### 1.3 Definitions & Abbreviations
| Term | Definition |
|---|---|
| CGA | Corrected Gestational Age — GA at birth + postnatal weeks |
| GA | Gestational Age in weeks |
| MRN | Medical Record Number — unique hospital patient identifier |
| Fenton 2013 | Preterm growth reference chart (Fenton TR, Kim JH, 2013) for 22–50w CGA |
| WHO | World Health Organisation Child Growth Standards (0–5 years) |
| p3/p50/p97 | 3rd / 50th / 97th percentile bands |
| TDSC | Trivandrum Developmental Screening Chart |
| SRS | Software Requirements Specification |

---

## 2. Overall Description

### 2.1 Product Perspective
CliniGrowth is a module within the broader CliniGrowth suite. The growth charting module connects to the hospital's existing Electronic Medical Record (EMR) database to pull live patient data. It operates as a frontend-heavy React SPA; all sensitive data remains within the hospital network.

### 2.2 System Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│                     Browser (React SPA)               │
│                                                        │
│  ┌──────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │ Navbar   │  │ GrowchartCtx│  │  LocalStorage   │  │
│  └──────────┘  └──────┬──────┘  └─────────────────┘  │
│                        │                               │
│  ┌─────────────────────┼──────────────────────────┐   │
│  │  /   GrowChart      │  (Patient form + charts)  │   │
│  │  /detail            │  (WHO detail view)        │   │
│  │  /TDSC3yrs          │  (Developmental screen)   │   │
│  └─────────────────────┴──────────────────────────┘   │
└──────────────────────┬───────────────────────────────┘
                        │  HTTPS / REST or GraphQL
                        ▼
          ┌─────────────────────────┐
          │   Hospital Backend API  │
          │  (EMR / HIS Database)   │
          └─────────────────────────┘
```

### 2.3 User Classes
| Role | Description |
|---|---|
| Neonatologist / Pediatrician | Primary user; enters measurements, reviews charts |
| Nurse / Midwife | Enters measurements, reads charts |
| Data Entry Clerk | Enters visits, MRN lookup |
| System Administrator | Manages access, configures API endpoint |

---

## 3. Functional Requirements

### 3.1 MRN Lookup & Database Integration

#### FR-DB-01 — MRN Search Field
The Patient Info form SHALL include a prominent "MRN" input field as the **first field shown**.  
When a valid MRN is entered and confirmed (Enter key or blur), the system SHALL query the hospital database API and auto-populate:
- Patient full name
- Date of birth
- Biological sex
- Gestational age at birth (weeks)
- All historical visit records (date, weight, length, head circumference)

#### FR-DB-02 — Real-time Sync
The system SHALL keep growth data in sync with the latest database records. If the patient record has been updated since the last load (e.g., a new measurement was entered in the EMR), the system SHALL detect the change (via polling or WebSocket) and offer to refresh without losing any unsaved local edits.

#### FR-DB-03 — Offline / Fallback Mode
If the database is unreachable, the system SHALL fall back to the data cached in `localStorage` and display a clear warning banner: *"Working offline — showing cached data."*

#### FR-DB-04 — New Patient (Manual Entry)
If no MRN match is found, the user SHALL be able to continue with manual entry. All fields remain editable.

#### FR-DB-05 — Data Conflict Resolution
If a clinician has edited a field locally AND the database has a different value for the same field, the system SHALL surface a diff and ask which value to keep.

#### FR-DB-06 — Write-Back (Optional Phase 2)
New visit measurements entered in CliniGrowth SHOULD be writable back to the EMR via the API, subject to user permission and authentication level.

---

### 3.2 Patient Information Form

#### FR-FORM-01 — Sequential Field Reveal (GSAP)
The Patient Info form SHALL reveal fields one at a time using GSAP animations:
1. MRN field (first, always)
2. Patient Name (revealed after MRN step completes)
3. Date of Birth (revealed after name is entered)
4. GA at Birth (revealed after DOB is set)
5. Gender (revealed after GA is entered)
6. Fenton split week (revealed after gender is selected)

Each field SHALL animate in (fade + slide up) and the previous completed field SHALL collapse/slide up to a compact summary line. The user SHALL be able to click any summary line to expand and edit that step.

#### FR-FORM-02 — Validation Before Advance
The form SHALL not advance to the next field until the current field has a valid value:
- MRN: non-empty string (or explicit "skip" for manual entry)
- DOB: valid calendar date, not in the future
- GA at Birth: integer 22–44
- Gender: one of { male, female }
- Fenton split week: integer 22–50

Invalid input SHALL trigger a shake animation and inline error message. The "Next" affordance (Enter key or Continue button) SHALL be disabled while the field is invalid.

#### FR-FORM-03 — Back Navigation
A "Back" button SHALL be visible on every step after the first. Pressing Back SHALL animate the current field out and restore the previous field to editable state, preserving the value already entered. No data SHALL be lost on back navigation.

#### FR-FORM-04 — Keyboard Accessibility
- Each field SHALL be reachable via Tab.
- Enter key SHALL advance to the next step when the current value is valid.
- Escape key SHALL not close the form.
- All buttons SHALL have visible focus styles.
- ARIA labels SHALL be applied to all inputs and navigation buttons.

#### FR-FORM-05 — Collapse / Expand Sidebar
The form panel SHALL support collapsing to a narrow icon strip (≤ 44 px) via the existing collapse toggle, which SHALL work at any step of the sequential form without resetting progress.

---

### 3.3 Visit Data Entry

#### FR-VISIT-01 — Add Visit
Users SHALL be able to add an unlimited number of visit records, each containing:
- Date (date picker, min = DOB, max = today)
- Auto-calculated Corrected GA (display only)
- Length / height (cm, numeric)
- Weight (kg, numeric, step 0.001)
- Head circumference (cm, numeric, max 55 cm)

#### FR-VISIT-02 — Historical Visits from Database
When a patient is loaded via MRN (FR-DB-01), all historical visit records SHALL be pre-populated automatically. Each historical record SHALL be visually distinguished from newly added manual entries (e.g., a database icon or badge).

#### FR-VISIT-03 — Visit Validation
- Head circumference > 55 cm SHALL show an inline error and shake animation.
- Weight and length SHALL be positive numbers only.
- Visit date before DOB SHALL not be accepted.

#### FR-VISIT-04 — Remove Visit
Any visit (except the last remaining one) can be removed with an animated slide-out.

---

### 3.4 Chart Rendering

#### FR-CHART-01 — Fenton Chart (CGA ≤ split week)
All patient visits where the corrected GA is **at or below the configured split week** (default 50w) SHALL be plotted on the Fenton 2013 preterm growth chart:
- Reference percentile bands: p3, p15, p50, p85, p97 for Weight, Length, Head Circumference
- Patient data points colour-coded: green (length), red (head circ), yellow (weight)
- On-chart value callout labels per point
- Dual Y-axis: centimetres (left & right) and kilograms (left & right), sharing the same grid mesh
- X-axis: gestational weeks 22 → split week (dynamic)

#### FR-CHART-02 — WHO Chart (CGA > split week)
All patient visits where the corrected GA is **above the configured split week** SHALL be plotted on the WHO Child Growth Standards charts:
- Separate sub-charts per metric: Length, Weight, Head Circumference
- X-axis: "Term" label at 40w, then age milestones (2m, 4m, … 10m per year) up to 5 years
- Reference bands: boys and girls (toggleable)
- Metric filter: All / Length / Weight / Head Circ.

#### FR-CHART-03 — Chart Separation Rule
The split point between Fenton and WHO SHALL be configurable by the user (22–50 weeks). The default SHALL be 50 weeks CGA. This rule reflects clinical practice: Fenton is used for preterm growth monitoring; WHO is used from term age onward.

#### FR-CHART-04 — Historical Data Overlay
When a patient is loaded via MRN, **all past visit measurements SHALL be plotted automatically** on the appropriate chart (Fenton for CGA ≤ split, WHO for CGA > split) without requiring the user to re-enter any data.

#### FR-CHART-05 — Patient Badge
When `plotted = true`, a compact patient summary badge SHALL appear in the chart header showing: name, gender symbol, DOB, and GA at birth.

#### FR-CHART-06 — PDF Export
Each chart section SHALL provide a "GET PDF" button that exports the chart canvas as a PDF file. The audit log table SHALL export as a native text-based PDF (not a screenshot).

---

### 3.5 Historical Audit Logs

#### FR-AUDIT-01 — Audit Table
Below the WHO charts, a table SHALL display ALL visit records (from both the Fenton and WHO date ranges), sorted chronologically, showing: entry index, age/date, weight, length/height, head circumference.

#### FR-AUDIT-02 — Source Indicator
Rows originating from the connected database SHALL be marked with a source indicator (e.g., a small database icon).

---

### 3.6 TDSC Developmental Screening

#### FR-TDSC-01
The `/TDSC3yrs` route SHALL render the Trivandrum Developmental Screening Chart for ages 0–3 years.

#### FR-TDSC-02
TDSC milestone marks SHALL be associated with specific visits via `TDSCMarks` (already defined in `GrowchartContext`), and SHALL be pre-populated from database data when a patient is loaded by MRN.

---

## 4. Non-Functional Requirements

### NFR-01 — Performance
- Initial page load: ≤ 2 seconds on a standard hospital LAN connection.
- MRN database lookup: ≤ 1 second response; loading indicator shown after 300 ms.
- Chart re-render after adding a visit: ≤ 200 ms.

### NFR-02 — Accessibility (WCAG 2.1 AA)
- Colour contrast ratio ≥ 4.5:1 for all text.
- All interactive elements operable via keyboard.
- ARIA roles and labels on all form inputs, buttons, and chart containers.
- Note: Full WCAG compliance requires manual testing with assistive technologies.

### NFR-03 — Security
- All API communication to the hospital backend SHALL use HTTPS.
- No patient PII SHALL be stored in `localStorage` beyond the current session's working draft; or if stored, it SHALL be encrypted at rest.
- Authentication to the backend API SHALL use the hospital's existing SSO / OAuth2 mechanism.
- The browser app SHALL never transmit raw patient data to any third-party service.

### NFR-04 — Responsiveness
- The layout SHALL adapt to screen widths ≥ 1024 px (primary clinical workstations).
- Below 1024 px, the form panel and chart panel SHALL stack vertically.
- The collapsible sidebar SHALL function correctly on all supported widths.

### NFR-05 — Browser Support
- Supported: Chrome 120+, Edge 120+, Firefox 120+, Safari 17+.
- IE and legacy Edge are not supported.

### NFR-06 — Data Integrity
- All arithmetic (CGA calculation, percentile interpolation) SHALL use the formulas already implemented (`cgaWeek`, `interpolate`) without modification.
- Reference data (Fenton 2013, WHO 2006) SHALL remain static in `referenceData.ts` and SHALL NOT be editable at runtime.

---

## 5. System Constraints

- The frontend is built with React 19, TypeScript, Vite 8, GSAP 3, Chart.js 4, react-chartjs-2 5, react-datepicker 9, and jsPDF 4.
- No backend server is currently included in this repository; the API integration is a planned extension.
- TDSC data model (`TDSCMarks`) is partially implemented in context; full chart logic lives in `TDSCChartManager` (not detailed here).
- `GrowchartDetail.tsx` currently maintains its own independent localStorage state; it SHALL eventually be unified with `GrowchartContext`.
- `HybridFentonWhoChart.tsx` exists but is not yet routed; it is a candidate for replacing the separate Fenton + WHO rendering in `growchart.tsx`.

---

## 6. Data Flow (As-Built + Planned Extensions)

```
[Clinician opens app]
        │
        ▼
[MRN Entry Field] ──→ [API: GET /patients/{mrn}]
        │                       │
        │               ┌───────┴──────────┐
        │               │  Patient Record   │
        │               │  + Visit History  │
        │               └───────┬──────────┘
        ▼                       ▼
[Auto-populate form]  ← [GrowchartContext.setPatient()]
[Auto-populate visits]         │
        │                      │
        ▼                      ▼
[User reviews / edits]    [localStorage sync]
        │
        ▼
[handlePlot()]
   buildChartData(visits, dob, gaAtBirth, gender)
        │
        ├── visits.filter(cga ≤ splitWeek)  → FentonChart
        └── visits.filter(cga >  splitWeek)  → WHOChartMini
                                                  └── AllPatientData → AuditTable
```

---

## 7. Future Scope (Phase 2)

| Feature | Priority |
|---|---|
| Write-back new measurements to EMR | High |
| Multi-patient comparison view | Medium |
| Z-score display alongside percentile bands | Medium |
| Offline PWA mode with service worker | Low |
| Role-based access control (RBAC) | High |
| Audit trail logging (who viewed/edited which record) | High |
| Unified state: merge `GrowchartDetail` localStorage into `GrowchartContext` | Medium |
| Route `HybridFentonWhoChart` as an alternative combined view | Low |

---

*End of SRS v1.0*
