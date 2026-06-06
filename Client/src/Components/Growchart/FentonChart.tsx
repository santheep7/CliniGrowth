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

function formatValue(label: string, value: number) {
  return label.toLowerCase().includes("weight") ? `${value.toFixed(1)} kg` : `${value.toFixed(1)} cm`;
}

// Y ticks are generated dynamically inside the component based on data range
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
    // convert chart-space back to raw kg and snap to 0.5 kg increments
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

function interpolateRef(data: RefPoint[], x: number): Omit<RefPoint, "x"> | null {
  if (!data.length) return null;
  const sorted = [...data].sort((a, b) => a.x - b.x);
  if (x <= sorted[0].x) return sorted[0];
  if (x >= sorted[sorted.length - 1].x) return sorted[sorted.length - 1];
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

function buildSeries(refData: RefPoint[], label: string) {
  return PERCENTILES.map((percentile, index) => {
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
    };
  });
}

function buildPatientDataset(label: string, points: Array<{ x: number; y: number; label?: string }>, dash?: number[]) {
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
  };
}

const fentonBackgroundPlugin = {
  id: "fentonBackground",
  afterDraw(chart: any) {
    const { ctx, chartArea, scales } = chart;
    if (!ctx) return;
    const { left, right, top, bottom } = chartArea;
    const splitPixel = scales.y.getPixelForValue(WEIGHT_BAND_MAX);
    ctx.save();
    ctx.fillStyle = "rgba(248,250,252,0.55)";
    ctx.fillRect(left, splitPixel, right - left, bottom - splitPixel);
    ctx.fillStyle = "rgba(250,251,253,0.35)";
    ctx.fillRect(left, top, right - left, splitPixel - top);
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(left, splitPixel);
    ctx.lineTo(right, splitPixel);
    ctx.stroke();

    // Draw right-side border to match y-axis left border
    ctx.beginPath();
    ctx.moveTo(right, top);
    ctx.lineTo(right, bottom);
    ctx.stroke();

    const x40 = scales.x.getPixelForValue(40);
    ctx.strokeStyle = "#475569";
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x40, top);
    ctx.lineTo(x40, bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#475569";
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Term (40w)", x40, top - 8);

    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.fillStyle = "#0f172a";

    const weightPixel0 = scales.y.getPixelForValue(0);
    const midWeightPixel = (weightPixel0 + splitPixel) / 2;
    const cmPixel60 = scales.y.getPixelForValue(60);
    const midCmPixel = (splitPixel + cmPixel60) / 2;

    // Left-side vertical labels
    ctx.save();
    ctx.translate(left - 40, midWeightPixel);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("Weight (kilograms)", 0, 0);
    ctx.restore();

    ctx.save();
    ctx.translate(left - 40, midCmPixel);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("Centimeters", 0, 0);
    ctx.restore();

    // Right-side vertical labels
    ctx.save();
    ctx.translate(right + 40, midWeightPixel);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("Weight (kilograms)", 0, 0);
    ctx.restore();

    ctx.save();
    ctx.translate(right + 40, midCmPixel);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("Centimeters", 0, 0);
    ctx.restore();

    // ── Inline labels drawn directly ON the lines ──
    // Series name on the p50 curve, percentile numbers on every curve

    const PERCENTILE_LABELS = ["3", "15", "50", "85", "97"];

    const SERIES_CONFIG: { prefix: string; nameAtX: number; percAtX: number }[] = [
      { prefix: "Length",             nameAtX: 26, percAtX: 47 },
      { prefix: "Head Circumference", nameAtX: 26, percAtX: 47 },
      { prefix: "Weight",             nameAtX: 26, percAtX: 43 },
    ];

    function getPixelAtChartX(meta: any, chartX: number) {
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
              shortName,
              namePt.x, namePt.y - 13,
              "bold 12px system-ui, sans-serif",
              "#1e293b"
            );
          }
        }
      });
    });

    ctx.restore();
  },
};

export default function FentonChart({ gender, patientData }: FentonChartProps) {
  const isMale = gender === "male";
  const wRef = isMale ? FENTON_WEIGHT_BOYS : FENTON_WEIGHT_GIRLS;
  const lRef = isMale ? FENTON_LENGTH_BOYS : FENTON_LENGTH_GIRLS;
  const hcRef = isMale ? FENTON_HC_BOYS : FENTON_HC_GIRLS;

  // Compute dynamic Y tick range from reference data + patient data
  const yTickValues = useMemo(() => {
    // Gather all weight values from ref data
    const allWeights = wRef.flatMap(p => [p.p3, p.p97]);
    const allCms = [
      ...lRef.flatMap(p => [p.p3, p.p97]),
      ...hcRef.flatMap(p => [p.p3, p.p97]),
    ];
    // Include patient data in range calculation
    patientData.forEach(p => {
      if (p.weight != null) allWeights.push(p.weight);
      if (p.height != null) allCms.push(p.height);
      if (p.headCirc != null) allCms.push(p.headCirc);
    });
    const wMin = Math.min(...allWeights);
    const wMax = Math.max(...allWeights);
    const cmMin = Math.min(...allCms);
    const cmMax = Math.max(...allCms);
    return buildYTicks(wMin, wMax, cmMin, cmMax);
  }, [gender, patientData]);

  const datasets = useMemo(() => {
    const lengthSets = buildSeries(lRef, "Length");
    const headSets = buildSeries(hcRef, "Head Circumference");
    const weightSets = buildSeries(wRef, "Weight");
    const patientLength = buildPatientDataset(
      "Patient Length",
      patientData.filter(p => p.height != null).map(p => ({ x: p.week, y: p.height!, label: p.label }))
    );
    const patientHead = buildPatientDataset(
      "Patient Head Circumference",
      patientData.filter(p => p.headCirc != null).map(p => ({ x: p.week, y: p.headCirc!, label: p.label })),
      [6, 4]
    );
    const patientWeight = buildPatientDataset(
      "Patient Weight",
      patientData.filter(p => p.weight != null).map(p => ({ x: p.week, y: p.weight!, label: p.label })),
      [2, 2]
    );
    const rightAxisHelper = {
      label: "yRightHelper",
      data: [{ x: X_MIN, y: 0 }],
      yAxisID: "yRight",
      borderWidth: 0,
      pointRadius: 0,
      hoverRadius: 0,
      tension: 0,
      showLine: false,
      fill: false,
      backgroundColor: "transparent",
      borderColor: "transparent",
    };
    return [...lengthSets, ...headSets, ...weightSets, patientLength, patientHead, patientWeight, rightAxisHelper];
  }, [gender, patientData]);

  const data: ChartData<"line"> = useMemo(() => ({ datasets }), [datasets]);

  const options: ChartOptions<"line"> = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    parsing: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: items => items[0]?.raw?.label ?? "",
          label: ctx => {
            const rawValue = ctx.raw?.yOriginal ?? ctx.parsed.y;
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
        title: {
          display: false,
        },
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
        title: {
          display: false,
        },
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
      <Line data={data} options={options} plugins={[fentonBackgroundPlugin]} />
    </div>
  );
}