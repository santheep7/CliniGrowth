import { useMemo, useRef, useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface TDSCItem {
  id: number;
  label: string;
  startMonth: number;
  endMonth: number;
}

interface TDSCChartProps {
  patientName?: string;
  items?: TDSCItem[];
}

// ─── Chart constants ────────────────────────────────────────────────────────
const AGE_MIN = 36;
const AGE_MAX = 72;
const MONTH_WIDTH = 26; // px per month
const ROW_HEIGHT = 30;
const BAR_HEIGHT = 15;
const CHART_LEFT_PAD = 28; // margin before month 36 — needs room since 7 bars now start here
const LABEL_GAP = 6; // gap between bar edge and label text
// Rows near the right edge of the chart don't have room to print the label
// after the bar, so the label is printed BEFORE the bar instead — this is
// what produces the diagonal "staircase" look in the original chart.
const RIGHT_EDGE_CUTOFF = 58; // endMonth beyond which label goes before the bar
const SLIDER_HEIGHT = 28;
const HTML2CANVAS_SRC = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";

// ⚠️ PLACEHOLDER DATA — these item labels were transcribed from a photo of the
// printed TDSC chart. Labels were legible and are believed accurate; the exact
// month-range boundaries for each bar could NOT be reliably measured from the
// photo (camera angle/perspective distorted the grid) and are NOT verified.
const TDSC_ITEMS: TDSCItem[] = [
  { id: 1,  label: "Broad jump (Both legs)",                          startMonth: 36, endMonth: 37 },
  { id: 2,  label: "Copy circle",                                     startMonth: 36, endMonth: 39 },
  { id: 3,  label: "Balance one foot one second",                     startMonth: 36, endMonth: 40 },
  { id: 4,  label: "Answers 2 questions (e.g., Hungry, cold)",        startMonth: 36, endMonth: 43 },
  { id: 5,  label: "Names one color",                                 startMonth: 36, endMonth: 45 },
  { id: 6,  label: "Tells use of 2 objects (e.g., pencil, chair)",    startMonth: 36, endMonth: 45 },
  { id: 7,  label: "Concept of one (Pick '1' from a group)",          startMonth: 36, endMonth: 46 },
  { id: 8,  label: "Plays near and talk with peers",                  startMonth: 45, endMonth: 50 },
  { id: 9,  label: "Hops continuously 3 steps",                       startMonth: 45, endMonth: 52 },
  { id: 10, label: "Draw person with 3 parts",                        startMonth: 47, endMonth: 55 },
  { id: 11, label: "Writes 3 alphabets (e.g.: A, E, D)",              startMonth: 48, endMonth: 56 },
  { id: 12, label: "Tells function of 3 body parts",                  startMonth: 49, endMonth: 57 },
  { id: 13, label: "Paints/shades blank circle",                      startMonth: 50, endMonth: 59 },
  { id: 14, label: "Define/explain 10 words",                         startMonth: 51, endMonth: 59 },
  { id: 15, label: "Heel to toe walk 4 consecutive steps",            startMonth: 48, endMonth: 60 },
  { id: 16, label: "Answers why questions",                           startMonth: 51, endMonth: 60 },
  { id: 17, label: "Folds paper diagonally twice",                    startMonth: 51, endMonth: 63 },
  { id: 18, label: "Copy 3 shapes",                                   startMonth: 53, endMonth: 64 },
  { id: 19, label: "Points to middle",                                startMonth: 52, endMonth: 65 },
  { id: 20, label: "Picks 5 objects from the group",                  startMonth: 55, endMonth: 66 },
  { id: 21, label: "Button/unbutton",                                 startMonth: 56, endMonth: 68 },
  { id: 22, label: "Names days of a week in order",                   startMonth: 57, endMonth: 70 },
  { id: 23, label: "Uses 5–6 word sentences",                         startMonth: 60, endMonth: 72 },
  { id: 24, label: "Writes own name",                                 startMonth: 61, endMonth: 72 },
];

// ─── Component ──────────────────────────────────────────────────────────────
export default function TDSCChart({ patientName, items = TDSC_ITEMS }: TDSCChartProps) {
  const months = useMemo(
    () => Array.from({ length: AGE_MAX - AGE_MIN + 1 }, (_, i) => AGE_MIN + i),
    []
  );

  // The printed chart lists item 24 at the TOP and item 1 at the BOTTOM
  // (bars cascade upward as the milestones get later/more complex).
  const orderedItems = useMemo(
    () => [...items].sort((a, b) => b.id - a.id),
    [items]
  );

  const monthToX = (m: number) => CHART_LEFT_PAD + (m - AGE_MIN) * MONTH_WIDTH;
  const trackWidth = CHART_LEFT_PAD + (AGE_MAX - AGE_MIN) * MONTH_WIDTH +0; // +room for overflow labels
  const chartHeight = orderedItems.length * ROW_HEIGHT;

  // ─── Age-marker slider state ───────────────────────────────────────────
  const [markerMonth, setMarkerMonth] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const sliderTrackRef = useRef<HTMLDivElement>(null);

  const monthFromClientX = useCallback((clientX: number) => {
    const el = sliderTrackRef.current;
    if (!el) return AGE_MIN;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    const raw = AGE_MIN + (x - CHART_LEFT_PAD) / MONTH_WIDTH;
    return Math.min(AGE_MAX, Math.max(AGE_MIN, Math.round(raw)));
  }, []);

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    setMarkerMonth(monthFromClientX(e.clientX));
  };

  const handleHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setIsDragging(true);
  };

  const handleHandlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setMarkerMonth(monthFromClientX(e.clientX));
  };

  const handleHandlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
      // no-op — pointer may already have been released
    }
  };

  // ─── PNG export ─────────────────────────────────────────────────────────
  const exportRef = useRef<HTMLDivElement>(null);
  const scrollWrapperRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const ensureHtml2Canvas = useCallback((): Promise<any> => {
    const w = window as any;
    if (w.html2canvas) return Promise.resolve(w.html2canvas);
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${HTML2CANVAS_SRC}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve(w.html2canvas));
        existing.addEventListener("error", () => reject(new Error("Failed to load html2canvas")));
        return;
      }
      const script = document.createElement("script");
      script.src = HTML2CANVAS_SRC;
      script.onload = () => resolve(w.html2canvas);
      script.onerror = () => reject(new Error("Failed to load html2canvas"));
      document.body.appendChild(script);
    });
  }, []);

  const handleDownload = async () => {
    if (!exportRef.current || !scrollWrapperRef.current) return;
    setIsExporting(true);
    const sw = scrollWrapperRef.current;
    const prevWidth = sw.style.width;
    const prevOverflowX = sw.style.overflowX;
    try {
      const html2canvas = await ensureHtml2Canvas();
      // Temporarily widen the scroll area so the full chart (not just the
      // currently visible/scrolled portion) is captured.
      sw.style.width = `${trackWidth}px`;
      sw.style.overflowX = "visible";
      const canvas = await html2canvas(exportRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
      });
      sw.style.width = prevWidth;
      sw.style.overflowX = prevOverflowX;

      const namePart = patientName ? `-${patientName.trim().replace(/\s+/g, "_")}` : "";
      const link = document.createElement("a");
      link.download = `TDSC-chart${namePart}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      sw.style.width = prevWidth;
      sw.style.overflowX = prevOverflowX;
      console.error("Failed to export TDSC chart as image:", err);
      alert("Sorry, the chart image couldn't be generated. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div style={s.container} ref={exportRef}>
      <div style={s.titleBar}>
        <h2 style={s.title}>Trivandrum Developmental Screening Chart (TDSC) 3–6 Years</h2>
      </div>
      {patientName && <p style={s.subtitle}>Patient: {patientName}</p>}

      {/* Controls: age-marker readout + PNG download */}
      <div style={s.controlsRow}>
        <div style={s.markerReadout}>
          {markerMonth !== null ? (
            <>
              <span>Age line: <strong>{markerMonth} months</strong></span>
              <button type="button" style={s.clearBtn} onClick={() => setMarkerMonth(null)}>
                Clear
              </button>
            </>
          ) : (
            <span style={{ color: "#6b7280" }}>Click or drag the slider above the chart to mark an age</span>
          )}
        </div>
        <button type="button" style={s.downloadBtn} onClick={handleDownload} disabled={isExporting}>
          {isExporting ? "Preparing…" : "Download PNG"}
        </button>
      </div>

      {/* Legend, mirrors the symbols printed mid-chart on the original */}
      <div style={s.legend}>
        <span style={s.legendItem}><span style={{ ...s.legendGlyph, clipPath: "polygon(50% 0, 0 100%, 100% 100%)", backgroundColor: "#111827" }} /> Age item introduced</span>
        <span style={s.legendItem}><span style={{ ...s.legendGlyph, backgroundColor: "#111827" }} /> 50% pass age</span>
        <span style={s.legendItem}><span style={{ ...s.legendGlyph, borderRadius: "50%", backgroundColor: "#111827" }} /> 90% pass age</span>
      </div>

      <div style={s.scrollWrapper} ref={scrollWrapperRef}>
        {/* Top slider/axis strip — click or drag to place a vertical age-marker line */}
        <div
          ref={sliderTrackRef}
          onClick={handleTrackClick}
          style={{ position: "relative", width: trackWidth, height: SLIDER_HEIGHT, cursor: "pointer", backgroundColor: "#eef2f7", borderBottom: "2px solid #111827" }}
        >
          {months.map((m) => (
            <div
              key={m}
              style={{
                position: "absolute",
                left: monthToX(m),
                top: 0,
                bottom: 0,
                borderLeft: m % 5 === 0 ? "1px solid #9ca3af" : "1px solid #e2e5e9",
                pointerEvents: "none",
              }}
            />
          ))}
          {months
            .filter((m) => m % 5 === 0)
            .map((m) => (
              <div
                key={`slider-label-${m}`}
                style={{
                  position: "absolute",
                  left: monthToX(m),
                  top: 2,
                  transform: "translateX(-50%)",
                  fontSize: 8.5,
                  color: "#6b7280",
                  pointerEvents: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {m}
              </div>
            ))}
          {markerMonth !== null && (
            <div
              onPointerDown={handleHandlePointerDown}
              onPointerMove={handleHandlePointerMove}
              onPointerUp={handleHandlePointerUp}
              onPointerCancel={handleHandlePointerUp}
              title={`${markerMonth} months — drag to adjust`}
              style={{
                position: "absolute",
                left: monthToX(markerMonth) - 8,
                top: 4,
                width: 16,
                height: 16,
                borderRadius: "50%",
                backgroundColor: "#dc2626",
                border: "2px solid #ffffff",
                boxShadow: "0 0 0 1px #dc2626",
                cursor: isDragging ? "grabbing" : "grab",
                zIndex: 10,
              }}
            />
          )}
        </div>

        <div style={{ position: "relative", width: trackWidth, height: chartHeight }}>
          {/* Alternating row background stripes (zebra rows) for readability */}
          {orderedItems.map((item, idx) =>
            idx % 2 === 1 ? (
              <div
                key={`stripe-${item.id}`}
                style={{
                  position: "absolute",
                  top: idx * ROW_HEIGHT,
                  left: 0,
                  right: 0,
                  height: ROW_HEIGHT,
                  backgroundColor: "#eef0f2",
                  zIndex: 0,
                }}
              />
            ) : null
          )}

          {/* Vertical month gridlines spanning the full chart height */}
          {months.map((m) => (
            <div
              key={m}
              style={{
                position: "absolute",
                left: monthToX(m),
                top: 0,
                bottom: 0,
                borderLeft: m % 5 === 0 ? "1px solid #9ca3af" : "1px solid #e5e7eb",
              }}
            />
          ))}

          {/* Rows */}
          {orderedItems.map((item, idx) => {
            // Items starting at the initial age (36 mo) begin right at the
            // chart's left-most border line, rather than at the month-36
            // gridline offset — matching how the printed chart draws it.
            const barLeft = item.startMonth === AGE_MIN ? 0 : monthToX(item.startMonth);
            const barWidth = Math.max(2, monthToX(item.endMonth) - barLeft);
            const labelAfterBar = item.endMonth < RIGHT_EDGE_CUTOFF;
            const midMonth = item.startMonth + (item.endMonth - item.startMonth) * 0.45;

            return (
              <div
                key={item.id}
                style={{
                  position: "absolute",
                  top: idx * ROW_HEIGHT,
                  left: 0,
                  right: 0,
                  height: ROW_HEIGHT,
                  borderBottom: "1px solid #f1f1f1",
                }}
              >
                {/* Bar color alternates per row: even rows gray, odd rows black */}
                <div
                  style={{
                    position: "absolute",
                    left: barLeft,
                    top: (ROW_HEIGHT - BAR_HEIGHT) / 2,
                    width: barWidth,
                    height: BAR_HEIGHT,
                    backgroundColor: idx % 2 === 0 ? "#9ca3af" : "#000000",
                    border: "1px solid #111827",
                    zIndex: 1,
                  }}
                />

                {/* Item number + label, floats beside the bar */}
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    height: ROW_HEIGHT,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    whiteSpace: "nowrap",
                    fontSize: 10.5,
                    color: "#1f2937",
                    zIndex: 2,
                    ...(labelAfterBar
                      ? { left: barLeft + barWidth + LABEL_GAP }
                      : { right: trackWidth - barLeft + LABEL_GAP }),
                  }}
                >
                  <span style={{ fontWeight: 700 }}>{item.id}</span>
                  <span>{item.label}</span>
                </div>
              </div>
            );
          })}

          {/* Age-marker vertical cut line, driven by the slider above */}
          {markerMonth !== null && (
            <div
              style={{
                position: "absolute",
                left: monthToX(markerMonth),
                top: 0,
                bottom: 0,
                width: 2,
                backgroundColor: "#dc2626",
                boxShadow: "0 0 0 1px rgba(220,38,38,0.25)",
                zIndex: 6,
                pointerEvents: "none",
              }}
            />
          )}
        </div>

        {/* Month axis */}
        <div style={{ position: "relative", borderTop: "2px solid #111827", width: trackWidth, height: 20 }}>
          {months.map((m) => (
            <div
              key={m}
              style={{
                position: "absolute",
                left: monthToX(m),
                top: 0,
                transform: "translateX(-50%)",
                textAlign: "center",
                fontSize: 9,
                fontWeight: 600,
                color: "#1f2937",
                paddingTop: 4,
                whiteSpace: "nowrap",
              }}
            >
              {m}
            </div>
          ))}
          {markerMonth !== null && (
            <div
              style={{
                position: "absolute",
                left: monthToX(markerMonth),
                top: 0,
                bottom: 0,
                width: 2,
                backgroundColor: "#dc2626",
                zIndex: 6,
                pointerEvents: "none",
              }}
            />
          )}
        </div>
        <p style={s.axisLabel}>AGE IN MONTHS</p>
      </div>

      <p style={s.warning}>
        ⚠️ Item labels were transcribed from a photo and are believed accurate. Bar month-ranges
        are best-effort estimates — the photo's camera angle made pixel-exact measurement
        unreliable, so please verify boundaries against the official TDSC manual before clinical use.
      </p>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  container: {
    padding: "24px",
    backgroundColor: "#fff",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  titleBar: {
    backgroundColor: "#9ca3af",
    padding: "10px 16px",
    borderRadius: "4px 4px 0 0",
  },
  title: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: "#0f172a",
    textAlign: "center",
  },
  subtitle: {
    margin: "8px 0",
    fontSize: 13,
    color: "#64748b",
  },
  controlsRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    margin: "8px 0",
  },
  markerReadout: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12.5,
    color: "#1f2937",
  },
  clearBtn: {
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 4,
    border: "1px solid #d1d5db",
    backgroundColor: "#fff",
    color: "#374151",
    cursor: "pointer",
  },
  downloadBtn: {
    fontSize: 12.5,
    fontWeight: 600,
    padding: "6px 14px",
    borderRadius: 6,
    border: "1px solid #111827",
    backgroundColor: "#111827",
    color: "#fff",
    cursor: "pointer",
  },
  legend: {
    display: "flex",
    gap: 16,
    flexWrap: "wrap",
    fontSize: 10.5,
    color: "#374151",
    padding: "6px 4px",
    borderBottom: "1px solid #e5e7eb",
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  legendGlyph: {
    display: "inline-block",
    width: 9,
    height: 9,
  },
  scrollWrapper: {
    overflowX: "auto",
    border: "1px solid #d1d5db",
    borderTop: "none",
    backgroundColor: "#fafafa",
  },
  axisLabel: {
    textAlign: "center",
    fontSize: 10,
    fontWeight: 700,
    color: "#1f2937",
    margin: "4px 0",
  },
  warning: {
    marginTop: 16,
    fontSize: 12,
    color: "#92400e",
    backgroundColor: "#fef3c7",
    border: "1px solid #fcd34d",
    borderRadius: 6,
    padding: "8px 12px",
  },
};