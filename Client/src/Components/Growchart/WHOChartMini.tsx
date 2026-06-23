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
  metric: Metric;
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

// FIX (#3/#4): rounds a value up to the next multiple of `step`, used to
// compute a clean dynamic y-axis ceiling instead of leaving max undefined.
function ceilTo(v: number, step: number) {
  return Math.ceil(v / step) * step;
}

const PERCENTILE_COLORS = ["#22d3ee", "#34d399", "#3b82f6", "#f59e0b", "#f43f5e"];
const PCTS = ["3rd", "15th", "50th", "85th", "97th"] as const;
const PERCENTILE_KEYS = ["p3", "p15", "p50", "p85", "p97"] as const;
const PATIENT_COLOR = "#111827";

function getRefData(metric: Metric, isMale: boolean): RefPoint[] {
  if (metric === "height")   return isMale ? WHO_LENGTH_BOYS  : WHO_LENGTH_GIRLS;
  if (metric === "weight")   return isMale ? WHO_WEIGHT_BOYS  : WHO_WEIGHT_GIRLS;
  return isMale ? WHO_HC_BOYS : WHO_HC_GIRLS;
}

// FIX: capped at WHO_MAX_WEEK so this never asks interpolate() for a week
// past the WHO dataset's real ceiling (5 years post-term). The previous
// version pushed a final cluster at "base + 52" for y = 5, which equals
// 40 + 6*52 = 352 — a full year beyond the data's actual end at week 300.
// Those overshooting points landed in interpolate()'s extrapolation branch,
// producing a visible upward "hook" right at the chart's edge.
const WHO_MAX_WEEK = 40 + 5 * 52; // 300 — 5 years post-term, the data's real ceiling

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
  const showBoys   = genderView === "both" || genderView === "male";
  const showGirls  = genderView === "both" || genderView === "female";

  const datasets: ChartDataset<"line">[] = [];

  // ── Reference percentile series ──────────────────────────────────────────
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

  // ── Patient series — each visit is its own data point ────────────────────
  // Patient points are inserted directly at their exact CGA week value
  // instead of being slot-matched against a ±0.5w reference grid (which would
  // silently drop any point whose CGA didn't fall within 0.5w of a ref week).
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

// FIX (#5): percentile end-of-line labels are now split into separate boys/girls
// groups and vertically de-collided within each group (mirrors GrowchartDetail's
// percentileLabelsPlugin), so close-together percentile labels no longer overlap.
const percentileLabelsPlugin = {
  id: "percentileLabelsMini",
  afterDraw(chart: any) {
    const { ctx, scales, chartArea } = chart;
    if (!ctx || !chartArea) return;
    const xRight = chartArea.right;
    const xMax: number = scales.x.max;

    const boysItems: { label: string; color: string; x: number; y: number }[] = [];
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

export default function WHOChartMini({ gender, patientData, metric, height = 420 }: WHOChartMiniProps) {
  const genderView: GenderView = gender === "female" ? "female" : gender === "male" ? "male" : "both";

  const unitLabel = metric === "weight" ? "kg" : "cm";
  const yStep     = metric === "weight" ? 1 : 5;

  // FIX (#4): y-axis minimum now depends on the metric, matching the WHO-mode
  // values used in GrowchartDetail's MetricChart (chartType === "who" branch),
  // instead of a single flat yMin regardless of metric.
  const yMinResolved = metric === "weight" ? 2 : metric === "height" ? 35 : 25;

  // xMax is derived from patient data so the axis always extends far enough
  // to show every visit, mirroring the same fix applied to FentonChart.
  const xMax = useMemo(() => {
    const weeks = patientData.map((p) => p.week).filter(Number.isFinite);
    return weeks.length ? Math.max(40 + 260, Math.ceil(Math.max(...weeks)) + 4) : 40 + 260;
  }, [patientData]);

  const datasets = useMemo(
    () => buildDatasets(patientData, metric, genderView),
    [patientData, metric, genderView]
  );

  const chartData: ChartData<"line"> = useMemo(() => ({ datasets }), [datasets]);

  // FIX (#3): dynamic y-axis ceiling computed from the actual data (percentile
  // lines + patient points), rounded up to the next yStep, instead of leaving
  // max undefined and letting Chart.js auto-scale it.
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

  const options: ChartOptions<"line"> = useMemo(() => {
    const axisColor = gender === "female" ? "#db2777" : "#2563eb";
    return {
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
          // FIX (#1): custom tick positions anchored at week 40 ("Term"), then
          // each year (40 + 52*y) plus months 2/4/6/8/10 within each year —
          // instead of Chart.js's automatic linear tick spacing.
          afterBuildTicks: (axis: { ticks: { value: number }[] }) => {
            const customTicks: { value: number }[] = [];
            customTicks.push({ value: 40 });

            for (let y = 0; y < 5; y++) {
              if (y > 0) {
                customTicks.push({ value: 40 + y * 52 });
              }
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
            // FIX (#2): bold/larger font for the Term tick and year ticks,
            // lighter/smaller font for in-between month ticks.
            font: (context: any) => {
              const v = Number(context.tick?.value || 0);
              const isYearOrTerm = Math.abs(v - 40) < 0.5 || Math.abs((v - 40) % 52) < 0.5;
              return {
                size: isYearOrTerm ? 12 : 9.5,
                weight: isYearOrTerm ? ("bold" as const) : ("normal" as const),
              };
            },
            // FIX (#2): "Term" label at week 40, "N yr" at year ticks, plain
            // month number at the in-between month ticks, blank otherwise.
            callback: (value: number | string) => {
              const v = Number(value);
              const eps = 0.5;

              if (Math.abs(v - 40) < eps) return "Term";

              if (v > 40) {
                const weeksPast = v - 40;
                const years = Math.round(weeksPast / 52);
                const months = Math.round((weeksPast % 52) / (52 / 12));

                if (Math.abs(weeksPast - years * 52) < eps) {
                  return [`${years}`, "yr"];
                } else if ([2, 4, 6, 8, 10].includes(months)) {
                  return `${months}`;
                }
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
    };
  }, [gender, xMax, yMinResolved, maxY, yStep, unitLabel]);

  return (
    <div style={{ width: "100%", height, position: "relative" }}>
      <Line data={chartData} options={options} plugins={[percentileLabelsPlugin]} />
    </div>
  );
}