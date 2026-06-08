import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGrowchart } from "./GrowchartContext";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
  Title,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { Line } from "react-chartjs-2";
import {
  FENTON_WEIGHT_BOYS, FENTON_WEIGHT_GIRLS,
  FENTON_LENGTH_BOYS, FENTON_LENGTH_GIRLS,
  FENTON_HC_BOYS, FENTON_HC_GIRLS,
  type RefPoint,
} from "./referenceData";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler, Title);

// ─── Types ────────────────────────────────────────────────────────────────────
type Metric = "height" | "weight" | "headCirc";
type GenderView = "both" | "male" | "female";

interface ChartPoint {
  week: number;
  weekLabel: string;
  patient: number | null;
  boys: Record<"p3" | "p15" | "p50" | "p85" | "p97", number | null>;
  girls: Record<"p3" | "p15" | "p50" | "p85" | "p97", number | null>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function interpolate(data: RefPoint[], x: number): Omit<RefPoint, "x"> | null {
  if (!data || !data.length) return null;
  const sorted = [...data].sort((a, b) => a.x - b.x);

  if (x <= sorted[0].x) return sorted[0];

  if (x >= sorted[sorted.length - 1].x) {
    const maxPt = sorted[sorted.length - 1];
    const weeksPast = x - maxPt.x;
    const factor = 1 + (weeksPast / 250) * 0.7;
    return {
      p3: parseFloat((maxPt.p3 * factor).toFixed(2)),
      p15: parseFloat((maxPt.p15 * factor).toFixed(2)),
      p50: parseFloat((maxPt.p50 * factor).toFixed(2)),
      p85: parseFloat((maxPt.p85 * factor).toFixed(2)),
      p97: parseFloat((maxPt.p97 * factor).toFixed(2)),
    };
  }

  const lo = sorted.filter(d => d.x <= x).pop()!;
  const hi = sorted.find(d => d.x > x)!;
  const t = (x - lo.x) / (hi.x - lo.x);
  const l = (a: number, b: number) => parseFloat((a + t * (b - a)).toFixed(2));
  return { p3: l(lo.p3, hi.p3), p15: l(lo.p15, hi.p15), p50: l(lo.p50, hi.p50), p85: l(lo.p85, hi.p85), p97: l(lo.p97, hi.p97) };
}

// CGA is always calculated from DOB + GA at birth + visit date (gaWeeks field removed)
function cgaWeek(dob: string, gaAtBirth: number, visitDate: string): number {
  const dobMs = new Date(dob).getTime();
  const visitMs = new Date(visitDate).getTime();
  if (isNaN(dobMs) || isNaN(visitMs)) return gaAtBirth;
  return gaAtBirth + (visitMs - dobMs) / (7 * 24 * 3600 * 1000);
}

function formatDate(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}

function ceilTo(v: number, step: number) { return Math.ceil(v / step) * step; }

function buildData(
  visits: { date: string; height: string; weight: string; headCirc: string }[],
  dob: string, gaAtBirth: number, metric: Metric
): ChartPoint[] {
  const bRef = metric === "height" ? FENTON_LENGTH_BOYS : metric === "weight" ? FENTON_WEIGHT_BOYS : FENTON_HC_BOYS;
  const gRef = metric === "height" ? FENTON_LENGTH_GIRLS : metric === "weight" ? FENTON_WEIGHT_GIRLS : FENTON_HC_GIRLS;

  // Generate reference points: preterm weeks up to gaAtBirth, then every 2 months up to 5 years
  const refWeeks: number[] = [];
  for (let w = 22; w <= gaAtBirth; w += 2) refWeeks.push(w);
  if (!refWeeks.includes(gaAtBirth)) refWeeks.push(gaAtBirth);
  for (let y = 0; y < 5; y++) {
    const base = gaAtBirth + (y * 52);
    refWeeks.push(
      base + 8.67,  // 2m
      base + 17.33, // 4m
      base + 26,    // 6m
      base + 34.67, // 8m
      base + 43.33, // 10m
      base + 52     // Next Year
    );
  }

  const pts: ChartPoint[] = refWeeks.map(w => {
    const b = interpolate(bRef, w), g = interpolate(gRef, w);

    let label = "";
    if (w <= gaAtBirth) label = w === gaAtBirth ? "Birth" : `${Math.round(w)}w`;
    else {
      const weeksPast = w - gaAtBirth;
      const years = Math.floor(weeksPast / 52);
      const months = Math.round((weeksPast % 52) / 4.333);
      if (months === 0) label = `${years} yr`;
      else if (months === 12) label = `${years + 1} yr`;
      else label = years > 0 ? `${years}y ${months}m` : `${months}m`;
    }

    return {
      week: w,
      weekLabel: label,
      patient: null,
      boys: { p3: b?.p3 ?? null, p15: b?.p15 ?? null, p50: b?.p50 ?? null, p85: b?.p85 ?? null, p97: b?.p97 ?? null },
      girls: { p3: g?.p3 ?? null, p15: g?.p15 ?? null, p50: g?.p50 ?? null, p85: g?.p85 ?? null, p97: g?.p97 ?? null },
    };
  });

  visits.filter(v => v.date && dob).forEach(v => {
    // CGA always derived from DOB + GA at birth + visit date
    const cga = cgaWeek(dob, gaAtBirth, v.date);
    const b = interpolate(bRef, cga);
    const g = interpolate(gRef, cga);
    const raw = metric === "height" ? v.height : metric === "weight" ? v.weight : v.headCirc;

    let tooltipLbl = cga <= gaAtBirth
      ? `${cga.toFixed(1)}w`
      : `${Math.floor((cga - gaAtBirth) / 52)}y ${Math.round(((cga - gaAtBirth) % 52) / 4.333)}m`;

    const vp: ChartPoint = {
      week: parseFloat(cga.toFixed(1)),
      weekLabel: `${tooltipLbl}\n${formatDate(v.date)}`,
      patient: raw ? parseFloat(raw) : null,
      boys: { p3: b?.p3 ?? null, p15: b?.p15 ?? null, p50: b?.p50 ?? null, p85: b?.p85 ?? null, p97: b?.p97 ?? null },
      girls: { p3: g?.p3 ?? null, p15: g?.p15 ?? null, p50: g?.p50 ?? null, p85: g?.p85 ?? null, p97: g?.p97 ?? null },
    };

    // Fixed: tighter tolerance (0.5w) to avoid merging distinct visits
    const idx = pts.findIndex(r => Math.abs(r.week - vp.week) < 0.5 && r.patient === null);
    if (idx >= 0) pts[idx] = { ...pts[idx], patient: vp.patient, weekLabel: vp.weekLabel };
    else pts.push(vp);
  });

  return pts.sort((a, b) => a.week - b.week);
}

// ─── Chart Component ──────────────────────────────────────────────────────────
const PERCENTILE_COLORS = ["#22d3ee", "#34d399", "#3b82f6", "#f59e0b", "#f43f5e"];
const BOYS_COLORS = PERCENTILE_COLORS;
const GIRLS_COLORS = PERCENTILE_COLORS;
const PATIENT_COLOR = "#111827";
const PCTS = ["3rd", "15th", "50th", "85th", "97th"] as const;

function buildSeries(data: ChartPoint[], genderView: GenderView) {
  const showBoys = genderView === "both" || genderView === "male";
  const showGirls = genderView === "both" || genderView === "female";
  const percentileKeys = ["p3", "p15", "p50", "p85", "p97"] as const;

  const datasets: Array<any> = [];

  if (showBoys) {
    percentileKeys.forEach((percentile, index) => {
      datasets.push({
        label: `Boys ${PCTS[index]}`,
        data: data.map(point => ({ x: point.week, y: point.boys?.[percentile] ?? null, label: point.weekLabel })),
        borderColor: BOYS_COLORS[index],
        borderWidth: percentile === "p50" ? 2 : 1,
        borderDash: [], // solid for boys
        tension: 0.35,
        pointRadius: 0,
        fill: false,
        spanGaps: true,
      });
    });
  }

  if (showGirls) {
    percentileKeys.forEach((percentile, index) => {
      datasets.push({
        label: `Girls ${PCTS[index]}`,
        data: data.map(point => ({ x: point.week, y: point.girls?.[percentile] ?? null, label: point.weekLabel })),
        borderColor: GIRLS_COLORS[index],
        borderWidth: percentile === "p50" ? 2 : 1,
        borderDash: [4, 3], // dashed for girls — visually separates from boys when both shown
        tension: 0.35,
        pointRadius: 0,
        fill: false,
        spanGaps: true,
      });
    });
  }

  datasets.push({
    label: "Patient",
    data: data.map(point => ({ x: point.week, y: point.patient, label: point.weekLabel })),
    borderColor: PATIENT_COLOR,
    backgroundColor: PATIENT_COLOR,
    borderWidth: 2.5,
    tension: 0.35,
    pointRadius: 5,
    pointBackgroundColor: PATIENT_COLOR,
    pointBorderColor: "#fff",
    pointBorderWidth: 1.5,
    fill: false,
    spanGaps: true,
  });

  return datasets;
}

const percentileLabelsPlugin = {
  id: "percentileLabels",
  afterDraw(chart: any) {
    const { ctx, scales, chartArea } = chart;
    if (!ctx || !chartArea) return;

    const xRight = chartArea.right;
    const xMax: number = scales.x.max;

    // Separate boys and girls label groups to avoid cross-gender collision
    const boysItems: { label: string; color: string; x: number; y: number }[] = [];
    const girlsItems: { label: string; color: string; x: number; y: number }[] = [];

    chart.data.datasets.forEach((dataset: any) => {
      if (!dataset.label || dataset.label === "Patient") return;
      const isBoys = dataset.label.startsWith("Boys");
      const parts = dataset.label.split(" ");
      const pctLabel = parts[parts.length - 1];

      const visiblePoints = (dataset.data as any[]).filter(
        (p: any) => p.y !== null && p.y !== undefined && p.x <= xMax
      );
      if (!visiblePoints.length) return;
      const lastPoint = visiblePoints[visiblePoints.length - 1];

      const rawX = scales.x.getPixelForValue(lastPoint.x);
      const rawY = scales.y.getPixelForValue(lastPoint.y);
      if (!isFinite(rawX) || !isFinite(rawY)) return;

      const labelX = Math.min(rawX, xRight - 2);
      const item = { label: pctLabel, color: dataset.borderColor, x: labelX, y: rawY };
      if (isBoys) boysItems.push(item);
      else girlsItems.push(item);
    });

    const resolveCollisions = (items: typeof boysItems) => {
      if (!items.length) return;
      items.sort((a, b) => a.y - b.y);
      const minGap = 12;
      for (let i = 1; i < items.length; i++) {
        if (items[i].y - items[i - 1].y < minGap) items[i].y = items[i - 1].y + minGap;
      }
      const yBottom = chartArea.bottom - 4;
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i].y > yBottom) items[i].y = yBottom;
        if (i > 0 && items[i - 1].y > items[i].y - minGap) items[i - 1].y = items[i].y - minGap;
      }
    };

    resolveCollisions(boysItems);
    resolveCollisions(girlsItems);

    ctx.save();
    ctx.font = "bold 10px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    [...boysItems, ...girlsItems].forEach(({ label, color, x, y }) => {
      ctx.fillStyle = color;
      ctx.fillText(label, x + 4, y);
    });
    ctx.restore();
  },
};

function MetricChart({ data, yLabel, yStep, yMin, genderView, gaAtBirth }: {
  data: ChartPoint[];
  yLabel: string;
  yStep: number;
  yMin: number;
  genderView: GenderView;
  gaAtBirth: number;
}) {
  const series = buildSeries(data, genderView);
  const maxVal = Math.max(
    yMin,
    ...data.flatMap(point => [
      point.patient,
      ...(point.boys ? Object.values(point.boys) : []),
      ...(point.girls ? Object.values(point.girls) : []),
    ]).filter((val): val is number => typeof val === "number"),
  );
  const maxY = Math.max(yMin + yStep * 4, ceilTo(maxVal, yStep));

  const chartData: ChartData<"line"> = {
    datasets: series,
  };

  const chartXMin = Math.min(gaAtBirth, 40);
  const chartXMax = gaAtBirth + 260; // ~5 years past birth

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    parsing: false as const,
    layout: {
      padding: { left: 20, right: 40 }
    },
    scales: {
      x: {
        type: "linear" as const,
        min: chartXMin,
        max: chartXMax,
        title: {
          display: true,
          text: "Age (preterm weeks / completed months & years)",
          color: "#475569",
          font: { size: 12, weight: "bold" as const },
          padding: 10,
        },
        afterBuildTicks: (axis: { ticks: { value: number }[] }) => {
          const customTicks: { value: number }[] = [];
          customTicks.push({ value: gaAtBirth });
          for (let y = 0; y < 5; y++) {
            const base = gaAtBirth + (y * 52);
            customTicks.push(
              { value: base + 8.67 },
              { value: base + 17.33 },
              { value: base + 26 },
              { value: base + 34.67 },
              { value: base + 43.33 },
              { value: base + 52 }
            );
          }
          axis.ticks = customTicks;
        },
        ticks: {
          color: "#475569",
          autoSkip: false,
          maxRotation: 0,
          font: (ctx: { tick?: { value: number } }) => {
            const v = ctx.tick?.value ?? 0;
            if (Math.abs(v - gaAtBirth) < 0.5 || (v > gaAtBirth && Math.abs((v - gaAtBirth) % 52) < 1))
              return { size: 11, weight: "bold" as const };
            return { size: 10 };
          },
          callback: (value: number | string) => {
            const v = Number(value);
            const eps = 0.5;
            if (Math.abs(v - gaAtBirth) < eps) return "Birth";
            if (v > gaAtBirth) {
              const weeksPast = v - gaAtBirth;
              const years = Math.round(weeksPast / 52);
              if (Math.abs(weeksPast - years * 52) < eps) return `${years} yr`;
              const months = Math.round((weeksPast % 52) / 4.333);
              if ([2, 4, 6, 8, 10].includes(months)) return String(months);
            }
            return "";
          },
        },
        grid: { color: "#e2e8f0" },
      },
      y: {
        min: yMin,
        max: maxY,
        title: {
          display: true,
          text: yLabel,
          color: "#475569",
          font: { size: 12, weight: "bold" as const },
        },
        ticks: {
          stepSize: yStep,
          color: "#475569",
          font: { size: 11 },
        },
        grid: { color: "#e8ebef" },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => {
            const raw = items[0]?.raw as { label?: string } | undefined;
            return raw?.label ?? "";
          },
          label: (ctx) => {
            const value = ctx.parsed.y;
            return typeof value === "number"
              ? `${ctx.dataset.label}: ${value.toFixed(1)} ${yLabel}`
              : `${ctx.dataset.label}: —`;
          },
        },
      },
    },
  };

  return (
    <div style={{ width: "100%", minHeight: 420 }}>
      <Line data={chartData} options={options} plugins={[percentileLabelsPlugin]} />
    </div>
  );
}

// ─── Detail Page ──────────────────────────────────────────────────────────────
const METRICS: { key: Metric; label: string; icon: string; yLabel: string; yStep: number; yMin: number }[] = [
  { key: "height", label: "Length / Height", icon: "📏", yLabel: "cm", yStep: 5, yMin: 15 },
  { key: "weight", label: "Weight", icon: "⚖️", yLabel: "kg", yStep: 1, yMin: 0 },
  { key: "headCirc", label: "Head Circumference", icon: "🔵", yLabel: "cm", yStep: 5, yMin: 10 },
];

export default function GrowchartDetail() {
  const navigate = useNavigate();
  const { patient } = useGrowchart();
  const [activeMetric, setActiveMetric] = useState<Metric>("height");
  const [genderView, setGenderView] = useState<GenderView>("both");

  if (!patient) {
    return (
      <div style={s.page}>
        <div style={s.empty}>
          <p style={{ color: "#64748b", fontSize: 15 }}>No patient data. Go back and plot a chart first.</p>
          <button onClick={() => navigate("/")} style={s.btn}>← Back to Chart</button>
        </div>
      </div>
    );
  }

  const ga = parseFloat(patient.gaAtBirth) || 40;
  const m = METRICS.find(x => x.key === activeMetric)!;
  const chartData = buildData(patient.visits, patient.dob, ga, activeMetric);

  return (
    <div style={s.page}>
      <div style={s.wrapper}>

        {/* ── Page title ── */}
        <div style={s.pageHeader}>
          <div>
            <h1 style={s.title}>Individual Growth Charts</h1>
            <p style={s.sub}>
              {patient.patientName && <strong>{patient.patientName} </strong>}
              {patient.gender && (
                <span style={{ color: patient.gender === "male" ? BOYS_COLORS[2] : GIRLS_COLORS[2] }}>
                  {patient.gender === "male" ? "♂ Boy" : "♀ Girl"}
                </span>
              )}
              {patient.gaAtBirth && <span style={{ color: "#64748b" }}> · GA {patient.gaAtBirth}w at birth</span>}
            </p>
          </div>
        </div>

        {/* ── Controls row ── */}
        <div style={s.controlsRow}>
          <div style={s.tabGroup}>
            <span style={s.controlLabel}>Attribute</span>
            <div style={s.tabs}>
              {METRICS.map(m => (
                <button key={m.key}
                  onClick={() => setActiveMetric(m.key)}
                  style={{ ...s.tab, ...(activeMetric === m.key ? s.tabActive : {}) }}>
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
          </div>

          <div style={s.tabGroup}>
            <span style={s.controlLabel}>Reference</span>
            <div style={s.tabs}>
              {([
                { key: "both", label: "♂ + ♀ Both" },
                { key: "male", label: "♂ Boys only" },
                { key: "female", label: "♀ Girls only" },
              ] as { key: GenderView; label: string }[]).map(g => (
                <button key={g.key}
                  onClick={() => setGenderView(g.key)}
                  style={{
                    ...s.tab,
                    ...(genderView === g.key
                      ? g.key === "male" ? s.tabActiveMale
                        : g.key === "female" ? s.tabActiveFemale
                          : s.tabActive
                      : {}),
                  }}>
                  {g.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Chart card ── */}
        <div style={s.chartCard}>
          <div style={s.chartCardHeader}>
            <div>
              <h2 style={s.chartTitle}>{m.icon} {m.label}</h2>
              <p style={s.chartSub}>
                {genderView === "both" && <><span style={{ color: BOYS_COLORS[2] }}>♂ Boys</span> &amp; <span style={{ color: GIRLS_COLORS[2] }}>♀ Girls</span> reference</>}
                {genderView === "male" && <span style={{ color: BOYS_COLORS[2] }}>♂ Boys reference only</span>}
                {genderView === "female" && <span style={{ color: GIRLS_COLORS[2] }}>♀ Girls reference only</span>}
                <span style={{ color: "#94a3b8", marginLeft: 8 }}>· Patient in black</span>
              </p>
            </div>
            <div style={s.inlineLegend}>
              {(genderView === "both" || genderView === "male") && (
                <span style={s.legendItem}>
                  <span style={{ ...s.legendLine, borderColor: BOYS_COLORS[2] }} />
                  Boys (3rd–97th)
                </span>
              )}
              {(genderView === "both" || genderView === "female") && (
                <span style={s.legendItem}>
                  <span style={{ ...s.legendLine, borderColor: GIRLS_COLORS[2], borderStyle: "dashed" }} />
                  Girls (3rd–97th)
                </span>
              )}
              <span style={s.legendItem}>
                <span style={{ ...s.legendLine, borderColor: PATIENT_COLOR, borderWidth: 2 }} />
                Patient
              </span>
            </div>
          </div>

          <MetricChart
            data={chartData}
            yLabel={m.yLabel}
            yStep={m.yStep}
            yMin={m.yMin}
            genderView={genderView}
            gaAtBirth={ga}
          />
        </div>

        {/* ── Visit summary table ── */}
        <div style={s.tableCard}>
          <h3 style={s.tableTitle}>Visit Data — {m.label}</h3>
          <div style={{ overflowX: "auto" as const }}>
            <table style={s.table}>
              <thead>
                <tr>
                  {["Visit", "CGA (w)", "Date", m.yLabel === "kg" ? "Weight (kg)" : `${m.label} (${m.yLabel})`].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {patient.visits.filter(v => v.date).map((v, i) => {
                  // CGA always derived from DOB + GA at birth + visit date
                  const cga = cgaWeek(patient.dob, ga, v.date);
                  const val = activeMetric === "height" ? v.height
                    : activeMetric === "weight" ? v.weight
                      : v.headCirc;
                  return (
                    <tr key={v.id} style={i % 2 === 0 ? s.trEven : s.trOdd}>
                      <td style={s.td}>{i + 1}</td>
                      <td style={{ ...s.td, fontWeight: 600 }}>{cga.toFixed(1)}w</td>
                      <td style={s.td}>{formatDate(v.date)}</td>
                      <td style={{ ...s.td, fontWeight: 700, color: "#1e293b" }}>{val || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "calc(100vh - 52px)", backgroundColor: "#f0f4f8", padding: "24px", fontFamily: "'Segoe UI', sans-serif", boxSizing: "border-box" as const, width: "100%" },
  wrapper: { maxWidth: "100%", margin: "0 auto", display: "flex", flexDirection: "column" as const, gap: 20 },
  empty: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 16 },
  pageHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 },
  title: { margin: 0, fontSize: 22, fontWeight: 800, color: "#1e293b" },
  sub: { margin: "4px 0 0", fontSize: 13, color: "#64748b" },
  btn: { padding: "8px 16px", backgroundColor: "#f1f5f9", color: "#374151", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  controlsRow: { display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-end", backgroundColor: "#fff", borderRadius: 12, padding: "16px 20px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
  tabGroup: { display: "flex", flexDirection: "column", gap: 6 },
  controlLabel: { fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" },
  tabs: { display: "flex", gap: 6, flexWrap: "wrap" },
  tab: { padding: "7px 14px", borderRadius: 7, border: "1px solid #d1d5db", backgroundColor: "#f8fafc", color: "#64748b", fontSize: 13, fontWeight: 500, cursor: "pointer" },
  tabActive: { backgroundColor: "#1e293b", border: "1px solid #1e293b", color: "#fff", fontWeight: 700 },
  tabActiveMale: { backgroundColor: "#eff6ff", border: "1px solid #3b82f6", color: "#1d4ed8", fontWeight: 700 },
  tabActiveFemale: { backgroundColor: "#fdf2f8", border: "1px solid #ec4899", color: "#be185d", fontWeight: 700 },
  chartCard: { backgroundColor: "#fff", borderRadius: 14, boxShadow: "0 4px 20px rgba(0,0,0,0.07)", padding: "24px", width: "100%" },
  chartCardHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap", gap: 8 },
  chartTitle: { margin: 0, fontSize: 18, fontWeight: 700, color: "#1e293b" },
  chartSub: { margin: "4px 0 0", fontSize: 12, color: "#64748b" },
  inlineLegend: { display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" },
  legendItem: { display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#475569" },
  legendLine: { display: "inline-block", width: 20, height: 0, borderTopWidth: 2, borderTopStyle: "solid", borderColor: "#000" },
  tableCard: { backgroundColor: "#fff", borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.07)", padding: "20px 24px" },
  tableTitle: { margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#1e293b" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "2px solid #e2e8f0" },
  td: { padding: "8px 12px", color: "#1e293b" },
  trEven: { backgroundColor: "#f8fafc" },
  trOdd: { backgroundColor: "#fff" },
};