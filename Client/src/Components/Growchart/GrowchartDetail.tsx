import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { gsap } from "gsap";
import { useGrowchart, type HomeFormState } from "./GrowchartContext";
import FentonChart from "./FentonChart";
import {
  FENTON_WEIGHT_BOYS, FENTON_WEIGHT_GIRLS,
  FENTON_LENGTH_BOYS, FENTON_LENGTH_GIRLS,
  FENTON_HC_BOYS, FENTON_HC_GIRLS,
  type RefPoint,
} from "./referenceData";

// ─── Types ────────────────────────────────────────────────────────────────────
type Gender = "male" | "female" | "";

interface Visit {
  id: string;
  date: string;
  height: string;
  weight: string;
  headCirc: string;
}

interface VisitErrors {
  height?: string;
  weight?: string;
  headCirc?: string;
}

interface ChartPoint {
  week: number;
  weekLabel: string;
  height: number | null;
  weight: number | null;
  headCirc: number | null;
  l_p3: number | null; l_p15: number | null; l_p50: number | null; l_p85: number | null; l_p97: number | null;
  hc_p3: number | null; hc_p15: number | null; hc_p50: number | null; hc_p85: number | null; hc_p97: number | null;
  w_p3: number | null; w_p15: number | null; w_p50: number | null; w_p85: number | null; w_p97: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}

function interpolate(data: RefPoint[], x: number): Omit<RefPoint, "x"> | null {
  if (!data.length) return null;
  const sorted = [...data].sort((a, b) => a.x - b.x);
  if (x <= sorted[0].x) return sorted[0];
  if (x >= sorted[sorted.length - 1].x) return sorted[sorted.length - 1];
  const lo = sorted.filter(d => d.x <= x).pop()!;
  const hi = sorted.find(d => d.x > x)!;
  const t = (x - lo.x) / (hi.x - lo.x);
  const lerp = (a: number, b: number) => parseFloat((a + t * (b - a)).toFixed(2));
  return {
    p3: lerp(lo.p3, hi.p3),
    p15: lerp(lo.p15, hi.p15),
    p50: lerp(lo.p50, hi.p50),
    p85: lerp(lo.p85, hi.p85),
    p97: lerp(lo.p97, hi.p97),
  };
}

function cgaWeek(dob: string, gaAtBirth: number, visitDate: string): number {
  const msPerWeek = 7 * 24 * 3600 * 1000;
  const postnatalWeeks = (new Date(visitDate).getTime() - new Date(dob).getTime()) / msPerWeek;
  return gaAtBirth + postnatalWeeks;
}

function buildChartData(visits: Visit[], dob: string, gaAtBirth: number, gender: Gender): ChartPoint[] {
  const male = gender !== "female";
  const lRef = male ? FENTON_LENGTH_BOYS : FENTON_LENGTH_GIRLS;
  const hcRef = male ? FENTON_HC_BOYS : FENTON_HC_GIRLS;
  const wRef = male ? FENTON_WEIGHT_BOYS : FENTON_WEIGHT_GIRLS;

  const refWeeks = [22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50];
  const refPoints: ChartPoint[] = refWeeks.map(w => {
    const l = interpolate(lRef, w);
    const hc = interpolate(hcRef, w);
    const wt = interpolate(wRef, w);
    return {
      week: w, weekLabel: `${w}w`,
      height: null, weight: null, headCirc: null,
      l_p3: l?.p3 ?? null, l_p15: l?.p15 ?? null, l_p50: l?.p50 ?? null, l_p85: l?.p85 ?? null, l_p97: l?.p97 ?? null,
      hc_p3: hc?.p3 ?? null, hc_p15: hc?.p15 ?? null, hc_p50: hc?.p50 ?? null, hc_p85: hc?.p85 ?? null, hc_p97: hc?.p97 ?? null,
      w_p3: wt?.p3 ?? null, w_p15: wt?.p15 ?? null, w_p50: wt?.p50 ?? null, w_p85: wt?.p85 ?? null, w_p97: wt?.p97 ?? null,
    };
  });

  const visitPoints: ChartPoint[] = visits
    .filter(v => v.date && dob)
    .map(v => {
      const cga = cgaWeek(dob, gaAtBirth, v.date);
      const l = interpolate(lRef, cga);
      const hc = interpolate(hcRef, cga);
      const wt = interpolate(wRef, cga);
      return {
        week: parseFloat(cga.toFixed(1)),
        weekLabel: `${cga.toFixed(1)}w\n${formatDate(v.date)}`,
        height: v.height ? parseFloat(v.height) : null,
        weight: v.weight ? parseFloat(v.weight) : null,
        headCirc: v.headCirc ? parseFloat(v.headCirc) : null,
        l_p3: l?.p3 ?? null, l_p15: l?.p15 ?? null, l_p50: l?.p50 ?? null, l_p85: l?.p85 ?? null, l_p97: l?.p97 ?? null,
        hc_p3: hc?.p3 ?? null, hc_p15: hc?.p15 ?? null, hc_p50: hc?.p50 ?? null, hc_p85: hc?.p85 ?? null, hc_p97: hc?.p97 ?? null,
        w_p3: wt?.p3 ?? null, w_p15: wt?.p15 ?? null, w_p50: wt?.p50 ?? null, w_p85: wt?.p85 ?? null, w_p97: wt?.p97 ?? null,
      };
    });

  return [...refPoints, ...visitPoints].sort((a, b) => a.week - b.week);
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function GrowChart() {
  const navigate = useNavigate();
  const { setPatient, homeForm, setHomeForm } = useGrowchart();
  function newId() { return crypto.randomUUID(); }

  const { patientName, dob, gender, gaAtBirth, plotted } = homeForm;
  const visits = homeForm.visits;

  const [chartData, setChartData] = useState<ChartPoint[]>(() => {
    if (!homeForm.plotted || !homeForm.dob) return [];
    const ga = parseFloat(homeForm.gaAtBirth) || 40;
    return buildChartData(homeForm.visits, homeForm.dob, ga, homeForm.gender);
  });

  const [visitErrors, setVisitErrors] = useState<Record<string, VisitErrors>>({});

  // ─── GSAP refs ──────────────────────────────────────────────────────────────
  const pageRef = useRef<HTMLDivElement>(null);
  const formCardRef = useRef<HTMLDivElement>(null);
  const chartCardRef = useRef<HTMLDivElement>(null);
  const patientBadgeRef = useRef<HTMLDivElement>(null);
  const visitListRef = useRef<HTMLDivElement>(null);
  const plotBtnRef = useRef<HTMLButtonElement>(null);

  // ── Page mount animation ────────────────────────────────────────────────────
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(formCardRef.current, {
        x: -40,
        opacity: 0,
        duration: 0.7,
        ease: "power3.out",
      });
      gsap.from(chartCardRef.current, {
        x: 40,
        opacity: 0,
        duration: 0.7,
        ease: "power3.out",
        delay: 0.15,
      });
    }, pageRef);
    return () => ctx.revert();
  }, []);

  // ── Patient badge slide-in when plotted ─────────────────────────────────────
  useEffect(() => {
    if (plotted && patientBadgeRef.current) {
      gsap.fromTo(
        patientBadgeRef.current,
        { y: -12, opacity: 0, scale: 0.95 },
        { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: "back.out(1.7)" }
      );
    }
  }, [plotted]);

  // ── Chart card reveal when plotted ──────────────────────────────────────────
  useEffect(() => {
    if (plotted && chartCardRef.current) {
      gsap.fromTo(
        chartCardRef.current,
        { opacity: 0.4, scale: 0.98, y: 10 },
        { opacity: 1, scale: 1, y: 0, duration: 0.55, ease: "power2.out" }
      );
    }
  }, [plotted, chartData]);

  // ─── Visit management ───────────────────────────────────────────────────────
  function addVisit() {
    setHomeForm(prev => ({
      ...prev,
      visits: [...prev.visits, { id: newId(), date: "", height: "", weight: "", headCirc: "" }],
    }));
  }

  // ── Animate new visit card after React commits it to DOM ────────────────────
  const prevVisitCountRef = useRef(visits.length);
  useEffect(() => {
    if (visits.length > prevVisitCountRef.current && visitListRef.current) {
      const cards = visitListRef.current.querySelectorAll<HTMLElement>(".visit-card");
      const last = cards[cards.length - 1];
      if (last) {
        gsap.fromTo(
          last,
          { opacity: 0, y: 20, scale: 0.95 },
          { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "back.out(1.4)" }
        );
      }
    }
    prevVisitCountRef.current = visits.length;
  }, [visits.length]);

  function removeVisit(id: string) {
    // Animate out before removing
    const card = visitListRef.current?.querySelector<HTMLElement>(`[data-visit-id="${id}"]`);
    if (card) {
      gsap.to(card, {
        opacity: 0,
        x: -20,
        height: 0,
        paddingTop: 0,
        paddingBottom: 0,
        marginBottom: 0,
        duration: 0.3,
        ease: "power2.in",
        onComplete: () => {
          setHomeForm(prev => ({ ...prev, visits: prev.visits.filter(v => v.id !== id) }));
        },
      });
    } else {
      setHomeForm(prev => ({ ...prev, visits: prev.visits.filter(v => v.id !== id) }));
    }
  }

  function updateVisit(id: string, field: keyof Omit<Visit, "id">, value: string) {
    setHomeForm(prev => ({
      ...prev,
      visits: prev.visits.map(v => v.id === id ? { ...v, [field]: value } : v),
    }));
    const num = parseFloat(value);
    let err: string | undefined;
    if (value && field === "headCirc" && num > 55) err = "Max 55 cm";
    setVisitErrors(prev => ({ ...prev, [id]: { ...prev[id], [field]: err } }));
  }

  function handlePlot(e: React.FormEvent) {
    e.preventDefault();
    const hasErrors = Object.values(visitErrors).some(errs => errs && Object.values(errs).some(Boolean));
    if (hasErrors) return;

    // Button pulse before plotting
    if (plotBtnRef.current) {
      gsap.timeline()
        .to(plotBtnRef.current, { scale: 0.93, duration: 0.1, ease: "power1.in" })
        .to(plotBtnRef.current, { scale: 1, duration: 0.25, ease: "elastic.out(1.2, 0.5)" });
    }

    const ga = parseFloat(gaAtBirth) || 40;
    const data = buildChartData(visits, dob, ga, gender);
    setChartData(data);
    setHomeForm(prev => ({ ...prev, plotted: true }));
    setPatient({ patientName, dob, gender, gaAtBirth, visits });
  }

  function handleReset() {
    // Animate form card shake on reset
    if (formCardRef.current) {
      gsap.timeline()
        .to(formCardRef.current, { x: -6, duration: 0.07 })
        .to(formCardRef.current, { x: 6, duration: 0.07 })
        .to(formCardRef.current, { x: -4, duration: 0.06 })
        .to(formCardRef.current, { x: 0, duration: 0.06 })
        .then(() => {
          setHomeForm({
            patientName: "", dob: "", gender: "", gaAtBirth: "",
            visits: [{ id: newId(), date: "", height: "", weight: "", headCirc: "" }],
            plotted: false,
          });
          setChartData([]);
          setVisitErrors({});
        });
    } else {
      setHomeForm({
        patientName: "", dob: "", gender: "", gaAtBirth: "",
        visits: [{ id: newId(), date: "", height: "", weight: "", headCirc: "" }],
        plotted: false,
      });
      setChartData([]);
      setVisitErrors({});
    }
  }

  // Gender button hover/click animation helper
  function handleGenderClick(g: "male" | "female") {
    setHomeForm(prev => ({ ...prev, gender: g }));
    const btn = document.querySelector<HTMLElement>(`[data-gender="${g}"]`);
    if (btn) {
      gsap.timeline()
        .to(btn, { scale: 0.92, duration: 0.08 })
        .to(btn, { scale: 1.06, duration: 0.15, ease: "power2.out" })
        .to(btn, { scale: 1, duration: 0.12, ease: "power1.in" });
    }
  }

  return (
    <div ref={pageRef} style={s.page}>
      <div style={s.wrapper}>
        <div style={s.header}>
          <div>
            {plotted && patientName && (
              <div ref={patientBadgeRef} style={s.patientBadge}>
                <span style={s.patientName}>
                  {patientName}
                  {gender && (
                    <span style={{ marginLeft: 6, color: gender === "male" ? "#3b82f6" : "#ec4899" }}>
                      {gender === "male" ? "♂" : "♀"}
                    </span>
                  )}
                </span>
                {dob && (
                  <span style={s.patientDob}>
                    DOB: {formatDate(dob)}{gaAtBirth ? ` · GA ${gaAtBirth}w` : ""}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={s.body}>
          {/* ── Form card ── */}
          <div ref={formCardRef} style={s.formCard}>
            <h2 style={s.sectionTitle}>Patient Info</h2>

            <div style={s.field}>
              <label style={s.label}>Patient Name</label>
              <input
                style={s.input}
                type="text"
                placeholder="Full name"
                value={patientName}
                onChange={e => setHomeForm(prev => ({ ...prev, patientName: e.target.value }))}
              />
            </div>

            <div style={s.field}>
              <label style={s.label}>Date of Birth</label>
              <DatePicker
                selected={dob ? new Date(dob) : null}
                onChange={(date: Date | null) =>
                  setHomeForm(prev => ({ ...prev, dob: date ? date.toISOString().split("T")[0] : "" }))
                }
                dateFormat="dd MMM yyyy"
                placeholderText="Select date"
                showMonthDropdown
                showYearDropdown
                dropdownMode="select"
                yearDropdownItemNumber={10}
                scrollableYearDropdown
                maxDate={new Date()}
                isClearable
                todayButton="Today"
                customInput={<input style={s.input} />}
              />
            </div>

            <div style={s.field}>
              <label style={s.label}>GA at Birth (weeks)</label>
              <input
                style={s.input}
                type="number"
                placeholder="e.g. 28"
                value={gaAtBirth}
                onChange={e => setHomeForm(prev => ({ ...prev, gaAtBirth: e.target.value }))}
                min="22"
                max="44"
                step="1"
              />
            </div>

            <div style={s.field}>
              <label style={s.label}>Gender</label>
              <div style={s.genderRow}>
                {(["male", "female"] as const).map(g => (
                  <button
                    key={g}
                    type="button"
                    data-gender={g}
                    onClick={() => handleGenderClick(g)}
                    style={{
                      ...s.genderBtn,
                      ...(gender === g ? (g === "male" ? s.gMale : s.gFemale) : {}),
                    }}
                  >
                    {g === "male" ? "♂ Male" : "♀ Female"}
                  </button>
                ))}
              </div>
            </div>

            <div style={s.divider} />

            <div style={s.visitsHeader}>
              <h2 style={s.sectionTitle}>Visits</h2>
              <button type="button" onClick={addVisit} style={s.addBtn}>+ Add</button>
            </div>

            <form onSubmit={handlePlot}>
              <div ref={visitListRef} style={s.visitList}>
                {homeForm.visits.map((v, idx) => (
                  <div
                    key={v.id}
                    className="visit-card"
                    data-visit-id={v.id}
                    style={s.visitCard}
                  >
                    <div style={s.visitCardHeader}>
                      <span style={s.visitLabel}>Visit {idx + 1}</span>
                      {visits.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeVisit(v.id)}
                          style={s.removeBtn}
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    <div style={s.field}>
                      <label style={s.label}>Date</label>
                      <DatePicker
                        selected={v.date ? new Date(v.date) : null}
                        onChange={(date: Date | null) =>
                          updateVisit(v.id, "date", date ? date.toISOString().split("T")[0] : "")
                        }
                        dateFormat="dd MMM yyyy"
                        placeholderText="Select date"
                        showMonthDropdown
                        showYearDropdown
                        dropdownMode="select"
                        isClearable
                        todayButton="Today"
                        minDate={dob ? new Date(dob) : undefined}
                        maxDate={new Date()}
                        customInput={<input style={s.input} />}
                      />
                    </div>

                    {v.date && dob && gaAtBirth && (
                      <div style={s.field}>
                        <label style={s.label}>Corrected GA (auto)</label>
                        <div style={s.cgaDisplay}>
                          {cgaWeek(dob, parseFloat(gaAtBirth) || 40, v.date).toFixed(1)}w
                        </div>
                      </div>
                    )}

                    <div style={s.row}>
                      <div style={{ ...s.field, flex: 1 }}>
                        <label style={s.label}>Length (cm)</label>
                        <input
                          style={s.input}
                          type="number"
                          placeholder="cm"
                          value={v.height}
                          onChange={e => updateVisit(v.id, "height", e.target.value)}
                        />
                      </div>
                      <div style={{ ...s.field, flex: 1 }}>
                        <label style={s.label}>Weight (kg)</label>
                        <input
                          style={s.input}
                          type="number"
                          placeholder="kg"
                          value={v.weight}
                          onChange={e => updateVisit(v.id, "weight", e.target.value)}
                          step="0.01"
                        />
                      </div>
                    </div>

                    <div style={s.field}>
                      <label style={s.label}>Head Circ. (cm)</label>
                      {visitErrors[v.id]?.headCirc && (
                        <span style={s.errorText}>{visitErrors[v.id].headCirc}</span>
                      )}
                      <input
                        style={s.input}
                        type="number"
                        placeholder="cm"
                        value={v.headCirc}
                        onChange={e => updateVisit(v.id, "headCirc", e.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div style={s.btnRow}>
                <button ref={plotBtnRef} type="submit" style={s.btnPrimary}>
                  Plot Chart
                </button>
                <button type="button" onClick={handleReset} style={s.btnSecondary}>
                  Reset
                </button>
              </div>
            </form>
          </div>

          {/* ── Chart card ── */}
          <div ref={chartCardRef} style={s.chartCard}>
            {plotted && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
                <button
                  onClick={() => navigate("/detail")}
                  style={s.detailBtn}
                  onMouseEnter={e => gsap.to(e.currentTarget, { x: 3, duration: 0.2 })}
                  onMouseLeave={e => gsap.to(e.currentTarget, { x: 0, duration: 0.2 })}
                >
                  View Individual Charts →
                </button>
              </div>
            )}
            {!plotted ? (
              <Placeholder />
            ) : (() => {
              const patientPts = chartData
                .filter(d => d.height != null || d.weight != null || d.headCirc != null)
                .map(d => ({
                  week: d.week,
                  height: d.height,
                  weight: d.weight,
                  headCirc: d.headCirc,
                  label: d.weekLabel,
                }));
              return (
                <div>
                  <div style={{ marginBottom: 16 }}>
                    <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
                      Fenton Preterm Growth Chart – {gender === "male" ? "Boys" : "Girls"}
                    </h3>

                  </div>
                  <FentonChart gender={gender} patientData={patientPts} />
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Placeholder ──────────────────────────────────────────────────────────────
function Placeholder() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) {
      gsap.fromTo(
        ref.current,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }
      );
    }
  }, []);
  return (
    <div ref={ref} style={s.placeholder}>
      <p style={s.placeholderText}>Enter Patient Parameters to view Fenton Grid markings</p>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "calc(100vh - 52px)", backgroundColor: "#f8fafc", padding: "24px", fontFamily: "system-ui, sans-serif", boxSizing: "border-box", width: "100%" },
  wrapper: { maxWidth: "100%", margin: "0 auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" },
  patientBadge: { backgroundColor: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "8px 16px" },
  patientName: { fontWeight: 700, fontSize: "14px", color: "#0f172a" },
  patientDob: { fontSize: "12px", color: "#475569", marginLeft: 8 },
  body: { display: "flex", gap: "20px", alignItems: "flex-start", width: "100%" },
  formCard: { backgroundColor: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "20px", width: "300px", flexShrink: 0, display: "flex", flexDirection: "column", gap: "12px" },
  chartCard: { backgroundColor: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "24px", flex: 1, minWidth: 0 },
  sectionTitle: { margin: 0, fontSize: "14px", fontWeight: 700, color: "#0f172a" },
  field: { display: "flex", flexDirection: "column", gap: "4px" },
  row: { display: "flex", gap: "8px" },
  label: { fontSize: "11px", fontWeight: 600, color: "#475569" },
  input: { padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", color: "#0f172a", width: "100%", boxSizing: "border-box" },
  cgaDisplay: { padding: "8px 12px", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "13px", color: "#0f172a", backgroundColor: "#f8fafc", fontWeight: 600 },
  errorText: { fontSize: "11px", color: "#ef4444", fontWeight: 500 },
  divider: { borderTop: "1px solid #e2e8f0", margin: "4px 0" },
  genderRow: { display: "flex", gap: "8px" },
  genderBtn: { flex: 1, padding: "8px 0", borderRadius: "6px", border: "1px solid #cbd5e1", backgroundColor: "#fff", cursor: "pointer", fontSize: "12px", fontWeight: 500 },
  gMale: { backgroundColor: "#eff6ff", borderColor: "#2563eb", color: "#2563eb" },
  gFemale: { backgroundColor: "#fdf2f8", borderColor: "#db2777", color: "#db2777" },
  visitsHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  addBtn: { padding: "4px 12px", backgroundColor: "#0f172a", color: "#fff", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer" },
  visitList: { display: "flex", flexDirection: "column", gap: "10px", maxHeight: "340px", overflowY: "auto" },
  visitCard: { border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px", backgroundColor: "#f8fafc" },
  visitCardHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" },
  visitLabel: { fontSize: "12px", fontWeight: 700, color: "#0f172a" },
  removeBtn: { background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "12px" },
  btnRow: { display: "flex", gap: "8px", marginTop: "12px" },
  btnPrimary: { flex: 1, padding: "10px", backgroundColor: "#2563eb", color: "#fff", border: "none", borderRadius: "6px", fontSize: "13px", fontWeight: 600, cursor: "pointer" },
  btnSecondary: { flex: 1, padding: "10px", backgroundColor: "#fff", color: "#475569", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "13px", fontWeight: 500, cursor: "pointer" },
  placeholder: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: "400px" },
  placeholderText: { color: "#64748b", fontSize: "14px" },
  detailBtn: { padding: "8px 16px", backgroundColor: "#0f172a", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: 600 },
};