import * as React from "react";
import { useRef, useEffect } from "react";
import * as d3 from "d3";
import {
  FENTON_WEIGHT_BOYS,
  FENTON_WEIGHT_GIRLS,
  FENTON_LENGTH_BOYS,
  FENTON_LENGTH_GIRLS,
  FENTON_HC_BOYS,
  FENTON_HC_GIRLS,
  type RefPoint,
} from "./referenceData";

type Gender = "male" | "female" | "";

interface PatientPoint {
  week: number;
  height: number | null;
  weight: number | null;
  headCirc: number | null;
  label?: string;
}

export interface FentonD3ChartProps {
  gender: Gender;
  patientData: PatientPoint[];
  height?: number;
  alertWeeks?: { week: number; label: string; color: string }[];
}

const X_MIN = 22;
const X_MAX = 50;
const Y_MIN = 0;
const Y_MAX = 90;
const CM_RAW_MIN = 15;
const CM_RAW_MAX = 60;
const WEIGHT_RAW_MAX_BOYS = 7.5;
const WEIGHT_RAW_MAX_GIRLS = 6.5;
const LEFT_WEIGHT_LABEL_CEIL = 4.5;

/** Fenton uses 10th/90th; stored in RefPoint as p15/p85 */
const PERCENTILE_KEYS = ["p3", "p15", "p50", "p85", "p97"] as const;
const PERCENTILE_LABELS = ["3", "10", "50", "90", "97"];
const REF_WEEKS = d3.range(X_MIN, X_MAX + 1);

const REF_COLOR = "#374151";
const PATIENT_COLORS = {
  length: "#16a34a",
  headCirc: "#dc2626",
  weight: "#ca8a04",
};

function mapWeightValue(value: number) {
  return value * 10;
}
function mapCmValue(value: number) {
  return value + 30;
}

interface AxisTick {
  value: number;
  label: string;
}

function buildAxisTicks(
  cmLabelFloor: number,
  weightLabelCeil: number,
  extendCmTo: number,
  extendWeightTo: number,
  weightAxisMax: number
): AxisTick[] {
  const raw: AxisTick[] = [];
  const cmTop = Math.max(CM_RAW_MAX, Math.ceil(extendCmTo / 5) * 5);
  for (let v = cmTop; v >= CM_RAW_MIN; v -= 5) {
    raw.push({ value: mapCmValue(v), label: v >= cmLabelFloor ? `${v}` : "" });
  }
  const weightTop = Math.max(weightAxisMax, Math.ceil(extendWeightTo * 2) / 2);
  for (let v = 0; v <= weightTop + 0.001; v += 0.5) {
    raw.push({
      value: mapWeightValue(v),
      label: v <= weightLabelCeil + 0.001 ? v.toFixed(1) : "",
    });
  }
  const merged = new Map<number, string>();
  for (const t of raw) {
    const existing = merged.get(t.value);
    if (existing === undefined || existing === "") merged.set(t.value, t.label);
  }
  return Array.from(merged, ([value, label]) => ({ value, label })).sort(
    (a, b) => a.value - b.value
  );
}

function buildYTicks(maxCm: number, maxWeight: number, isMale: boolean) {
  const weightAxisMax = isMale ? WEIGHT_RAW_MAX_BOYS : WEIGHT_RAW_MAX_GIRLS;
  return {
    left: buildAxisTicks(15, LEFT_WEIGHT_LABEL_CEIL, maxCm, maxWeight, weightAxisMax),
    right: buildAxisTicks(40, weightAxisMax, maxCm, maxWeight, weightAxisMax),
  };
}

function interpolateRef(data: RefPoint[], x: number): Omit<RefPoint, "x"> | null {
  if (!data.length) return null;
  const sorted = [...data].sort((a, b) => a.x - b.x);
  if (x < sorted[0].x || x > sorted[sorted.length - 1].x) return null;
  if (x <= sorted[0].x) return sorted[0];
  if (x >= sorted[sorted.length - 1].x) return sorted[sorted.length - 1];
  const lo = sorted.filter((d) => d.x <= x).pop()!;
  const hi = sorted.find((d) => d.x > x);
  if (!hi) return lo;
  if (lo.x === hi.x) return lo;
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

function dashForPercentile(p: (typeof PERCENTILE_KEYS)[number]): string {
  if (p === "p50") return "none";
  if (p === "p15" || p === "p85") return "4,3";
  return "1,3";
}

function strokeWidthForPercentile(p: (typeof PERCENTILE_KEYS)[number]): number {
  return p === "p50" ? 2 : 1;
}

function buildCurvePoints(
  ref: RefPoint[],
  pKey: (typeof PERCENTILE_KEYS)[number],
  mapY: (v: number) => number
): { x: number; y: number }[] {
  return REF_WEEKS.map((w) => {
    const pt = interpolateRef(ref, w);
    if (!pt) return null;
    return { x: w, y: mapY(pt[pKey]) };
  }).filter((d): d is { x: number; y: number } => d !== null);
}

function angleAtPoint(points: { x: number; y: number }[], week: number, xScale: d3.ScaleLinear<number, number>, yScale: d3.ScaleLinear<number, number>): number {
  const px = xScale(week);
  let lo = points[0];
  let hi = points[points.length - 1];
  for (let i = 0; i < points.length - 1; i++) {
    if (points[i].x <= week && points[i + 1].x >= week) {
      lo = points[i];
      hi = points[i + 1];
      break;
    }
  }
  const t = hi.x === lo.x ? 0 : (week - lo.x) / (hi.x - lo.x);
  const yVal = lo.y + t * (hi.y - lo.y);
  const p1x = xScale(lo.x);
  const p1y = yScale(lo.y);
  const p2x = xScale(hi.x);
  const p2y = yScale(hi.y);
  return Math.atan2(p2y - p1y, p2x - p1x);
}

export function FentonD3Chart({
  gender,
  patientData,
  height = 920,
  alertWeeks,
}: FentonD3ChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const showReference = gender === "male" || gender === "female";
  const isMale = gender === "male";

  useEffect(() => {
    if (!svgRef.current || !wrapperRef.current) return;

    const wrapperWidth = wrapperRef.current.clientWidth || 900;
    const margin = { top: 36, right: 72, bottom: 48, left: 72 };
    const innerWidth = wrapperWidth - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const wRef = showReference ? (isMale ? FENTON_WEIGHT_BOYS : FENTON_WEIGHT_GIRLS) : [];
    const lRef = showReference ? (isMale ? FENTON_LENGTH_BOYS : FENTON_LENGTH_GIRLS) : [];
    const hcRef = showReference ? (isMale ? FENTON_HC_BOYS : FENTON_HC_GIRLS) : [];

    const allCms: number[] = [
      ...lRef.flatMap((p) => [p.p3, p.p97]),
      ...hcRef.flatMap((p) => [p.p3, p.p97]),
    ];
    const allKgs: number[] = [...wRef.flatMap((p) => [p.p3, p.p97])];
    patientData.forEach((p) => {
      if (p.height != null) allCms.push(p.height);
      if (p.headCirc != null) allCms.push(p.headCirc);
      if (p.weight != null) allKgs.push(p.weight);
    });

    const defaultWeightMax = isMale ? WEIGHT_RAW_MAX_BOYS : WEIGHT_RAW_MAX_GIRLS;
    const yTicks = buildYTicks(
      allCms.length ? Math.max(...allCms) : CM_RAW_MAX,
      allKgs.length ? Math.max(...allKgs) : defaultWeightMax,
      isMale
    );

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("width", wrapperWidth).attr("height", height);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleLinear().domain([X_MIN, X_MAX]).range([0, innerWidth]);
    const yScale = d3.scaleLinear().domain([Y_MIN, Y_MAX]).range([innerHeight, 0]);

    const lineGen = d3
      .line<{ x: number; y: number }>()
      .x((d) => xScale(d.x))
      .y((d) => yScale(d.y))
      .curve(d3.curveMonotoneX);

    // Weight / cm boundary (4.5 kg = 15 cm on left axis)
    g.append("line")
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", yScale(mapWeightValue(LEFT_WEIGHT_LABEL_CEIL)))
      .attr("y2", yScale(mapWeightValue(LEFT_WEIGHT_LABEL_CEIL)))
      .attr("stroke", "#cbd5e1")
      .attr("stroke-width", 1.5);

    // Minor horizontal grid (every 1 chart unit ≈ 0.1 kg or 1 cm)
    g.selectAll(".y-grid-minor")
      .data(d3.range(Y_MIN, Y_MAX + 1, 1))
      .enter()
      .append("line")
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", (d) => yScale(d))
      .attr("y2", (d) => yScale(d))
      .attr("stroke", "#eef1f4")
      .attr("stroke-width", 0.5);

    // Major horizontal grid at tick values
    const majorY = [...new Set([...yTicks.left.map((t) => t.value), ...yTicks.right.map((t) => t.value)])];
    g.selectAll(".y-grid-major")
      .data(majorY)
      .enter()
      .append("line")
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", (d) => yScale(d))
      .attr("y2", (d) => yScale(d))
      .attr("stroke", "#e2e8f0")
      .attr("stroke-width", 1);

    // Vertical grid — every week minor, every 2 weeks major
    g.selectAll(".x-grid-minor")
      .data(d3.range(X_MIN, X_MAX + 1, 1))
      .enter()
      .append("line")
      .attr("x1", (d) => xScale(d))
      .attr("x2", (d) => xScale(d))
      .attr("y1", 0)
      .attr("y2", innerHeight)
      .attr("stroke", "#eef1f4")
      .attr("stroke-width", 0.5);

    g.selectAll(".x-grid-major")
      .data(d3.range(X_MIN, X_MAX + 1, 2))
      .enter()
      .append("line")
      .attr("x1", (d) => xScale(d))
      .attr("x2", (d) => xScale(d))
      .attr("y1", 0)
      .attr("y2", innerHeight)
      .attr("stroke", "#cbd5e1")
      .attr("stroke-width", 1);

    // X-axis labels
    g.selectAll(".x-label")
      .data(d3.range(X_MIN, X_MAX + 1, 2))
      .enter()
      .append("text")
      .attr("x", (d) => xScale(d))
      .attr("y", innerHeight + 18)
      .attr("text-anchor", "middle")
      .attr("fill", "#475569")
      .attr("font-size", 11)
      .text((d) => d.toString());

    g.append("text")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight + 38)
      .attr("text-anchor", "middle")
      .attr("fill", "#1e293b")
      .attr("font-size", 12)
      .attr("font-weight", "bold")
      .text("Gestational age (weeks)");

    // Y-axis labels — left and right
    const drawYLabels = (ticks: AxisTick[], xPos: number, anchor: "start" | "end") => {
      g.selectAll(`.y-label-${anchor}`)
        .data(ticks.filter((t) => t.label))
        .enter()
        .append("text")
        .attr("x", xPos)
        .attr("y", (d) => yScale(d.value))
        .attr("text-anchor", anchor)
        .attr("dominant-baseline", "middle")
        .attr("fill", "#475569")
        .attr("font-size", 11)
        .text((d) => d.label);
    };
    drawYLabels(yTicks.left, -8, "end");
    drawYLabels(yTicks.right, innerWidth + 8, "start");

    // Axis titles (rotated)
    const weightLabelY = yScale(20);
    const cmLabelY = yScale(67.5);
    [
      { x: -48, y: weightLabelY, text: "Weight (kilograms)" },
      { x: -48, y: cmLabelY, text: "Centimeters" },
      { x: innerWidth + 48, y: weightLabelY, text: "Weight (kilograms)" },
      { x: innerWidth + 48, y: cmLabelY, text: "Centimeters" },
    ].forEach(({ x, y, text }) => {
      g.append("text")
        .attr("transform", `translate(${x},${y}) rotate(-90)`)
        .attr("text-anchor", "middle")
        .attr("fill", "#0f172a")
        .attr("font-size", 11)
        .attr("font-weight", "bold")
        .text(text);
    });

    // Gender watermark
    if (showReference) {
      g.append("text")
        .attr("x", innerWidth * 0.22)
        .attr("y", innerHeight * 0.48)
        .attr("text-anchor", "middle")
        .attr("fill", isMale ? "rgba(37,99,235,0.12)" : "rgba(219,39,119,0.12)")
        .attr("font-size", 72)
        .attr("font-weight", 800)
        .attr("stroke", isMale ? "rgba(30,64,175,0.25)" : "rgba(190,24,93,0.25)")
        .attr("stroke-width", 1)
        .text(isMale ? "Boys" : "Girls");
    }

    type MetricConfig = {
      prefix: string;
      ref: RefPoint[];
      mapY: (v: number) => number;
      nameAtX: number;
      percAtX: number;
      displayName: string;
    };

    const metrics: MetricConfig[] = [
      {
        prefix: "Length",
        ref: lRef,
        mapY: mapCmValue,
        nameAtX: 30,
        percAtX: 48,
        displayName: "Length",
      },
      {
        prefix: "Head Circumference",
        ref: hcRef,
        mapY: mapCmValue,
        nameAtX: 45,
        percAtX: 49,
        displayName: "Head Circ.",
      },
      {
        prefix: "Weight",
        ref: wRef,
        mapY: mapWeightValue,
        nameAtX: 26,
        percAtX: 48,
        displayName: "Weight",
      },
    ];

    metrics.forEach(({ ref, mapY, nameAtX, percAtX, displayName }) => {
      if (!ref.length) return;

      PERCENTILE_KEYS.forEach((pKey, idx) => {
        const pts = buildCurvePoints(ref, pKey, mapY);
        g.append("path")
          .datum(pts)
          .attr("d", lineGen)
          .attr("fill", "none")
          .attr("stroke", REF_COLOR)
          .attr("stroke-width", strokeWidthForPercentile(pKey))
          .attr("stroke-dasharray", dashForPercentile(pKey));

        if (pKey === "p50") {
          const angle = angleAtPoint(pts, nameAtX, xScale, yScale);
          const namePt = pts.find((p) => p.x >= nameAtX) ?? pts[Math.floor(pts.length / 2)];
          const nx = xScale(namePt.x);
          const ny = yScale(namePt.y);
          g.append("text")
            .attr("transform", `translate(${nx},${ny - 14}) rotate(${(angle * 180) / Math.PI})`)
            .attr("text-anchor", "middle")
            .attr("fill", "#1e293b")
            .attr("font-size", 12)
            .attr("font-weight", "bold")
            .text(displayName);
        }

        const percPt = pts.find((p) => p.x >= percAtX) ?? pts[pts.length - 1];
        if (percPt) {
          g.append("text")
            .attr("x", xScale(percAtX) + 4)
            .attr("y", yScale(percPt.y))
            .attr("dominant-baseline", "middle")
            .attr("fill", REF_COLOR)
            .attr("font-size", pKey === "p50" ? 11 : 10)
            .attr("font-weight", pKey === "p50" ? "bold" : "normal")
            .text(PERCENTILE_LABELS[idx]);
        }
      });
    });

    // Patient points
    const drawPatientPoints = (
      pts: { week: number; value: number; label?: string }[],
      color: string,
      unit: string,
      metricName: string
    ) => {
      g.selectAll(`.patient-${metricName}`)
        .data(pts)
        .enter()
        .append("circle")
        .attr("cx", (d) => xScale(d.week))
        .attr("cy", (d) => yScale(unit === "kg" ? mapWeightValue(d.value) : mapCmValue(d.value)))
        .attr("r", 7)
        .attr("fill", color)
        .attr("stroke", "#fff")
        .attr("stroke-width", 2.5);

      pts.forEach((d, idx) => {
        const cx = xScale(d.week);
        const cy = yScale(unit === "kg" ? mapWeightValue(d.value) : mapCmValue(d.value));
        g.append("text")
          .attr("x", cx)
          .attr("y", cy - 14)
          .attr("text-anchor", "middle")
          .attr("fill", color)
          .attr("font-size", 10)
          .attr("font-weight", "bold")
          .text(`${d.value.toFixed(1)} ${unit}`);
        if (idx === 0) {
          g.append("text")
            .attr("x", cx)
            .attr("y", cy - 28)
            .attr("text-anchor", "middle")
            .attr("fill", color)
            .attr("font-size", 10)
            .attr("font-weight", "bold")
            .text(metricName);
        }
      });
    };

    drawPatientPoints(
      patientData
        .filter((p): p is PatientPoint & { height: number } => p.height != null)
        .map((p) => ({ week: p.week, value: p.height, label: p.label })),
      PATIENT_COLORS.length,
      "cm",
      "length"
    );
    drawPatientPoints(
      patientData
        .filter((p): p is PatientPoint & { headCirc: number } => p.headCirc != null)
        .map((p) => ({ week: p.week, value: p.headCirc, label: p.label })),
      PATIENT_COLORS.headCirc,
      "cm",
      "head"
    );
    drawPatientPoints(
      patientData
        .filter((p): p is PatientPoint & { weight: number } => p.weight != null)
        .map((p) => ({ week: p.week, value: p.weight, label: p.label })),
      PATIENT_COLORS.weight,
      "kg",
      "weight"
    );

    // Alert arrows
    (alertWeeks ?? []).forEach(({ week, label, color }) => {
      if (week < X_MIN || week > X_MAX) return;
      const px = xScale(week);
      const tipY = 0;
      const headSize = 6;
      g.append("line")
        .attr("x1", px)
        .attr("x2", px)
        .attr("y1", -28)
        .attr("y2", tipY + headSize)
        .attr("stroke", color)
        .attr("stroke-width", 2);
      g.append("polygon")
        .attr("points", `${px},${tipY} ${px - headSize},${tipY + headSize} ${px + headSize},${tipY + headSize}`)
        .attr("fill", color);
      g.append("text")
        .attr("x", px)
        .attr("y", -32)
        .attr("text-anchor", "middle")
        .attr("fill", color)
        .attr("font-size", 9)
        .attr("font-weight", "bold")
        .text(label);
    });

    // Plot border
    g.append("rect")
      .attr("width", innerWidth)
      .attr("height", innerHeight)
      .attr("fill", "none")
      .attr("stroke", "#475569")
      .attr("stroke-width", 1);
  }, [gender, patientData, height, alertWeeks, showReference, isMale]);

  return (
    <div ref={wrapperRef} style={{ width: "100%", height }}>
      <svg ref={svgRef} style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  );
}