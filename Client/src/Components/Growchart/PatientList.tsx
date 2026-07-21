import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useGrowchart, type PatientData, type Visit, type HomeFormState } from "./GrowchartContext";

interface DBPatient {
  id: number;
  patient_name: string;
  gender: "male" | "female";
  dob: string;
  ga_at_birth: string;
  term_week?: number;
  created_at?: string;
  visits?: Array<{
    id: string | number;
    date?: string;
    visit_date?: string;
    height?: string | number;
    weight?: string | number;
    headCirc?: string | number;
    head_circ?: string | number;
  }>;
}

export default function PatientList() {
  const navigate = useNavigate();
  const { setPatient, setHomeForm, patient: activePatient } = useGrowchart();
  const [patients, setPatients] = useState<DBPatient[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");

  const fetchPatients = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("http://localhost:3001/api/patients");
      if (!response.ok) {
        throw new Error("Failed to fetch patients");
      }
      const data = await response.json();
      setPatients(data);
    } catch (err: any) {
      console.error("Error fetching patients:", err);
      setError("Unable to connect to database server. Please ensure backend is running.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, []);

  const mapToPatientData = (dbP: DBPatient): PatientData => {
    const rawVisits = dbP.visits || [];
    const formattedVisits: Visit[] = rawVisits.map((v, idx) => ({
      id: String(v.id || idx),
      date: v.date || (v.visit_date ? v.visit_date.split("T")[0] : ""),
      height: v.height ? String(v.height) : "",
      weight: v.weight ? String(v.weight) : "",
      headCirc: v.headCirc ? String(v.headCirc) : (v.head_circ ? String(v.head_circ) : ""),
    }));

    // Ensure dob is formatted as YYYY-MM-DD
    const formattedDob = dbP.dob ? dbP.dob.split("T")[0] : "";

    return {
      patientName: dbP.patient_name,
      gender: dbP.gender,
      dob: formattedDob,
      gaAtBirth: String(dbP.ga_at_birth),
      visits: formattedVisits,
    };
  };

  const handleSelectPatient = (dbP: DBPatient, targetPath: string = "/") => {
    const pData = mapToPatientData(dbP);
    setPatient(pData);

    // Sync homeForm so the GrowChart page form panel and chart are consistent
    setHomeForm({
      patientName: pData.patientName,
      dob: pData.dob,
      gender: pData.gender,
      gaAtBirth: pData.gaAtBirth,
      visits: pData.visits,
      plotted: true,
      termWeek: dbP.term_week ?? 50,
    } as HomeFormState & { termWeek: number });

    navigate(targetPath);
  };

  const handleDeletePatient = async (e: React.MouseEvent, id: number, name: string) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete patient "${name}"?`)) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:3001/api/patients/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete patient");
      }

      setPatients(prev => prev.filter(p => p.id !== id));

      // If active patient was deleted, clear it or reload
      if (activePatient?.patientName === name) {
        // clear local patient context
        localStorage.removeItem("clinigrowth_patient");
      }
    } catch (err: any) {
      console.error("Error deleting patient:", err);
      alert("Could not delete patient. Please try again.");
    }
  };

  const filteredPatients = patients.filter(p =>
    p.patient_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.ga_at_birth && p.ga_at_birth.includes(searchTerm))
  );

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div style={s.page}>
      <div style={s.container}>
        {/* Header section */}
        <div style={s.header}>
          <div>
            <h1 style={s.title}>Patient Directory</h1>
            <p style={s.subtitle}>
              Select a patient from the list below to view their growth chart and developmental trajectory.
            </p>
          </div>
          <button style={s.addBtn} onClick={() => navigate("/add-patient")}>
            <span style={{ fontSize: 18 }}>+</span> Add New Patient
          </button>
        </div>

        {/* Search & Actions Bar */}
        <div style={s.filterBar}>
          <div style={s.searchWrap}>
            <span style={s.searchIcon}>🔍</span>
            <input
              type="text"
              placeholder="Search by patient name or GA..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={s.searchInput}
            />
            {searchTerm && (
              <button style={s.clearSearch} onClick={() => setSearchTerm("")}>
                ✕
              </button>
            )}
          </div>
          <button style={s.refreshBtn} onClick={fetchPatients} title="Refresh Patient List">
            🔄 Refresh
          </button>
        </div>

        {/* Error State */}
        {error && (
          <div style={s.errorBanner}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <span>{error}</span>
            <button style={s.retryBtn} onClick={fetchPatients}>
              Retry
            </button>
          </div>
        )}

        {/* Table / List View */}
        <div style={s.card}>
          {loading ? (
            <div style={s.loadingState}>
              <div style={s.spinner} />
              <p style={s.loadingText}>Loading patient records...</p>
            </div>
          ) : filteredPatients.length === 0 ? (
            <div style={s.emptyState}>
              <div style={s.emptyIcon}>👶</div>
              <h3 style={s.emptyTitle}>
                {searchTerm ? "No matching patients found" : "No patient records found"}
              </h3>
              <p style={s.emptySubtitle}>
                {searchTerm
                  ? `No patients match "${searchTerm}". Try a different search.`
                  : "Start by adding a patient to view and track their growth charts."}
              </p>
              {!searchTerm && (
                <button style={s.addBtn} onClick={() => navigate("/add-patient")}>
                  + Add First Patient
                </button>
              )}
            </div>
          ) : (
            <div style={s.tableContainer}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Patient Name</th>
                    <th style={s.th}>Gender</th>
                    <th style={s.th}>Date of Birth</th>
                    <th style={s.th}>GA at Birth</th>
                    <th style={s.th}>Visits</th>
                    <th style={{ ...s.th, textAlign: "right" }}>Actions / Growth Charts</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPatients.map((p) => {
                    const isMale = p.gender === "male";
                    const visitCount = p.visits ? p.visits.length : 0;
                    const isActive = activePatient?.patientName === p.patient_name;

                    return (
                      <tr
                        key={p.id}
                        style={{
                          ...s.tr,
                          ...(isActive ? s.trActive : {}),
                        }}
                        onClick={() => handleSelectPatient(p, "/")}
                      >
                        <td style={s.td}>
                          <div style={s.patientCell}>
                            <div
                              style={{
                                ...s.avatar,
                                backgroundColor: isMale ? "#eff6ff" : "#fdf2f8",
                                color: isMale ? "#2563eb" : "#db2777",
                                border: `1px solid ${isMale ? "#bfdbfe" : "#fbcfe8"}`,
                              }}
                            >
                              {p.patient_name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div style={s.patientNameText}>
                                {p.patient_name}
                                {isActive && <span style={s.activeBadge}>Active</span>}
                              </div>
                              <div style={s.patientSubText}>ID: #{p.id}</div>
                            </div>
                          </div>
                        </td>

                        <td style={s.td}>
                          <span
                            style={{
                              ...s.genderBadge,
                              backgroundColor: isMale ? "#eff6ff" : "#fdf2f8",
                              color: isMale ? "#1d4ed8" : "#be185d",
                              borderColor: isMale ? "#bfdbfe" : "#fbcfe8",
                            }}
                          >
                            <span>{isMale ? "♂ Male" : "♀ Female"}</span>
                          </span>
                        </td>

                        <td style={s.td}>
                          <span style={s.dateText}>{formatDate(p.dob)}</span>
                        </td>

                        <td style={s.td}>
                          <span style={s.gaBadge}>{p.ga_at_birth} weeks</span>
                        </td>

                        <td style={s.td}>
                          <span style={s.visitBadge}>
                            📊 {visitCount} {visitCount === 1 ? "visit" : "visits"}
                          </span>
                        </td>

                        <td style={{ ...s.td, textAlign: "right" }}>
                          <div style={s.actionBtnGroup}>
                            <button
                              style={s.chartBtnFenton}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectPatient(p, "/");
                              }}
                              title="View Fenton Preterm Chart"
                            >
                              📈 Fenton Chart
                            </button>

                            <button
                              style={s.chartBtnWHO}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectPatient(p, "/detail");
                              }}
                              title="View WHO Growth Chart"
                            >
                              📊 WHO Chart
                            </button>

                            <button
                              style={s.deleteBtn}
                              onClick={(e) => handleDeletePatient(e, p.id, p.patient_name)}
                              title="Delete Patient Record"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    backgroundColor: "#f8fafc",
    padding: "32px 24px",
    fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif",
    boxSizing: "border-box",
  },
  container: {
    maxWidth: "1200px",
    margin: "0 auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "24px",
    flexWrap: "wrap",
    gap: "16px",
  },
  title: {
    fontSize: "28px",
    fontWeight: 800,
    color: "#0f172a",
    margin: "0 0 6px 0",
    letterSpacing: "-0.5px",
  },
  subtitle: {
    fontSize: "14px",
    color: "#64748b",
    margin: 0,
    maxWidth: "600px",
  },
  addBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 20px",
    backgroundColor: "#2563eb",
    color: "#ffffff",
    border: "none",
    borderRadius: "10px",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(37,99,235,0.25)",
    transition: "all 0.2s ease",
  },
  filterBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px",
    gap: "16px",
  },
  searchWrap: {
    position: "relative",
    flex: 1,
    maxWidth: "420px",
  },
  searchIcon: {
    position: "absolute",
    left: "14px",
    top: "50%",
    transform: "translateY(-50%)",
    fontSize: "14px",
    color: "#94a3b8",
  },
  searchInput: {
    width: "100%",
    padding: "10px 36px 10px 38px",
    borderRadius: "10px",
    border: "1px solid #cbd5e1",
    fontSize: "14px",
    backgroundColor: "#ffffff",
    color: "#0f172a",
    outline: "none",
    boxSizing: "border-box",
  },
  clearSearch: {
    position: "absolute",
    right: "12px",
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    color: "#94a3b8",
    cursor: "pointer",
    fontSize: "14px",
  },
  refreshBtn: {
    padding: "10px 16px",
    backgroundColor: "#ffffff",
    border: "1px solid #cbd5e1",
    borderRadius: "10px",
    fontSize: "13px",
    fontWeight: 600,
    color: "#475569",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  errorBanner: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    backgroundColor: "#fef2f2",
    border: "1px solid #fca5a5",
    color: "#991b1b",
    padding: "14px 18px",
    borderRadius: "10px",
    marginBottom: "20px",
    fontSize: "14px",
  },
  retryBtn: {
    marginLeft: "auto",
    padding: "4px 12px",
    backgroundColor: "#991b1b",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    fontSize: "12px",
    cursor: "pointer",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: "14px",
    border: "1px solid #e2e8f0",
    boxShadow: "0 4px 20px rgba(0,0,0,0.04)",
    overflow: "hidden",
  },
  loadingState: {
    padding: "60px 20px",
    textAlign: "center",
  },
  spinner: {
    width: "36px",
    height: "36px",
    border: "3px solid #e2e8f0",
    borderTop: "3px solid #2563eb",
    borderRadius: "50%",
    margin: "0 auto 16px auto",
    animation: "spin 1s linear infinite",
  },
  loadingText: {
    fontSize: "14px",
    color: "#64748b",
    margin: 0,
  },
  emptyState: {
    padding: "60px 20px",
    textAlign: "center",
    maxWidth: "400px",
    margin: "0 auto",
  },
  emptyIcon: {
    fontSize: "48px",
    marginBottom: "12px",
  },
  emptyTitle: {
    fontSize: "18px",
    fontWeight: 700,
    color: "#0f172a",
    margin: "0 0 8px 0",
  },
  emptySubtitle: {
    fontSize: "14px",
    color: "#64748b",
    margin: "0 0 20px 0",
    lineHeight: 1.5,
  },
  tableContainer: {
    width: "100%",
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    textAlign: "left",
  },
  th: {
    backgroundColor: "#f8fafc",
    padding: "14px 20px",
    fontSize: "12px",
    fontWeight: 700,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    borderBottom: "1px solid #e2e8f0",
  },
  tr: {
    borderBottom: "1px solid #f1f5f9",
    cursor: "pointer",
    transition: "background-color 0.15s ease",
  },
  trActive: {
    backgroundColor: "#f0fdf4",
  },
  td: {
    padding: "16px 20px",
    fontSize: "14px",
    color: "#334155",
    verticalAlign: "middle",
  },
  patientCell: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  avatar: {
    width: "38px",
    height: "38px",
    borderRadius: "10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: "15px",
    flexShrink: 0,
  },
  patientNameText: {
    fontWeight: 700,
    fontSize: "15px",
    color: "#0f172a",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  patientSubText: {
    fontSize: "12px",
    color: "#94a3b8",
    marginTop: "2px",
  },
  activeBadge: {
    backgroundColor: "#dcfce7",
    color: "#166534",
    fontSize: "10px",
    fontWeight: 700,
    padding: "2px 6px",
    borderRadius: "4px",
    textTransform: "uppercase",
  },
  genderBadge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    borderRadius: "20px",
    fontSize: "12px",
    fontWeight: 600,
    border: "1px solid transparent",
  },
  dateText: {
    fontWeight: 500,
    color: "#334155",
  },
  gaBadge: {
    backgroundColor: "#f1f5f9",
    color: "#334155",
    padding: "4px 10px",
    borderRadius: "6px",
    fontSize: "13px",
    fontWeight: 600,
  },
  visitBadge: {
    fontSize: "13px",
    color: "#475569",
    fontWeight: 500,
  },
  actionBtnGroup: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
  },
  chartBtnFenton: {
    padding: "7px 12px",
    backgroundColor: "#eff6ff",
    color: "#2563eb",
    border: "1px solid #bfdbfe",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  chartBtnWHO: {
    padding: "7px 12px",
    backgroundColor: "#f0fdf4",
    color: "#16a34a",
    border: "1px solid #bbf7d0",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  deleteBtn: {
    padding: "7px 10px",
    backgroundColor: "#fff",
    color: "#ef4444",
    border: "1px solid #fee2e2",
    borderRadius: "6px",
    fontSize: "12px",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
};
