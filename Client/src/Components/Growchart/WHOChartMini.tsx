import * as React from "react";
import { useMemo, useState } from "react";
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
  WHO_WEIGHT_BOYS,
  WHO_WEIGHT_GIRLS,
  WHO_LENGTH_BOYS,
  WHO_LENGTH_GIRLS,
  WHO_HC_BOYS,
  WHO_HC_GIRLS,
  type RefPoint,
} from "./referenceData";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler, Title);

type Metric = "height" | "weight" | "headCirc";
type GenderView = "both" | "male" | "female";
type Gender = "male" | "female" | "";
type MetricFilter = "all" | Metric;

interface PatientPoint {
  week: number;
  height: number | null;
  weight: number | null;
  headCirc: number | null;
  label?: string;
}

interface WHOChartMiniProps {
  gender: Gender;
  patientData: PatientPoint[];
  height?: number;
}

function interpolate(data: RefPoint[], x: number): Omit<RefPoint, "x"> | null {
  if (!data || !data.length) return null;
  const sorted = [...data].sort((a, b) => a.x - b.x);
  if (x <= sorted[0].x) return sorted[0];
  if (x >= sorted[sorted.length - 1].x) {
    const maxPt = sorted[sorted.length - 1];
    const weeksPast = x - maxPt.x;
    const factor = 1 + (weeksPast / 250) * 0.7;
    return {
      p3:  parseFloat((maxPt.p3  * factor).toFixed(2)),
      p15: parseFloat((maxPt.p15 * factor).toFixed(2)),
      p50: parseFloat((maxPt.p50 * factor).toFixed(2)),
      p85: parseFloat((maxPt.p85 * factor).toFixed(2)),
      p97: parseFloat((maxPt.p97 * factor).toFixed(2)),
    };
  }
  const lo = sorted.filter((d) => d.x <= x).pop()!;
  const hi = sorted.find((d) => d.x > x)!;
  const t = (x - lo.x) / (hi.x - lo.x);
  const l = (a: number, b: number) => parseFloat((a + t * (b - a)).toFixed(2));
  return { p3: l(lo.p3, hi.p3), p15: l(lo.p15, hi.p15), p50: l(lo.p50, hi.p50), p85: l(lo.p85, hi.p85), p97: l(lo.p97, hi.p97) };
}

function formatWeekLabel(week: number) {
  if (week <= 40) return `${Math.round(week)}w`;
  const weeksPast = week - 40;
  const years = Math.floor(weeksPast / 52);
  const months = Math.round((weeksPast % 52) / 4.333);
  if (months === 0) return `${years} yr`;
  if (months === 12) return `${years + 1} yr`;
  return years > 0 ? `${years}y ${months}m` : `${months}m`;
}

function ceilTo(v: number, step: number) {
  return Math.ceil(v / step) * step;
}

const PERCENTILE_COLORS = ["#22d3ee", "#34d399", "#3b82f6", "#f59e0b", "#f43f5e"];
const PCTS = ["3rd", "15th", "50th", "85th", "97th"] as const;
const PERCENTILE_KEYS = ["p3", "p15", "p50", "p85", "p97"] as const;
const PATIENT_COLOR = "#111827";

function getRefData(metric: Metric, isMale: boolean): RefPoint[] {
  if (metric === "height") return isMale ? WHO_LENGTH_BOYS  : WHO_LENGTH_GIRLS;
  if (metric === "weight") return isMale ? WHO_WEIGHT_BOYS  : WHO_WEIGHT_GIRLS;
  return isMale ? WHO_HC_BOYS : WHO_HC_GIRLS;
}

const WHO_MAX_WEEK = 40 + 5 * 52;

function buildRefWeeks(): number[] {
  const weeks: number[] = [];
  for (let w = 40; w <= 52; w += 2) weeks.push(w);
  for (let y = 1; y <= 5; y++) {
    const base = 40 + y * 52;
    [base + 8.67, base + 17.33, base + 26, base + 34.67, base + 43.33, base + 52]
      .filter((w) => w <= WHO_MAX_WEEK)
      .forEach((w) => weeks.push(w));
  }
  if (!weeks.includes(WHO_MAX_WEEK)) weeks.push(WHO_MAX_WEEK);
  return weeks;
}

function buildDatasets(
  patientData: PatientPoint[],
  metric: Metric,
  genderView: GenderView
): ChartDataset<"line">[] {
  const refWeeks = buildRefWeeks();
  const showBoys  = genderView === "both" || genderView === "male";
  const showGirls = genderView === "both" || genderView === "female";
  const datasets: ChartDataset<"line">[] = [];

  (["male", "female"] as const).forEach((sex) => {
    if (sex === "male"   && !showBoys)  return;
    if (sex === "female" && !showGirls) return;
    const ref = getRefData(metric, sex === "male");
    PERCENTILE_KEYS.forEach((pKey, idx) => {
      datasets.push({
        label: `${sex === "male" ? "Boys" : "Girls"} ${PCTS[idx]}`,
        data: refWeeks.map((w) => {
          const pt = interpolate(ref, w);
          return { x: w, y: pt?.[pKey] ?? null, label: formatWeekLabel(w) };
        }),
        borderColor: PERCENTILE_COLORS[idx],
        borderWidth: pKey === "p50" ? 2 : 1,
        borderDash: sex === "female" ? [4, 3] : [],
        tension: 0.35,
        pointRadius: 0,
        fill: false,
        spanGaps: true,
      } as ChartDataset<"line">);
    });
  });

  const patientPts = patientData
    .filter((p) => {
      if (metric === "height")   return p.height   != null;
      if (metric === "weight")   return p.weight   != null;
      return p.headCirc != null;
    })
    .map((p) => {
      const y = metric === "height" ? p.height : metric === "weight" ? p.weight : p.headCirc;
      return { x: p.week, y, label: p.label ?? formatWeekLabel(p.week) };
    });

  datasets.push({
    label: "Patient",
    data: patientPts,
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
  } as ChartDataset<"line">);

  return datasets;
}

const percentileLabelsPlugin = {
  id: "percentileLabelsMini",
  afterDraw(chart: any) {
    const { ctx, scales, chartArea } = chart;
    if (!ctx || !chartArea) return;
    const xRight = chartArea.right;
    const xMax: number = scales.x.max;
    const boysItems:  { label: string; color: string; x: number; y: number }[] = [];
    const girlsItems: { label: string; color: string; x: number; y: number }[] = [];

    chart.data.datasets.forEach((dataset: any) => {
      if (!dataset.label || dataset.label === "Patient") return;
      const isBoys = dataset.label.startsWith("Boys");
      const parts = dataset.label.split(" ");
      const pctLabel = parts[parts.length - 1];
      const visiblePoints = (dataset.data as any[]).filter((p: any) => p.y != null && p.x <= xMax);
      if (!visiblePoints.length) return;
      const lastPoint = visiblePoints[visiblePoints.length - 1];
      const rawX = scales.x.getPixelForValue(lastPoint.x);
      const rawY = scales.y.getPixelForValue(lastPoint.y);
      if (!isFinite(rawX) || !isFinite(rawY)) return;
      const item = { label: pctLabel, color: dataset.borderColor, x: Math.min(rawX, xRight - 2), y: rawY };
      (isBoys ? boysItems : girlsItems).push(item);
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

function SingleMetricChart({
  genderView,
  axisColor,
  patientData,
  metric,
  height,
}: {
  genderView: GenderView;
  axisColor: string;
  patientData: PatientPoint[];
  metric: Metric;
  height: number;
}) {
  const unitLabel     = metric === "weight" ? "kg" : "cm";
  const yStep         = metric === "weight" ? 1 : 5;
  const yMinResolved  = metric === "weight" ? 2 : metric === "height" ? 35 : 25;

  const xMax = useMemo(() => {
    const weeks = patientData.map((p) => p.week).filter(Number.isFinite);
    return weeks.length ? Math.max(40 + 260, Math.ceil(Math.max(...weeks)) + 4) : 40 + 260;
  }, [patientData]);

  const datasets = useMemo(
    () => buildDatasets(patientData, metric, genderView),
    [patientData, metric, genderView]
  );

  const chartData: ChartData<"line"> = useMemo(() => ({ datasets }), [datasets]);

  const maxY = useMemo(() => {
    const vals: number[] = [];
    datasets.forEach((ds) => {
      (ds.data as any[]).forEach((pt) => {
        if (typeof pt.y === "number") vals.push(pt.y);
      });
    });
    const maxVal = vals.length ? Math.max(...vals) : yMinResolved + yStep * 4;
    return Math.max(yMinResolved + yStep * 4, ceilTo(maxVal, yStep));
  }, [datasets, yMinResolved, yStep]);

  const options: ChartOptions<"line"> = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    parsing: false,
    layout: { padding: { left: 20, right: 40 } },
    scales: {
      x: {
        type: "linear",
        min: 40,
        max: xMax,
        title: {
          display: true,
          text: "Age Milestones",
          color: "#475569",
          font: { size: 12, weight: "bold" as const },
          padding: 10,
        },
        afterBuildTicks: (axis: { ticks: { value: number }[] }) => {
          const customTicks: { value: number }[] = [];
          customTicks.push({ value: 40 });
          for (let y = 0; y < 5; y++) {
            if (y > 0) customTicks.push({ value: 40 + y * 52 });
            [2, 4, 6, 8, 10].forEach((m) => {
              customTicks.push({ value: 40 + y * 52 + m * (52 / 12) });
            });
          }
          customTicks.push({ value: 40 + 5 * 52 });
          axis.ticks = customTicks;
        },
        grid: { color: "#e2e8f0" },
        ticks: {
          color: axisColor,
          autoSkip: false,
          maxRotation: 0,
          font: (context: any) => {
            const v = Number(context.tick?.value || 0);
            const isYearOrTerm = Math.abs(v - 40) < 0.5 || Math.abs((v - 40) % 52) < 0.5;
            return {
              size: isYearOrTerm ? 12 : 9.5,
              weight: isYearOrTerm ? ("bold" as const) : ("normal" as const),
            };
          },
          callback: (value: number | string) => {
            const v = Number(value);
            const eps = 0.5;
            if (Math.abs(v - 40) < eps) return "Term";
            if (v > 40) {
              const weeksPast = v - 40;
              const years = Math.round(weeksPast / 52);
              const months = Math.round((weeksPast % 52) / (52 / 12));
              if (Math.abs(weeksPast - years * 52) < eps) return [`${years}`, "yr"];
              else if ([2, 4, 6, 8, 10].includes(months)) return `${months}`;
            }
            return "";
          },
        },
      },
      y: {
        min: yMinResolved,
        max: maxY,
        title: { display: true, text: unitLabel, color: "#475569", font: { size: 12, weight: "bold" as const } },
        ticks: { stepSize: yStep, color: axisColor, font: { size: 11 } },
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
              ? `${ctx.dataset.label}: ${value.toFixed(1)} ${unitLabel}`
              : `${ctx.dataset.label}: —`;
          },
        },
      },
    },
  }), [axisColor, xMax, yMinResolved, maxY, yStep, unitLabel]);

  return (
    <div style={{ width: "100%", height, position: "relative" }}>
      <Line data={chartData} options={options} plugins={[percentileLabelsPlugin]} />
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  filterBar: {
    display: "flex",
    gap: "6px",
    flexWrap: "nowrap" as const,
    overflowX: "auto" as const,
    overflowY: "hidden" as const,
    marginBottom: 14,
    alignItems: "center",
    width: "100%",
    padding: "2px 0",
  },
  divider: {
    width: 1,
    height: 20,
    backgroundColor: "#e2e8f0",
    flexShrink: 0,
    margin: "0 2px",
  },
  btn: {
    padding: "6px 14px",
    borderRadius: "999px",
    border: "1px solid #cbd5e1",
    backgroundColor: "#fff",
    color: "#475569",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    flexShrink: 0,
  },
  activeMale:     { backgroundColor: "#eff6ff", borderColor: "#2563eb", color: "#2563eb" },
  activeFemale:   { backgroundColor: "#fdf2f8", borderColor: "#db2777", color: "#db2777" },
  activeBoth:     { backgroundColor: "#f1f5f9", borderColor: "#0f172a", color: "#0f172a" },
  activeMetric:   { backgroundColor: "#0f172a", borderColor: "#0f172a", color: "#fff" },
  row:            { display: "flex", gap: 16, width: "100%" },
  rowCenter:      { display: "flex", justifyContent: "center", width: "100%" },
};

const GENDER_OPTIONS: { key: GenderView; label: string }[] = [
  { key: "male",   label: "♂ Boys"  },
  { key: "female", label: "♀ Girls" },
  { key: "both",   label: "Both"    },
];

const METRIC_OPTIONS = [
  { key: "all"      as MetricFilter, label: "All"        },
  { key: "height"   as MetricFilter, label: "Length"     },
  { key: "weight"   as MetricFilter, label: "Weight"     },
  { key: "headCirc" as MetricFilter, label: "Head Circ." },
] as const;

export default function WHOChartMini({ gender, patientData, height = 420 }: WHOChartMiniProps) {
  const [metricFilter, setMetricFilter] = useState<MetricFilter>("all");
  const [viewGender, setViewGender] = useState<GenderView>(
    gender === "female" ? "female" : gender === "male" ? "male" : "both"
  );

  const axisColor = viewGender === "female" ? "#db2777" : "#2563eb";

  const hasData = (metric: Metric) =>
    patientData.some((p) =>
      metric === "height" ? p.height != null : metric === "weight" ? p.weight != null : p.headCirc != null
    );

  const showHeight   = (metricFilter === "all" || metricFilter === "height")   && hasData("height");
  const showWeight   = (metricFilter === "all" || metricFilter === "weight")   && hasData("weight");
  const showHeadCirc = (metricFilter === "all" || metricFilter === "headCirc") && hasData("headCirc");

  const renderChart = (metric: Metric, widthCap?: string) => (
    <div key={metric} style={{ flex: 1, minWidth: 0, maxWidth: widthCap }}>
      <SingleMetricChart
        genderView={viewGender}
        axisColor={axisColor}
        patientData={patientData}
        metric={metric}
        height={height}
      />
    </div>
  );

  const heightChart   = showHeight   ? renderChart("height")   : null;
  const weightChart   = showWeight   ? renderChart("weight")   : null;
  const headCircChart = showHeadCirc
    ? renderChart("headCirc", metricFilter === "all" ? "50%" : undefined)
    : null;

  // Active style for gender buttons
  const genderActiveStyle = (key: GenderView) => {
    if (viewGender !== key) return {};
    if (key === "male")   return styles.activeMale;
    if (key === "female") return styles.activeFemale;
    return styles.activeBoth;
  };

  return (
    <div>
      {/* ── Single unified filter bar ── */}
      <div style={styles.filterBar}>
        {/* Gender toggles */}
        {GENDER_OPTIONS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setViewGender(key)}
            style={{ ...styles.btn, ...genderActiveStyle(key) }}
          >
            {label}
          </button>
        ))}

        {/* Thin divider between gender and metric groups */}
        <div style={styles.divider} aria-hidden="true" />

        {/* Metric toggles */}
        {METRIC_OPTIONS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setMetricFilter(key)}
            style={{
              ...styles.btn,
              ...(metricFilter === key ? styles.activeMetric : {}),
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Charts ── */}
      {metricFilter === "all" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {(heightChart || weightChart) && (
            <div style={styles.row}>
              {heightChart}
              {weightChart}
            </div>
          )}
          {headCircChart && <div style={styles.rowCenter}>{headCircChart}</div>}
        </div>
      ) : (
        <div style={{ width: "100%" }}>
          {heightChart || weightChart || headCircChart}
        </div>
      )}
    </div>
  );
}