import { useMemo } from "react";
import { Line } from "react-chartjs-2";
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
}

// Extend ChartDataset to allow yAxisID (Chart.js supports it but TS types may not expose it cleanly)
type ExtendedDataset = ChartDataset<"line"> & { yAxisID?: string };

const X_MIN = 22;
const X_MAX = 50;
const Y_MIN = 0;
const Y_MAX = 60;
const WEIGHT_BAND_MAX = 18; // weight band takes bottom 18 chart-units
const WEIGHT_RAW_MAX = 10; // max raw weight kg (WHO post-term reaches ~9 kg)
const CM_RAW_MIN = 15;
const CM_RAW_MAX = 85; // length p97 at 50w ~80 cm; HC p97 ~53 cm — give headroom
const REF_WEEKS = [22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50] as const;
const PERCENTILES = ["p3", "p15", "p50", "p85", "p97"] as const;

function mapWeightValue(value: number) {
  return (value / WEIGHT_RAW_MAX) * WEIGHT_BAND_MAX;
}

function mapCmValue(value: number) {
  return WEIGHT_BAND_MAX + ((value - CM_RAW_MIN) / (CM_RAW_MAX - CM_RAW_MIN)) * (Y_MAX - WEIGHT_BAND_MAX);
}

function mapValueToChart(label: string, value: number) {
  return label.toLowerCase().includes("weight")
    ? mapWeightValue(value)
    : mapCmValue(value);
}

// FIX #3: Guard against empty arrays to avoid Infinity/-Infinity from Math.min/max
function buildYTicks(
  weightMin: number, weightMax: number,
  cmMin: number, cmMax: number
): number[] {
  // Weight ticks: 0.5 kg steps, clamped to data range with 1-step padding
  const wStep = 0.5;
  const wLo = Math.max(0, Math.floor(weightMin / wStep - 1) * wStep);
  const wHi = Math.min(10, Math.ceil(weightMax / wStep + 1) * wStep);
  const weightTicks: number[] = [];
  for (let v = wLo; v <= wHi + 0.001; v = Math.round((v + wStep) * 100) / 100) {
    weightTicks.push(mapWeightValue(v));
  }

  // CM ticks: 5 cm steps, clamped to data range with 1-step padding
  const cmStep = 5;
  const cmLo = Math.max(15, Math.floor(cmMin / cmStep - 1) * cmStep);
  const cmHi = Math.min(85, Math.ceil(cmMax / cmStep + 1) * cmStep);
  const cmTicks: number[] = [];
  for (let v = cmLo; v <= cmHi + 0.001; v += cmStep) {
    cmTicks.push(mapCmValue(v));
  }

  return [...weightTicks, ...cmTicks];
}

function formatTick(value: number) {
  if (value <= WEIGHT_BAND_MAX) {
    let raw = (value / WEIGHT_BAND_MAX) * WEIGHT_RAW_MAX;
    raw = Math.round(raw * 2) / 2; // nearest 0.5 kg
    return raw.toFixed(1);
  }
  const raw = CM_RAW_MIN + ((value - WEIGHT_BAND_MAX) / (Y_MAX - WEIGHT_BAND_MAX)) * (CM_RAW_MAX - CM_RAW_MIN);
  return Math.round(raw).toString();
}

const COLORS = {
  reference: "#6b7280",
  patient: "#111827",
};

// FIX #4: Return null when x is strictly outside the data range instead of extrapolating
function interpolateRef(data: RefPoint[], x: number): Omit<RefPoint, "x"> | null {
  if (!data.length) return null;
  const sorted = [...data].sort((a, b) => a.x - b.x);

  // Strictly out of range → return null to avoid extrapolation
  if (x < sorted[0].x || x > sorted[sorted.length - 1].x) return null;

  // Exact match at boundary
  if (x === sorted[0].x) return sorted[0];
  if (x === sorted[sorted.length - 1].x) return sorted[sorted.length - 1];

  const lo = sorted.filter(d => d.x <= x).pop()!;
  const hi = sorted.find(d => d.x > x)!;
  const t = (x - lo.x) / (hi.x - lo.x);
  const lerp = (a: number, b: number) => a + t * (b - a);
  return {
    p3: lerp(lo.p3, hi.p3),
    p15: lerp(lo.p15, hi.p15),
    p50: lerp(lo.p50, hi.p50),
    p85: lerp(lo.p85, hi.p85),
    p97: lerp(lo.p97, hi.p97),
  };
}

function buildSeries(refData: RefPoint[], label: string): ExtendedDataset[] {
  return PERCENTILES.map((percentile) => {
    const data = REF_WEEKS.map(w => {
      const point = interpolateRef(refData, w);
      if (!point || point[percentile] == null) return null;
      const raw = point[percentile];
      return {
        x: w,
        y: mapValueToChart(label, raw),
        yOriginal: raw,
      };
    }).filter((point): point is { x: number; y: number; yOriginal: number } => point != null);

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

// FIX #7: Use type predicate in filter so non-null assertion is unnecessary
function buildPatientDataset(
  label: string,
  points: Array<{ x: number; y: number; label?: string }>,
  dash?: number[]
): ExtendedDataset {
  return {
    label,
    data: points.map(point => ({
      x: point.x,
      y: mapValueToChart(label, point.y),
      yOriginal: point.y,
      label: point.label,
    })),
    borderColor: COLORS.patient,
    backgroundColor: COLORS.patient,
    borderWidth: 2.5,
    borderDash: dash ?? [],
    tension: 0.35,
    pointRadius: 4,
    pointBackgroundColor: COLORS.patient,
    pointBorderColor: "#fff",
    pointBorderWidth: 1.5,
    spanGaps: true,
    fill: false,
  } as ExtendedDataset;
}

// ─── Plugin helper functions (module-scoped to avoid re-creation on every draw) ──

function getPixelAtChartX(meta: any, chartX: number): { x: number; y: number } | null {
  if (!meta?.data?.length) return null;
  const pts: any[] = meta.data.filter((p: any) => p != null && p.x != null);
  if (!pts.length) return null;
  let lo: any = null, hi: any = null;
  for (const pt of pts) {
    if (pt.x <= chartX) lo = pt;
    if (pt.x >= chartX && !hi) hi = pt;
  }
  if (!lo && hi) return hi;
  if (lo && !hi) return lo;
  if (!lo || !hi) return null;
  if (lo === hi) return lo;
  const t = (chartX - lo.x) / (hi.x - lo.x);
  return { x: chartX, y: lo.y + t * (hi.y - lo.y) };
}

function drawOnLineLabel(
  ctx: CanvasRenderingContext2D,
  text: string, px: number, py: number,
  font: string, color: string
) {
  ctx.save();
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const tw = ctx.measureText(text).width;
  const pad = 5;
  const boxH = 16;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillRect(px - tw / 2 - pad, py - boxH / 2, tw + pad * 2, boxH);
  ctx.fillStyle = color;
  ctx.fillText(text, px, py);
  ctx.restore();
}

const fentonBackgroundPlugin = {
  id: "fentonBackground",
  afterDraw(chart: any) {
    const { ctx, chartArea, scales } = chart;
    if (!ctx) return;
    const { left, right, top, bottom } = chartArea;

    // FIX #1/#2: Single ctx.save() at the top; restore canvas state cleanly at the end.
    // All intermediate draws use nested save/restore pairs so state never bleeds.
    ctx.save();

    const splitPixel = scales.y.getPixelForValue(WEIGHT_BAND_MAX);

    // ── Background bands ──
    ctx.fillStyle = "rgba(248,250,252,0.55)";
    ctx.fillRect(left, splitPixel, right - left, bottom - splitPixel);
    ctx.fillStyle = "rgba(250,251,253,0.35)";
    ctx.fillRect(left, top, right - left, splitPixel - top);

    // ── Divider line between weight and cm bands ──
    // FIX #2: Reset strokeStyle and lineDash explicitly before each distinct draw operation.
    ctx.save();
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(left, splitPixel);
    ctx.lineTo(right, splitPixel);
    ctx.stroke();
    ctx.restore();

    // ── Right-side border ──
    ctx.save();
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(right, top);
    ctx.lineTo(right, bottom);
    ctx.stroke();
    ctx.restore();

    // ── Term (40w) dashed vertical line ──
    ctx.save();
    const x40 = scales.x.getPixelForValue(40);
    ctx.strokeStyle = "#475569";
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x40, top);
    ctx.lineTo(x40, bottom);
    ctx.stroke();
    ctx.restore(); // dash cleared here; no bleed into subsequent draws

    // ── "Term (40w)" label above the dashed line ──
    ctx.save();
    ctx.fillStyle = "#475569";
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Term (40w)", x40, top - 8);
    ctx.restore();

    // ── Left & right axis labels ──
    ctx.save();
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.fillStyle = "#0f172a";

    const weightPixel0 = scales.y.getPixelForValue(0);
    const midWeightPixel = (weightPixel0 + splitPixel) / 2;
    const cmPixel60 = scales.y.getPixelForValue(60);
    const midCmPixel = (splitPixel + cmPixel60) / 2;

    // Left weight
    ctx.save();
    ctx.translate(left - 40, midWeightPixel);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("Weight (kilograms)", 0, 0);
    ctx.restore();

    // Left cm
    ctx.save();
    ctx.translate(left - 40, midCmPixel);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("Centimeters", 0, 0);
    ctx.restore();

    // Right weight
    ctx.save();
    ctx.translate(right + 40, midWeightPixel);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("Weight (kilograms)", 0, 0);
    ctx.restore();

    // Right cm
    ctx.save();
    ctx.translate(right + 40, midCmPixel);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("Centimeters", 0, 0);
    ctx.restore();

    ctx.restore(); // closes the outer save from font/fillStyle block

    // ── Inline labels drawn directly ON the lines ──
    const PERCENTILE_LABELS = ["3", "15", "50", "85", "97"];

    const SERIES_CONFIG: { prefix: string; nameAtX: number; percAtX: number }[] = [
      { prefix: "Length", nameAtX: 26, percAtX: 47 },
      { prefix: "Head Circumference", nameAtX: 26, percAtX: 47 },
      { prefix: "Weight", nameAtX: 26, percAtX: 43 },
    ];

    SERIES_CONFIG.forEach(({ prefix, nameAtX, percAtX }) => {
      const matched = chart.data.datasets
        .map((ds: any, i: number) => ({ ds, i }))
        .filter(({ ds }: any) => ds.label?.startsWith(prefix) && !ds.label.includes("Patient"));
      if (!matched.length) return;

      matched.forEach(({ i }: any, pIdx: number) => {
        const meta = chart.getDatasetMeta(i);
        const isP50 = pIdx === 2;

        // Draw percentile number on every line
        const percPixelX = scales.x.getPixelForValue(percAtX);
        const percPt = getPixelAtChartX(meta, percPixelX);
        if (percPt && percPt.y >= top && percPt.y <= bottom) {
          drawOnLineLabel(
            ctx,
            PERCENTILE_LABELS[pIdx],
            percPt.x, percPt.y,
            isP50 ? "bold 11px system-ui, sans-serif" : "11px system-ui, sans-serif",
            "#475569"
          );
        }

        // Draw series name label above the p50 line only
        if (isP50) {
          const namePixelX = scales.x.getPixelForValue(nameAtX);
          const namePt = getPixelAtChartX(meta, namePixelX);
          if (namePt && namePt.y >= top && namePt.y <= bottom) {
            const shortName = prefix === "Head Circumference" ? "Head Circ." : prefix;
            drawOnLineLabel(
              ctx,
              shortName,
              namePt.x, namePt.y - 13,
              "bold 12px system-ui, sans-serif",
              "#1e293b"
            );
          }
        }
      });
    });

    // ── Balance the outermost ctx.save() ──
    ctx.restore();
  },
};

export default function FentonChart({ gender, patientData }: FentonChartProps) {
  // FIX #5: Warn (dev-only) when gender is unset; use female as safe fallback but make it explicit.
  if (process.env.NODE_ENV !== "production" && gender === "") {
    console.warn(
      "[FentonChart] gender prop is empty. Reference curves will not be rendered. " +
      "Pass 'male' or 'female' to display Fenton reference data."
    );
  }

  const showReference = gender === "male" || gender === "female";
  const isMale = gender === "male";

  // FIX #3: Guard against empty arrays before spreading into Math.min/max
  const yTickValues = useMemo(() => {
    // Derive ref arrays inside memo so gender is the sole dep and no stale refs occur
    const wR = showReference ? (isMale ? FENTON_WEIGHT_BOYS : FENTON_WEIGHT_GIRLS) : [];
    const lR = showReference ? (isMale ? FENTON_LENGTH_BOYS : FENTON_LENGTH_GIRLS) : [];
    const hcR = showReference ? (isMale ? FENTON_HC_BOYS : FENTON_HC_GIRLS) : [];

    const allWeights: number[] = [...wR.flatMap(p => [p.p3, p.p97])];
    const allCms: number[] = [
      ...lR.flatMap(p => [p.p3, p.p97]),
      ...hcR.flatMap(p => [p.p3, p.p97]),
    ];

    patientData.forEach(p => {
      if (p.weight != null) allWeights.push(p.weight);
      if (p.height != null) allCms.push(p.height);
      if (p.headCirc != null) allCms.push(p.headCirc);
    });

    // Safe fallbacks when arrays are empty (e.g. gender === "")
    const wMin = allWeights.length > 0 ? Math.min(...allWeights) : 0;
    const wMax = allWeights.length > 0 ? Math.max(...allWeights) : 10;
    const cmMin = allCms.length > 0 ? Math.min(...allCms) : CM_RAW_MIN;
    const cmMax = allCms.length > 0 ? Math.max(...allCms) : CM_RAW_MAX;

    return buildYTicks(wMin, wMax, cmMin, cmMax);
  }, [gender, patientData]);

  const datasets: ExtendedDataset[] = useMemo(() => {
    // FIX #2: Derive ref arrays inside memo so gender is the sole dep — no stale external refs
    const showRef = gender === "male" || gender === "female";
    const male = gender === "male";
    const wRef = showRef ? (male ? FENTON_WEIGHT_BOYS : FENTON_WEIGHT_GIRLS) : [];
    const lRef = showRef ? (male ? FENTON_LENGTH_BOYS : FENTON_LENGTH_GIRLS) : [];
    const hcRef = showRef ? (male ? FENTON_HC_BOYS : FENTON_HC_GIRLS) : [];

    const lengthSets = buildSeries(lRef, "Length");
    const headSets = buildSeries(hcRef, "Head Circumference");
    const weightSets = buildSeries(wRef, "Weight");

    // FIX #7: Use type predicates in filter so no non-null assertions needed
    const patientLength = buildPatientDataset(
      "Patient Length",
      patientData
        .filter((p): p is PatientPoint & { height: number } => p.height != null)
        .map(p => ({ x: p.week, y: p.height, label: p.label }))
    );
    const patientHead = buildPatientDataset(
      "Patient Head Circumference",
      patientData
        .filter((p): p is PatientPoint & { headCirc: number } => p.headCirc != null)
        .map(p => ({ x: p.week, y: p.headCirc, label: p.label })),
      [6, 4]
    );
    const patientWeight = buildPatientDataset(
      "Patient Weight",
      patientData
        .filter((p): p is PatientPoint & { weight: number } => p.weight != null)
        .map(p => ({ x: p.week, y: p.weight, label: p.label })),
      [2, 2]
    );

    // FIX #6: Cast helper dataset as ExtendedDataset to satisfy yAxisID typing
    const rightAxisHelper: ExtendedDataset = {
      label: "yRightHelper",
      data: [{ x: X_MIN, y: 0 }],
      yAxisID: "yRight",
      borderWidth: 0,
      pointRadius: 0,
      pointHoverRadius: 0,
      tension: 0,
      showLine: false,
      fill: false,
      backgroundColor: "transparent",
      borderColor: "transparent",
    } as ExtendedDataset;

    return [...lengthSets, ...headSets, ...weightSets, patientLength, patientHead, patientWeight, rightAxisHelper];
  }, [gender, patientData]);

  const data: ChartData<"line"> = useMemo(() => ({
    datasets: datasets as ChartDataset<"line">[],
  }), [datasets]);

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
        },
      },
    },
    layout: {
      padding: { left: 70, right: 100, top: 24, bottom: 10 },
    },
    scales: {
      x: {
        type: "linear",
        min: X_MIN,
        max: X_MAX,
        title: {
          display: true,
          text: "Gestational age (weeks)",
          color: "#475569",
          font: { size: 12, weight: "600" },
        },
        ticks: {
          stepSize: 2,
          color: "#475569",
          font: { size: 11 },
        },
        grid: { color: "#e2e8f0" },
      },
      y: {
        min: Y_MIN,
        max: Y_MAX,
        title: { display: false },
        ticks: {
          values: yTickValues,
          autoSkip: false,
          maxTicksLimit: 50,
          display: true,
          color: "#475569",
          font: { size: 11 },
          callback: value => formatTick(Number(value)),
          padding: 10,
        },
        grid: {
          color: "#e8ebef",
          drawBorder: true,
          borderColor: "#475569",
          borderWidth: 1,
        },
      },
      yRight: {
        position: "right",
        min: Y_MIN,
        max: Y_MAX,
        title: { display: false },
        ticks: {
          values: yTickValues,
          autoSkip: false,
          maxTicksLimit: 50,
          display: true,
          color: "#475569",
          font: { size: 11 },
          callback: value => formatTick(Number(value)),
          padding: 10,
        },
        grid: {
          drawOnChartArea: false,
          drawBorder: true,
          borderColor: "#475569",
          borderWidth: 1,
        },
      },
    },
  }), [yTickValues]);

  return (
    <div style={{ width: "100%", minHeight: 920 }}>
      {!showReference && (
        <p style={{
          textAlign: "center",
          color: "#ef4444",
          fontSize: 13,
          marginBottom: 8,
          fontWeight: 600,
        }}>
          Select a gender to display Fenton reference curves.
        </p>
      )}
      <Line
        data={data}
        options={options}
        plugins={[fentonBackgroundPlugin]}
      />
    </div>
  );
}