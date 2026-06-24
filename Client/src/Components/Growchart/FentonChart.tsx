import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import CollapsibleSidebar from "./CollapsibleSidebar";

import { Line } from "react-chartjs-2";
import { gsap } from "gsap";
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
  type ChartDataset,
} from "chart.js";
import {
  FENTON_WEIGHT_BOYS, FENTON_WEIGHT_GIRLS,
  FENTON_LENGTH_BOYS, FENTON_LENGTH_GIRLS,
  FENTON_HC_BOYS, FENTON_HC_GIRLS,
  type RefPoint,
} from "./referenceData";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler, Title);

// ─── Types ────────────────────────────────────────────────────────────────────
type Gender = "male" | "female" | "";

interface PatientPoint {
  week: number;
  height: number | null;
  weight: number | null;
  headCirc: number | null;
  label?: string;
}

interface FentonChartProps {
  gender: Gender;
  patientData: PatientPoint[];
  splitWeek: number;
  sidebarContent?: React.ReactNode;
  onSidebarOpen?: () => void;
}

type ExtendedDataset = ChartDataset<"line"> & { yAxisID?: string };

const X_MIN = 22;
const Y_MIN = 0;
const Y_MAX = 60;
const WEIGHT_BAND_MAX = 18;
const WEIGHT_RAW_MAX = 10;
const CM_RAW_MIN = 15;
const CM_RAW_MAX = 85;
const REF_WEEKS = [22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50] as const;
const PERCENTILES = ["p3", "p15", "p50", "p85", "p97"] as const;

// Patient dataset indices (always last 3 before rightAxisHelper)
const PATIENT_DATASET_LABELS = ["Patient Length", "Patient Head Circumference", "Patient Weight"];

function mapWeightValue(value: number) {
  return (value / WEIGHT_RAW_MAX) * WEIGHT_BAND_MAX;
}
function mapCmValue(value: number) {
  return WEIGHT_BAND_MAX + ((value - CM_RAW_MIN) / (CM_RAW_MAX - CM_RAW_MIN)) * (Y_MAX - WEIGHT_BAND_MAX);
}
function mapValueToChart(label: string, value: number) {
  return label.toLowerCase().includes("weight") ? mapWeightValue(value) : mapCmValue(value);
}

function buildYTicks(weightMin: number, weightMax: number, cmMin: number, cmMax: number): number[] {
  const wStep = 0.5;
  const wLo = Math.max(0, Math.floor(weightMin / wStep - 1) * wStep);
  const wHi = Math.min(10, Math.ceil(weightMax / wStep + 1) * wStep);
  const weightTicks: number[] = [];
  for (let v = wLo; v <= wHi + 0.001; v = Math.round((v + wStep) * 100) / 100) weightTicks.push(mapWeightValue(v));

  const cmStep = 5;
  const cmLo = Math.max(15, Math.floor(cmMin / cmStep - 1) * cmStep);
  const cmHi = Math.min(85, Math.ceil(cmMax / cmStep + 1) * cmStep);
  const cmTicks: number[] = [];
  for (let v = cmLo; v <= cmHi + 0.001; v += cmStep) cmTicks.push(mapCmValue(v));

  return [...weightTicks, ...cmTicks];
}

function formatTick(value: number) {
  if (value <= WEIGHT_BAND_MAX) {
    let raw = (value / WEIGHT_BAND_MAX) * WEIGHT_RAW_MAX;
    raw = Math.round(raw * 2) / 2;
    return raw.toFixed(1);
  }
  const raw = CM_RAW_MIN + ((value - WEIGHT_BAND_MAX) / (Y_MAX - WEIGHT_BAND_MAX)) * (CM_RAW_MAX - CM_RAW_MIN);
  return Math.round(raw).toString();
}

const COLORS = { reference: "#6b7280", patient: "#111827" };

function interpolateRef(data: RefPoint[], x: number): Omit<RefPoint, "x"> | null {
  if (!data.length) return null;
  const sorted = [...data].sort((a, b) => a.x - b.x);
  if (x < sorted[0].x || x > sorted[sorted.length - 1].x) return null;
  if (x === sorted[0].x) return sorted[0];
  if (x === sorted[sorted.length - 1].x) return sorted[sorted.length - 1];
  const lo = sorted.filter(d => d.x <= x).pop()!;
  const hi = sorted.find(d => d.x > x)!;
  const t = (x - lo.x) / (hi.x - lo.x);
  const lerp = (a: number, b: number) => a + t * (b - a);
  return { p3: lerp(lo.p3, hi.p3), p15: lerp(lo.p15, hi.p15), p50: lerp(lo.p50, hi.p50), p85: lerp(lo.p85, hi.p85), p97: lerp(lo.p97, hi.p97) };
}

function buildSeries(refData: RefPoint[], label: string): ExtendedDataset[] {
  return PERCENTILES.map((percentile) => {
    const data = REF_WEEKS.map(w => {
      const point = interpolateRef(refData, w);
      if (!point || point[percentile] == null) return null;
      return { x: w, y: mapValueToChart(label, point[percentile]), yOriginal: point[percentile] };
    }).filter((p): p is { x: typeof REF_WEEKS[number]; y: number; yOriginal: number } => p != null);
    return {
      label: `${label} ${percentile.replace("p", "")}th`,
      data,
      borderColor: COLORS.reference,
      borderWidth: percentile === "p50" ? 1.6 : 0.9,
      borderDash: percentile === "p50" ? [] : [4, 3],
      tension: 0.35,
      pointRadius: 0,
      spanGaps: true,
      fill: false,
    } as ExtendedDataset;
  });
}

function buildPatientDataset(label: string, points: Array<{ x: number; y: number; label?: string }>, dash?: number[]): ExtendedDataset {
  return {
    label,
    data: points.map(p => ({ x: p.x, y: mapValueToChart(label, p.y), yOriginal: p.y, label: p.label })),
    borderColor: COLORS.patient,
    backgroundColor: COLORS.patient,
    borderWidth: 2.5,
    borderDash: dash ?? [],
    tension: 0.35,
    // ── Bolder points ──────────────────────────────────────────
    pointRadius: 8,
    pointHoverRadius: 11,
    pointBorderWidth: 2.5,
    pointBorderColor: "#fff",
    pointBackgroundColor: COLORS.patient,
    // ── Draw order: high number = rendered on top ───────────────
    order: 0,
    spanGaps: true,
    fill: false,
  } as ExtendedDataset;
}

function getPixelAtChartX(meta: any, chartX: number): { x: number; y: number; angle: number } | null {
  if (!meta?.data?.length) return null;
  const pts: any[] = meta.data.filter((p: any) => p != null && p.x != null);
  if (!pts.length) return null;
  let lo: any = null, hi: any = null, loIdx = -1;
  for (let i = 0; i < pts.length; i++) {
    const pt = pts[i];
    if (pt.x <= chartX) { lo = pt; loIdx = i; }
    if (pt.x >= chartX && !hi) { hi = pt; }
  }
  if (!lo || !hi) return null;
  let p1 = lo, p2 = hi;
  if (lo === hi) {
    if (loIdx < pts.length - 1) p2 = pts[loIdx + 1];
    else if (loIdx > 0) p1 = pts[loIdx - 1];
    else return { x: lo.x, y: lo.y, angle: 0 };
  }
  const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  if (lo === hi) return { x: lo.x, y: lo.y, angle };
  const t = (chartX - lo.x) / (hi.x - lo.x);
  return { x: chartX, y: lo.y + t * (hi.y - lo.y), angle };
}

function drawOnLineLabel(ctx: CanvasRenderingContext2D, text: string, px: number, py: number, angle: number, font: string, color: string, yOffset: number = 0) {
  ctx.save();
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.translate(px, py);
  ctx.rotate(angle);
  const tw = ctx.measureText(text).width;
  const pad = 5, boxH = 16;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillRect(-tw / 2 - pad, yOffset - boxH / 2, tw + pad * 2, boxH);
  ctx.fillStyle = color;
  ctx.fillText(text, 0, yOffset);
  ctx.restore();
}

// ─── Plugin: background bands + axis labels + patient points on top ───────────
const fentonBackgroundPlugin = {
  id: "fentonBackground",
  afterDraw(chart: any) {
    const { ctx, chartArea, scales } = chart;
    if (!ctx) return;
    const { left, right, top, bottom } = chartArea;
    ctx.save();
    const splitPixel = scales.y.getPixelForValue(WEIGHT_BAND_MAX);

    ctx.fillStyle = "rgba(248,250,252,0.55)";
    ctx.fillRect(left, splitPixel, right - left, bottom - splitPixel);
    ctx.fillStyle = "rgba(250,251,253,0.35)";
    ctx.fillRect(left, top, right - left, splitPixel - top);

    ctx.save(); ctx.strokeStyle = "#475569"; ctx.lineWidth = 2.5; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(right, top); ctx.lineTo(right, bottom); ctx.stroke(); ctx.restore();

    const weightPixel0 = scales.y.getPixelForValue(0);
    const midWeightPixel = (weightPixel0 + splitPixel) / 2;
    const cmPixel60 = scales.y.getPixelForValue(60);
    const midCmPixel = (splitPixel + cmPixel60) / 2;
    ctx.save(); ctx.font = "bold 11px system-ui, sans-serif"; ctx.fillStyle = "#0f172a";
    [[left - 40, midWeightPixel, "Weight (kilograms)"], [left - 40, midCmPixel, "Centimeters"],
     [right + 50, midWeightPixel, "Weight (kilograms)"], [right + 50, midCmPixel, "Centimeters"]].forEach(([tx, ty, txt]) => {
      ctx.save(); ctx.translate(tx as number, ty as number); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.fillText(txt as string, 0, 0); ctx.restore();
    }); ctx.restore();

    const PERCENTILE_LABELS = ["3", "15", "50", "85", "97"];
    const SERIES_CONFIG = [
      { prefix: "Length", nameAtX: 30, percAtX: 47 },
      { prefix: "Head Circumference", nameAtX: 45, percAtX: 47 },
      { prefix: "Weight", nameAtX: 26, percAtX: 43 },
    ];
    SERIES_CONFIG.forEach(({ prefix, nameAtX, percAtX }) => {
      const matched = chart.data.datasets.map((ds: any, i: number) => ({ ds, i }))
        .filter(({ ds }: any) => ds.label?.startsWith(prefix) && !ds.label.includes("Patient"));
      if (!matched.length) return;
      matched.forEach(({ i }: any, pIdx: number) => {
        const meta = chart.getDatasetMeta(i);
        const isP50 = pIdx === 2;
        const percPt = getPixelAtChartX(meta, scales.x.getPixelForValue(percAtX));
        if (percPt && percPt.y >= top && percPt.y <= bottom)
          drawOnLineLabel(ctx, PERCENTILE_LABELS[pIdx], percPt.x, percPt.y, percPt.angle,
            isP50 ? "bold 11px system-ui, sans-serif" : "11px system-ui, sans-serif", "#475569");
        if (isP50) {
          const namePt = getPixelAtChartX(meta, scales.x.getPixelForValue(nameAtX));
          if (namePt && namePt.y >= top && namePt.y <= bottom)
            drawOnLineLabel(ctx, prefix === "Head Circumference" ? "Head Circ." : prefix,
              namePt.x, namePt.y, namePt.angle, "bold 12px system-ui, sans-serif", "#1e293b", -13);
        }
      });
    });

    // ── Re-draw patient points on top of everything ────────────────────────────
    chart.data.datasets.forEach((ds: any, i: number) => {
      if (!PATIENT_DATASET_LABELS.includes(ds.label)) return;
      const meta = chart.getDatasetMeta(i);
      if (!meta?.data?.length) return;
      meta.data.forEach((element: any) => {
        if (!element || element.x == null || element.y == null) return;
        const r = ds.pointRadius ?? 8;
        const bw = ds.pointBorderWidth ?? 2.5;
        ctx.save();
        ctx.beginPath();
        ctx.arc(element.x, element.y, r, 0, Math.PI * 2);
        ctx.fillStyle = ds.pointBackgroundColor ?? ds.backgroundColor ?? "#111827";
        ctx.fill();
        ctx.lineWidth = bw;
        ctx.strokeStyle = ds.pointBorderColor ?? "#fff";
        ctx.stroke();
        ctx.restore();
      });
    });

    ctx.restore();
  },
};

// ─── PDF download helper ───────────────────────────────────────────────────────
async function downloadChartAsPdf(wrapperEl: HTMLElement, filename: string) {
  // Dynamically import so bundle stays lean if user never clicks
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);

  const canvas = await html2canvas(wrapperEl, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
  });

  const imgData = canvas.toDataURL("image/png");
  const imgW = canvas.width;
  const imgH = canvas.height;

  // Landscape if wider than tall
  const orientation = imgW > imgH ? "landscape" : "portrait";
  const pdf = new jsPDF({ orientation, unit: "px", format: [imgW / 2, imgH / 2] });
  pdf.addImage(imgData, "PNG", 0, 0, imgW / 2, imgH / 2);
  pdf.save(filename);
}

// ─── PDF Button component ──────────────────────────────────────────────────────
function PdfButton({ wrapperRef, filename }: { wrapperRef: React.RefObject<HTMLDivElement | null>; filename: string }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (!wrapperRef.current || loading) return;
    setLoading(true);
    try {
      await downloadChartAsPdf(wrapperRef.current, filename);
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        color: loading ? "#94a3b8" : "#0f172a",
        fontSize: 13,
        fontWeight: 700,
        textDecoration: "underline",
        textUnderlineOffset: 3,
        cursor: loading ? "not-allowed" : "pointer",
        letterSpacing: "0.04em",
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
      }}
    >
      {loading ? (
        <>
          <span style={{ display: "inline-block", width: 11, height: 11, border: "2px solid #94a3b8", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
          Generating…
        </>
      ) : "GET PDF"}
    </button>
  );
}

// Inject spinner keyframes once
if (typeof document !== "undefined" && !document.getElementById("fenton-pdf-spin")) {
  const st = document.createElement("style");
  st.id = "fenton-pdf-spin";
  st.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(st);
}

// ─── Main FentonChart component ───────────────────────────────────────────────
export default function FentonChart({ gender, patientData, sidebarContent, onSidebarOpen }: FentonChartProps) {
  if (gender === "") {
    console.warn("[FentonChart] gender prop is empty.");
  }

  const chartWrapperRef = useRef<HTMLDivElement>(null);
  const showReference = gender === "male" || gender === "female";
  const isMale = gender === "male";

  const xMax = useMemo(() => {
    const weeks = patientData.map(p => p.week).filter(Number.isFinite);
    return weeks.length ? Math.max(50, Math.ceil(Math.max(...weeks)) + 1) : 50;
  }, [patientData]);

  const yTickValues = useMemo(() => {
    const wR  = showReference ? (isMale ? FENTON_WEIGHT_BOYS : FENTON_WEIGHT_GIRLS) : [];
    const lR  = showReference ? (isMale ? FENTON_LENGTH_BOYS : FENTON_LENGTH_GIRLS) : [];
    const hcR = showReference ? (isMale ? FENTON_HC_BOYS     : FENTON_HC_GIRLS)     : [];
    const allWeights: number[] = [...wR.flatMap(p => [p.p3, p.p97])];
    const allCms: number[] = [...lR.flatMap(p => [p.p3, p.p97]), ...hcR.flatMap(p => [p.p3, p.p97])];
    patientData.forEach(p => {
      if (p.weight  != null) allWeights.push(p.weight);
      if (p.height  != null) allCms.push(p.height);
      if (p.headCirc != null) allCms.push(p.headCirc);
    });
    return buildYTicks(
      allWeights.length ? Math.min(...allWeights) : 0,
      allWeights.length ? Math.max(...allWeights) : 10,
      allCms.length ? Math.min(...allCms) : CM_RAW_MIN,
      allCms.length ? Math.max(...allCms) : CM_RAW_MAX,
    );
  }, [gender, patientData, showReference, isMale]);

  const datasets: ExtendedDataset[] = useMemo(() => {
    const showRef = gender === "male" || gender === "female";
    const male = gender === "male";
    const wRef  = showRef ? (male ? FENTON_WEIGHT_BOYS : FENTON_WEIGHT_GIRLS) : [];
    const lRef  = showRef ? (male ? FENTON_LENGTH_BOYS : FENTON_LENGTH_GIRLS) : [];
    const hcRef = showRef ? (male ? FENTON_HC_BOYS     : FENTON_HC_GIRLS)     : [];

    const patientLength = {
      ...buildPatientDataset("Patient Length",
        patientData.filter((p): p is PatientPoint & { height: number } => p.height != null)
          .map(p => ({ x: p.week, y: p.height, label: p.label })), [6, 4]),
      borderColor: "#16a34a", backgroundColor: "#16a34a",
      pointBackgroundColor: "#16a34a", pointBorderColor: "#fff",
      borderWidth: 4, pointRadius: 8, pointHoverRadius: 11, pointBorderWidth: 2.5,
      order: 0,
    };
    const patientHead = {
      ...buildPatientDataset("Patient Head Circumference",
        patientData.filter((p): p is PatientPoint & { headCirc: number } => p.headCirc != null)
          .map(p => ({ x: p.week, y: p.headCirc, label: p.label })), [6, 4]),
      borderColor: "#dc2626", backgroundColor: "#dc2626",
      pointBackgroundColor: "#dc2626", pointBorderColor: "#fff",
      borderWidth: 4, pointRadius: 8, pointHoverRadius: 11, pointBorderWidth: 2.5,
      order: 0,
    };
    const patientWeight = {
      ...buildPatientDataset("Patient Weight",
        patientData.filter((p): p is PatientPoint & { weight: number } => p.weight != null)
          .map(p => ({ x: p.week, y: p.weight, label: p.label })), [6, 4]),
      borderColor: "#ca8a04", backgroundColor: "#ca8a04",
      pointBackgroundColor: "#ca8a04", pointBorderColor: "#fff",
      borderWidth: 4, pointRadius: 8, pointHoverRadius: 11, pointBorderWidth: 2.5,
      order: 0,
    };
    const rightAxisHelper: ExtendedDataset = {
      label: "yRightHelper",
      data: [{ x: X_MIN, y: 0 }],
      yAxisID: "yRight",
      borderWidth: 0, pointRadius: 0, pointHoverRadius: 0,
      tension: 0, showLine: false, fill: false,
      backgroundColor: "transparent", borderColor: "transparent",
      order: 999,
    } as ExtendedDataset;

    // Reference curves get a high order so they render before patient points
    const refSeries = [
      ...buildSeries(lRef, "Length"),
      ...buildSeries(hcRef, "Head Circumference"),
      ...buildSeries(wRef, "Weight"),
    ].map(ds => ({ ...ds, order: 10 }));

    return [...refSeries, patientLength, patientHead, patientWeight, rightAxisHelper];
  }, [gender, patientData]);

  const data: ChartData<"line"> = useMemo(() => ({ datasets: datasets as ChartDataset<"line">[] }), [datasets]);

  const options: ChartOptions<"line"> = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    parsing: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: items => (items[0]?.raw as any)?.label || undefined,
          label: ctx => {
            const rawValue = (ctx.raw as any)?.yOriginal ?? ctx.parsed.y;
            const unit = ctx.dataset.label?.toLowerCase().includes("weight") ? "kg" : "cm";
            return `${ctx.dataset.label}: ${typeof rawValue === "number" ? rawValue.toFixed(1) : rawValue} ${unit}`;
          },
        }
      },
    },
    layout: { padding: { left: 70, right: 100, top: 24, bottom: 10 } },
    scales: {
      x: {
        type: "linear", min: X_MIN, max: xMax,
        title: { display: true, text: "Gestational age (weeks)", color: "#475569", font: { size: 12, weight: 600 } },
        ticks: { stepSize: 2, color: "#475569", font: { size: 11 } },
        grid: { color: "#e2e8f0" },
      },
      y: {
        min: Y_MIN, max: Y_MAX, title: { display: false },
        ticks: { values: yTickValues, autoSkip: false, maxTicksLimit: 50, display: true, color: "#475569", font: { size: 11 }, callback: value => formatTick(Number(value)), padding: 10 },
        grid: { color: "#e8ebef", drawBorder: true, borderColor: "#475569", borderWidth: 1 },
      },
      yRight: {
        position: "right", min: Y_MIN, max: Y_MAX, title: { display: false },
        ticks: { values: yTickValues, autoSkip: false, maxTicksLimit: 50, display: true, color: "#475569", font: { size: 11 }, callback: value => formatTick(Number(value)), padding: 10 },
        grid: { drawOnChartArea: false, drawBorder: true, borderColor: "#475569", borderWidth: 1 },
      },
    },
  }), [yTickValues, xMax]);

  const pdfFilename = `fenton-${gender || "chart"}.pdf`;

  // ── Layout: sidebar (optional) + chart ──────────────────────────────────────
  if (sidebarContent) {
    return (
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", width: "100%" }}>
        <CollapsibleSidebar title="Patient Info" defaultOpen={true}>
          {sidebarContent}
        </CollapsibleSidebar>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <PdfButton wrapperRef={chartWrapperRef} filename={pdfFilename} />
          </div>
          <div ref={chartWrapperRef} style={{ minHeight: 920, backgroundColor: "#fff" }}>
            {!showReference && (
              <p style={{ textAlign: "center", color: "#ef4444", fontSize: 13, marginBottom: 8, fontWeight: 600 }}>
                Select a gender to display Fenton reference curves.
              </p>
            )}
            <Line data={data} options={options} plugins={[fentonBackgroundPlugin]} />
          </div>
        </div>
      </div>
    );
  }

  // No sidebar — original layout
  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <PdfButton wrapperRef={chartWrapperRef} filename={pdfFilename} />
      </div>
      <div ref={chartWrapperRef} style={{ minHeight: 920, backgroundColor: "#fff" }}>
        {!showReference && (
          <p style={{ textAlign: "center", color: "#ef4444", fontSize: 13, marginBottom: 8, fontWeight: 600 }}>
            Select a gender to display Fenton reference curves.
          </p>
        )}
        <Line data={data} options={options} plugins={[fentonBackgroundPlugin]} />
      </div>
    </div>
  );
}