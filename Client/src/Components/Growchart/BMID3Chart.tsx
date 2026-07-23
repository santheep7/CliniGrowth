import * as React from "react";
import { useRef, useEffect } from "react";
import * as d3 from "d3";
import {
  WHO_BMI_BOYS,
  WHO_BMI_GIRLS,
  type RefPoint,
} from "./referenceData";

type GenderView = "male" | "female" | "both";

interface PatientPoint {
  week: number;
  bmi: number | null;
}

export interface BMID3ChartProps {
  patientData: PatientPoint[];
  genderView: GenderView;
  height?: number;
}

const PERCENTILE_KEYS = ["p3", "p15", "p50", "p85", "p97"] as const;
const PERCENTILE_COLORS = ["#e11d48", "#f59e0b", "#15803d", "#f59e0b", "#e11d48"];
const PERCENTILE_LABELS = ["3rd", "15th", "50th", "85th", "97th"];

const WHO_MIN_WEEK = 40;
const WHO_MAX_WEEK = 40 + 5 * 52;
/** Length-based table ends here; height-based table starts at 144.0 — no interpolation across. */
const BMI_CUT_BEFORE = 143.5;
const BMI_CUT_AFTER = 144.0;

function interpolateBmiRef(ref: RefPoint[], x: number): Omit<RefPoint, "x"> | null {
  if (!ref.length) return null;
  const sorted = [...ref].sort((a, b) => a.x - b.x);
  if (x <= sorted[0].x) return sorted[0];
  if (x >= sorted[sorted.length - 1].x) return sorted[sorted.length - 1];

  const lo = sorted.filter((d) => d.x <= x).pop()!;
  const hi = sorted.find((d) => d.x > x)!;

  if (lo.x <= BMI_CUT_BEFORE && hi.x >= BMI_CUT_AFTER) {
    return x <= BMI_CUT_BEFORE ? lo : hi;
  }

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

function buildBmiSampleWeeks(): number[] {
  const weeks: number[] = [];
  for (let w = 40; w <= 53; w++) weeks.push(w);
  for (let m = 2; m <= 23; m++) {
    const w = 40 + m * (52 / 12);
    if (w <= BMI_CUT_BEFORE) weeks.push(parseFloat(w.toFixed(2)));
  }
  weeks.push(BMI_CUT_BEFORE);
  for (let m = 24; m <= 60; m++) {
    weeks.push(parseFloat((40 + m * (52 / 12)).toFixed(2)));
  }
  return [...new Set(weeks)].sort((a, b) => a - b);
}

function buildPercentileSegments(
  ref: RefPoint[],
  pKey: (typeof PERCENTILE_KEYS)[number]
): { x: number; y: number }[][] {
  const sampleWeeks = buildBmiSampleWeeks();
  const before = sampleWeeks
    .filter((w) => w <= BMI_CUT_BEFORE)
    .map((w) => {
      const pt = interpolateBmiRef(ref, w);
      return pt ? { x: w, y: pt[pKey] } : null;
    })
    .filter((d): d is { x: number; y: number } => d !== null);

  const after = sampleWeeks
    .filter((w) => w >= BMI_CUT_AFTER)
    .map((w) => {
      const pt = interpolateBmiRef(ref, w);
      return pt ? { x: w, y: pt[pKey] } : null;
    })
    .filter((d): d is { x: number; y: number } => d !== null);

  return [before, after].filter((seg) => seg.length > 0);
}

function isYearTick(week: number): boolean {
  if (Math.abs(week - WHO_MIN_WEEK) < 0.5) return true;
  const past = week - WHO_MIN_WEEK;
  return Math.abs(past % 52) < 0.5 && past > 0;
}

export function BMID3Chart({ patientData, genderView, height = 500 }: BMID3ChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !wrapperRef.current) return;

    const wrapperWidth = wrapperRef.current.clientWidth || 800;
    const wrapperHeight = height;
    const margin = { top: 16, right: 52, bottom: 72, left: 52 };
    const innerWidth = wrapperWidth - margin.left - margin.right;
    const innerHeight = wrapperHeight - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("width", wrapperWidth).attr("height", wrapperHeight);

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleLinear().domain([WHO_MIN_WEEK, WHO_MAX_WEEK]).range([0, innerWidth]);
    const yScale = d3.scaleLinear().domain([10, 21]).range([innerHeight, 0]);

    const lineGenerator = d3
      .line<{ x: number; y: number }>()
      .x((d) => xScale(d.x))
      .y((d) => yScale(d.y))
      .curve(d3.curveLinear);

    // Y-axis minor grid (every 0.2)
    g.selectAll(".y-grid-minor")
      .data(d3.range(10, 21.01, 0.2))
      .enter()
      .append("line")
      .attr("class", "y-grid-minor")
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", (d) => yScale(d))
      .attr("y2", (d) => yScale(d))
      .attr("stroke", "#e8ebef")
      .attr("stroke-width", 0.5);

    // Y-axis major grid (every 1)
    g.selectAll(".y-grid-major")
      .data(d3.range(10, 22, 1))
      .enter()
      .append("line")
      .attr("class", "y-grid-major")
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", (d) => yScale(d))
      .attr("y2", (d) => yScale(d))
      .attr("stroke", "#d1d5db")
      .attr("stroke-width", 1);

    // X-axis grid — every month
    const xGridValues: number[] = [WHO_MIN_WEEK];
    for (let y = 0; y < 5; y++) {
      if (y > 0) xGridValues.push(WHO_MIN_WEEK + y * 52);
      for (let m = 1; m <= 12; m++) {
        xGridValues.push(WHO_MIN_WEEK + y * 52 + m * (52 / 12));
      }
    }
    xGridValues.push(WHO_MAX_WEEK);

    g.selectAll(".x-grid")
      .data(xGridValues)
      .enter()
      .append("line")
      .attr("class", "x-grid")
      .attr("x1", (d) => xScale(d))
      .attr("x2", (d) => xScale(d))
      .attr("y1", 0)
      .attr("y2", innerHeight)
      .attr("stroke", (d) => (isYearTick(d) ? "#94a3b8" : "#e8ebef"))
      .attr("stroke-width", (d) => (isYearTick(d) ? 1.5 : 0.75));

    // Bold 2-year alignment divider
    g.append("line")
      .attr("x1", xScale(BMI_CUT_AFTER))
      .attr("x2", xScale(BMI_CUT_AFTER))
      .attr("y1", 0)
      .attr("y2", innerHeight)
      .attr("stroke", "#64748b")
      .attr("stroke-width", 2);

    // X-axis month ticks (2, 4, 6, 8, 10 between year marks)
    const monthTicks: { value: number; label: string }[] = [];
    for (let y = 0; y < 5; y++) {
      [2, 4, 6, 8, 10].forEach((m) => {
        const w = WHO_MIN_WEEK + y * 52 + m * (52 / 12);
        if (w < WHO_MAX_WEEK) monthTicks.push({ value: w, label: `${m}` });
      });
    }

    g.selectAll(".x-month-label")
      .data(monthTicks)
      .enter()
      .append("text")
      .attr("class", "x-month-label")
      .attr("x", (d) => xScale(d.value))
      .attr("y", innerHeight + 16)
      .attr("text-anchor", "middle")
      .attr("fill", "#475569")
      .attr("font-size", 9.5)
      .text((d) => d.label);

    // X-axis year / birth labels
    const yearTicks: { value: number; label: string }[] = [{ value: WHO_MIN_WEEK, label: "Birth" }];
    for (let y = 1; y <= 5; y++) {
      yearTicks.push({
        value: WHO_MIN_WEEK + y * 52,
        label: y === 1 ? "1 year" : `${y} years`,
      });
    }

    g.selectAll(".x-year-label")
      .data(yearTicks)
      .enter()
      .append("text")
      .attr("class", "x-year-label")
      .attr("x", (d) => xScale(d.value))
      .attr("y", innerHeight + 32)
      .attr("text-anchor", "middle")
      .attr("fill", "#1e293b")
      .attr("font-size", 11)
      .attr("font-weight", "bold")
      .text((d) => d.label);

    // Y-axis labels — left and right
    const yTicks = d3.range(10, 22, 1);
    [innerWidth + 10, -10].forEach((xPos, idx) => {
      g.selectAll(`.y-label-${idx}`)
        .data(yTicks)
        .enter()
        .append("text")
        .attr("class", `y-label-${idx}`)
        .attr("x", xPos)
        .attr("y", (d) => yScale(d))
        .attr("text-anchor", idx === 0 ? "start" : "end")
        .attr("dominant-baseline", "middle")
        .attr("fill", "#475569")
        .attr("font-size", 11)
        .text((d) => d.toString());
    });

    // Axis titles
    g.append("text")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight + 58)
      .attr("text-anchor", "middle")
      .attr("fill", "#1e293b")
      .attr("font-size", 12)
      .attr("font-weight", "bold")
      .text("Age (completed months and years)");

    g.append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -innerHeight / 2)
      .attr("y", -38)
      .attr("text-anchor", "middle")
      .attr("fill", "#1e293b")
      .attr("font-size", 12)
      .attr("font-weight", "bold")
      .text("BMI (kg/m\u00B2)");

    g.append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -innerHeight / 2)
      .attr("y", innerWidth + 38)
      .attr("text-anchor", "middle")
      .attr("fill", "#1e293b")
      .attr("font-size", 12)
      .attr("font-weight", "bold")
      .text("BMI (kg/m\u00B2)");

    // Percentile curves
    const labelItems: { label: string; color: string; x: number; y: number }[] = [];

    (["male", "female"] as const).forEach((sex) => {
      if (sex === "male" && genderView === "female") return;
      if (sex === "female" && genderView === "male") return;

      const ref = sex === "male" ? WHO_BMI_BOYS : WHO_BMI_GIRLS;
      const isDashed = genderView === "both" && sex === "female";

      PERCENTILE_KEYS.forEach((pKey, colorIndex) => {
        const segments = buildPercentileSegments(ref, pKey);
        segments.forEach((segment) => {
          g.append("path")
            .datum(segment)
            .attr("d", lineGenerator)
            .attr("fill", "none")
            .attr("stroke", PERCENTILE_COLORS[colorIndex])
            .attr("stroke-width", pKey === "p50" ? 2 : 1.25)
            .attr("stroke-dasharray", isDashed ? "4,3" : "none");
        });

        const lastSeg = segments[segments.length - 1];
        if (lastSeg?.length) {
          const last = lastSeg[lastSeg.length - 1];
          labelItems.push({
            label: PERCENTILE_LABELS[colorIndex],
            color: PERCENTILE_COLORS[colorIndex],
            x: xScale(last.x),
            y: yScale(last.y),
          });
        }
      });
    });

    // Right-side percentile labels with collision avoidance
    labelItems.sort((a, b) => a.y - b.y);
    const minGap = 13;
    for (let i = 1; i < labelItems.length; i++) {
      if (labelItems[i].y - labelItems[i - 1].y < minGap) {
        labelItems[i].y = labelItems[i - 1].y + minGap;
      }
    }
    for (let i = labelItems.length - 2; i >= 0; i--) {
      if (labelItems[i + 1].y - labelItems[i].y < minGap) {
        labelItems[i].y = labelItems[i + 1].y - minGap;
      }
    }

    g.selectAll(".pct-label")
      .data(labelItems)
      .enter()
      .append("text")
      .attr("class", "pct-label")
      .attr("x", (d) => d.x + 5)
      .attr("y", (d) => d.y)
      .attr("dominant-baseline", "middle")
      .attr("fill", (d) => d.color)
      .attr("font-size", 10)
      .attr("font-weight", "bold")
      .text((d) => d.label);

    // Patient data points
    const patientPoints = patientData.filter(
      (p) => p.bmi != null && p.week >= WHO_MIN_WEEK && p.week <= WHO_MAX_WEEK
    );
    g.selectAll(".patient-point")
      .data(patientPoints)
      .enter()
      .append("circle")
      .attr("class", "patient-point")
      .attr("cx", (d) => xScale(d.week))
      .attr("cy", (d) => yScale(d.bmi!))
      .attr("r", 4.5)
      .attr("fill", "#111827")
      .attr("stroke", "#fff")
      .attr("stroke-width", 2);
  }, [patientData, genderView, height]);

  return (
    <div ref={wrapperRef} style={{ width: "100%", height }}>
      <svg ref={svgRef} style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  );
}
