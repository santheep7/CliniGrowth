import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { useGrowchart } from "./GrowchartContext";

interface Visit {
  id: string;
  date: Date | null;
  height: string;
  weight: string;
  headCirc: string;
}

// Helper function to calculate chronological age in weeks
function calculateChronologicalAge(dob: Date | null, visitDate: Date | null): number | null {
  if (!dob || !visitDate) return null;
  const diffTime = visitDate.getTime() - dob.getTime();
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  return diffDays / 7; // Convert to weeks
}

// Helper function to calculate corrected gestational week
function calculateCorrectedGestationalWeek(gaAtBirth: string, chronologicalAge: number | null): number | null {
  if (!gaAtBirth || chronologicalAge === null) return null;
  const gaAtBirthNum = parseFloat(gaAtBirth);
  if (isNaN(gaAtBirthNum)) return null;
  return gaAtBirthNum + chronologicalAge;
}

// Custom input component with calendar icon
function DateInputWithIcon({ value, onClick, onChange, visitId, visits, setVisits }: any) {
  const [inputValue, setInputValue] = useState('');
  const [isDateSaved, setIsDateSaved] = useState(false);

  // Format Date object to DD/MM/YYYY string
  const formatDate = (date: Date | null | string): string => {
    if (!date) return '';
    if (typeof date === 'string') return date;
    if (date instanceof Date) {
      const d = date.getDate().toString().padStart(2, '0');
      const m = (date.getMonth() + 1).toString().padStart(2, '0');
      const y = date.getFullYear();
      return `${d}/${m}/${y}`;
    }
    return '';
  };

  // Initialize with the value prop (Date object)
  useEffect(() => {
    setInputValue(formatDate(value));
    setIsDateSaved(!!value);
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    let digits = input.replace(/\D/g, ''); // Remove non-digits
    
    // Auto-format as DD/MM/YYYY
    let formatted = '';
    if (digits.length >= 1) {
      formatted += digits.slice(0, 2);
    }
    if (digits.length >= 3) {
      formatted += '/' + digits.slice(2, 4);
    }
    if (digits.length >= 5) {
      formatted += '/' + digits.slice(4, 8);
    }
    
    setInputValue(formatted);
    setIsDateSaved(false);

    // Try to parse the complete date and update DatePicker immediately
    if (digits.length === 8) {
      const day = parseInt(digits.slice(0, 2));
      const month = parseInt(digits.slice(2, 4)) - 1; // JS months are 0-indexed
      const year = parseInt(digits.slice(4, 8));
      
      const parsedDate = new Date(year, month, day);
      if (!isNaN(parsedDate.getTime())) {
        // Update both DatePicker and visits array
        onChange(parsedDate);
        if (visitId && setVisits) {
          const updated = visits.map((v: any) => v.id === visitId ? { ...v, date: parsedDate } : v);
          setVisits(updated);
        }
        setIsDateSaved(true);
      }
    }
  };

  const handleBlur = () => {
    // When the input loses focus, try to parse the current value
    const digits = inputValue.replace(/\D/g, '');
    if (digits.length === 8) {
      const day = parseInt(digits.slice(0, 2));
      const month = parseInt(digits.slice(2, 4)) - 1;
      const year = parseInt(digits.slice(4, 8));
      
      const parsedDate = new Date(year, month, day);
      if (!isNaN(parsedDate.getTime())) {
        // Update both DatePicker and visits array
        onChange(parsedDate);
        if (visitId && setVisits) {
          const updated = visits.map((v: any) => v.id === visitId ? { ...v, date: parsedDate } : v);
          setVisits(updated);
        }
        setIsDateSaved(true);
      }
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleBlur}
        placeholder="DD/MM/YYYY"
        className="date-picker-input"
        style={{
          paddingRight: isDateSaved ? '70px' : '40px',
          borderColor: isDateSaved ? '#10b981' : undefined,
        }}
      />
      {isDateSaved && (
        <div
          style={{
            position: 'absolute',
            right: '40px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#10b981',
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
      )}
      <div
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        style={{
          position: 'absolute',
          right: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          cursor: 'pointer',
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#64748b"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
      </div>
    </div>
  );
}

export default function AddPatient() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setPatient, patient, setPatientWho, patientWho } = useGrowchart();
  const isEditMode = location.pathname === "/edit-patient";
  
  // Determine if we're editing for WHO or Fenton based on previous chart type
  const previousChartType = localStorage.getItem("gc_chartType") || "fenton";
  const isWhoMode = previousChartType === "who";
  const currentPatient = isWhoMode ? patientWho : patient;
  const setCurrentPatient = isWhoMode ? setPatientWho : setPatient;

  // Debug: log which mode we're in
  console.log('AddPatient mode:', { isWhoMode, previousChartType, hasPatientWho: !!patientWho, hasPatient: !!patient });

  const [formData, setFormData] = useState({
    patientName: "",
    gender: "male" as "male" | "female",
    dob: null as Date | null,
    gaAtBirth: "",
    termWeek: 50,
  });
  const [visits, setVisits] = useState<Visit[]>([
    { id: crypto.randomUUID(), date: null, height: "", weight: "", headCirc: "" }
  ]);

  // Load existing patient data in edit mode
  useEffect(() => {
    if (isEditMode && currentPatient) {
      setFormData({
        patientName: currentPatient.patientName,
        gender: currentPatient.gender as "male" | "female",
        dob: currentPatient.dob ? new Date(currentPatient.dob) : null,
        gaAtBirth: currentPatient.gaAtBirth,
        termWeek: 50,
      });
      setVisits(currentPatient.visits.length > 0 ? currentPatient.visits.map(v => ({
        ...v,
        date: v.date ? new Date(v.date) : null
      })) : [
        { id: crypto.randomUUID(), date: null, height: "", weight: "", headCirc: "" }
      ]);
    }
  }, [isEditMode, currentPatient]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Submitting visits:', visits);
    console.log('Visit dates:', visits.map(v => ({ id: v.id, date: v.date, dateType: typeof v.date })));
    setCurrentPatient({
      patientName: formData.patientName,
      gender: formData.gender,
      dob: formData.dob ? formData.dob.toISOString().split('T')[0] : "",
      gaAtBirth: formData.gaAtBirth,
      visits: visits.map(v => ({
        ...v,
        date: v.date instanceof Date ? v.date.toISOString().split('T')[0] : ""
      })),
    });
    // Navigate back to the appropriate chart type
    const previousChartType = localStorage.getItem("gc_chartType") || "fenton";
    navigate(previousChartType === "who" ? "/who-detail" : "/");
  };

  const handleSaveToDatabase = async () => {
    const patientData = {
      patientName: formData.patientName,
      gender: formData.gender,
      dob: formData.dob ? formData.dob.toISOString().split('T')[0] : "",
      gaAtBirth: formData.gaAtBirth,
      termWeek: formData.termWeek,
      visits: visits.map(v => ({
        date: v.date instanceof Date ? v.date.toISOString().split('T')[0] : "",
        height: v.height,
        weight: v.weight,
        headCirc: v.headCirc
      })),
    };

    try {
      const response = await fetch('http://localhost:3001/api/patients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(patientData),
      });

      if (!response.ok) {
        throw new Error('Failed to save to database');
      }

      const result = await response.json();
      console.log("Saved to database:", result);
      alert('Patient saved to database successfully!');
      
      // Also update the context with the saved data
      setCurrentPatient({
        patientName: formData.patientName,
        gender: formData.gender,
        dob: formData.dob ? formData.dob.toISOString().split('T')[0] : "",
        gaAtBirth: formData.gaAtBirth,
        visits: visits.map(v => ({
          ...v,
          date: v.date instanceof Date ? v.date.toISOString().split('T')[0] : ""
        })),
      });
    } catch (error) {
      console.error('Error saving to database:', error);
      alert('Failed to save to database. Please try again.');
    }
  };

  return (
    <div style={s.container}>
      <style>{`
        .date-picker-input {
          padding: 12px 16px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          font-size: 14px;
          width: 100%;
          box-sizing: border-box;
          transition: border-color 0.2s, box-shadow 0.2s;
          background-color: #fff;
        }
        .date-picker-input:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
        .react-datepicker-wrapper {
          width: 100%;
        }
        .react-datepicker__input-container input {
          width: 100%;
        }
      `}</style>
      <div style={s.card}>
        <h1 style={s.title}>{isEditMode ? "Edit Patient" : "Add New Patient"}</h1>
        <p style={s.subtitle}>{isEditMode ? "Update patient information and visits" : "Enter patient information to begin growth tracking"}</p>

        <form onSubmit={handleSubmit} style={s.form}>
          <div style={s.formGroup}>
            <label style={s.label}>Patient Name</label>
            <input
              type="text"
              value={formData.patientName}
              onChange={(e) => setFormData({ ...formData, patientName: e.target.value })}
              placeholder="Enter patient name"
              style={s.input}
              required
            />
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>Gender</label>
            <div style={s.genderOptions}>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, gender: "male" })}
                style={{
                  ...s.genderButton,
                  ...(formData.gender === "male" ? s.genderButtonActive : {}),
                }}
              >
                <span style={{ fontSize: 20 }}>♂</span>
                <span>Male</span>
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, gender: "female" })}
                style={{
                  ...s.genderButton,
                  ...(formData.gender === "female" ? s.genderButtonActive : {}),
                }}
              >
                <span style={{ fontSize: 20 }}>♀</span>
                <span>Female</span>
              </button>
            </div>
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>Date of Birth</label>
            <DatePicker
              selected={formData.dob}
              onChange={(date: Date | null) => setFormData({ ...formData, dob: date })}
              dateFormat="dd/MM/yyyy"
              placeholderText="DD/MM/YYYY"
              showMonthDropdown
              showYearDropdown
              scrollableYearDropdown
              yearDropdownItemNumber={100}
              maxDate={new Date()}
              customInput={<DateInputWithIcon />}
              required
            />
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>Gestational Age at Birth (weeks)</label>
            <input
              type="number"
              value={formData.gaAtBirth}
              onChange={(e) => setFormData({ ...formData, gaAtBirth: e.target.value })}
              placeholder="e.g., 32"
              min="22"
              max="44"
              step="0.5"
              style={s.input}
              required
            />
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>Fenton up to week</label>
            <input
              type="number"
              value={formData.termWeek}
              onChange={(e) => setFormData({ ...formData, termWeek: parseInt(e.target.value) || 50 })}
              placeholder="e.g., 50"
              min="22"
              max="50"
              step="1"
              style={s.input}
              required
            />
            <p style={s.helpText}>Maximum gestational age for Fenton chart (22-50 weeks)</p>
          </div>

          <div style={s.divider} />

          <div style={s.visitsHeader}>
            <h3 style={s.sectionTitle}>Visits</h3>
            <button type="button" onClick={() => setVisits([...visits, { id: crypto.randomUUID(), date: null, height: "", weight: "", headCirc: "" }])} style={s.addBtn}>+ Add Visit</button>
          </div>

          <div style={s.visitList}>
            {visits.map((visit, index) => (
              <div key={visit.id} style={s.visitCard}>
                <div style={s.visitCardHeader}>
                  <span style={s.visitLabel}>Visit #{index + 1}</span>
                  {visits.length > 1 && (
                    <button type="button" onClick={() => setVisits(visits.filter(v => v.id !== visit.id))} style={s.removeBtn}>Remove</button>
                  )}
                </div>
                <div style={s.formGroup}>
                  <label style={s.label}>Date of Examination</label>
                  <DatePicker
                    selected={visit.date}
                    onChange={(date: Date | null) => {
                      const updated = visits.map(v => v.id === visit.id ? { ...v, date } : v);
                      setVisits(updated);
                    }}
                    dateFormat="dd/MM/yyyy"
                    placeholderText="DD/MM/YYYY"
                    showMonthDropdown
                    showYearDropdown
                    scrollableYearDropdown
                    yearDropdownItemNumber={100}
                    minDate={formData.dob || undefined}
                    maxDate={new Date()}
                    customInput={<DateInputWithIcon visitId={visit.id} visits={visits} setVisits={setVisits} />}
                  />
                  {visit.date && formData.dob && formData.gaAtBirth && (() => {
                    const chronologicalAge = calculateChronologicalAge(formData.dob, visit.date);
                    const correctedGestationalWeek = calculateCorrectedGestationalWeek(formData.gaAtBirth, chronologicalAge);
                    return (
                      <div style={s.calculatedFields}>
                        <div style={s.calculatedField}>
                          <span style={s.calculatedLabel}>Chronological Age:</span>
                          <span style={s.calculatedValue}>
                            {chronologicalAge !== null ? `${chronologicalAge.toFixed(1)} weeks` : '-'}
                          </span>
                        </div>
                        <div style={s.calculatedField}>
                          <span style={s.calculatedLabel}>Corrected Gestational Week:</span>
                          <span style={s.calculatedValue}>
                            {correctedGestationalWeek !== null ? `${correctedGestationalWeek.toFixed(1)} weeks` : '-'}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <div style={s.row}>
                  <div style={{ ...s.formGroup, flex: 1 }}>
                    <label style={s.label}>Weight (kg)</label>
                    <input
                      type="number"
                      step="0.001"
                      value={visit.weight}
                      onChange={(e) => {
                        const updated = visits.map(v => v.id === visit.id ? { ...v, weight: e.target.value } : v);
                        setVisits(updated);
                      }}
                      style={s.input}
                      placeholder="0.00"
                    />
                  </div>
                  <div style={{ ...s.formGroup, flex: 1 }}>
                    <label style={s.label}>Length (cm)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={visit.height}
                      onChange={(e) => {
                        const updated = visits.map(v => v.id === visit.id ? { ...v, height: e.target.value } : v);
                        setVisits(updated);
                      }}
                      style={s.input}
                      placeholder="0.0"
                    />
                  </div>
                </div>
                <div style={s.formGroup}>
                  <label style={s.label}>Head Circumference (cm)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={visit.headCirc}
                    onChange={(e) => {
                      const updated = visits.map(v => v.id === visit.id ? { ...v, headCirc: e.target.value } : v);
                      setVisits(updated);
                    }}
                    style={s.input}
                    placeholder="0.0"
                  />
                </div>
              </div>
            ))}
          </div>

          <div style={s.buttonGroup}>
            <button
              type="button"
              onClick={() => navigate("/")}
              style={s.cancelButton}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveToDatabase}
              style={s.saveButton}
            >
              Save to Database
            </button>
            <button type="submit" style={s.submitButton}>
              {isEditMode ? "Update Patient" : "Add Patient"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    backgroundColor: "#f8fafc",
    padding: "20px",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
    padding: "40px",
    width: "100%",
    maxWidth: "480px",
  },
  title: {
    fontSize: 28,
    fontWeight: 800,
    color: "#1e293b",
    margin: "0 0 8px 0",
  },
  subtitle: {
    fontSize: 14,
    color: "#64748b",
    margin: "0 0 32px 0",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 24,
  },
  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: "#475569",
  },
  input: {
    padding: "12px 16px",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    fontSize: 14,
    transition: "border-color 0.2s",
    width: "100%",
    boxSizing: "border-box",
  },
  helpText: {
    fontSize: 11,
    color: "#94a3b8",
    margin: "4px 0 0 0",
  },
  calculatedFields: {
    marginTop: 8,
    padding: 12,
    backgroundColor: "#f0f9ff",
    borderRadius: 6,
    border: "1px solid #bae6fd",
  },
  calculatedField: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 4,
    fontSize: 12,
  },
  calculatedLabel: {
    color: "#475569",
    fontWeight: 500,
  },
  calculatedValue: {
    color: "#0284c7",
    fontWeight: 600,
  },
  divider: {
    borderTop: "1px solid #e2e8f0",
    margin: "24px 0",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "#0f172a",
    margin: 0,
  },
  visitsHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  addBtn: {
    padding: "6px 12px",
    backgroundColor: "#3b82f6",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  visitList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  visitCard: {
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: 16,
    backgroundColor: "#f8fafc",
  },
  visitCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  visitLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: "#0f172a",
  },
  removeBtn: {
    background: "none",
    border: "none",
    color: "#ef4444",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 500,
  },
  row: {
    display: "flex",
    gap: 12,
  },
  genderOptions: {
    display: "flex",
    gap: 12,
  },
  genderButton: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "12px",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    backgroundColor: "#fff",
    fontSize: 14,
    fontWeight: 500,
    color: "#64748b",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  genderButtonActive: {
    borderColor: "#3b82f6",
    backgroundColor: "#eff6ff",
    color: "#3b82f6",
    fontWeight: 600,
  },
  buttonGroup: {
    display: "flex",
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    padding: "12px 24px",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    backgroundColor: "#fff",
    fontSize: 14,
    fontWeight: 600,
    color: "#64748b",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  saveButton: {
    flex: 1,
    padding: "12px 24px",
    borderRadius: 8,
    border: "none",
    backgroundColor: "#10b981",
    fontSize: 14,
    fontWeight: 600,
    color: "#fff",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  submitButton: {
    flex: 1,
    padding: "12px 24px",
    borderRadius: 8,
    border: "none",
    backgroundColor: "#3b82f6",
    fontSize: 14,
    fontWeight: 600,
    color: "#fff",
    cursor: "pointer",
    transition: "all 0.2s",
  },
};
