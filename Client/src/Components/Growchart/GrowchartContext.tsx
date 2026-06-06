import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type Gender = "male" | "female" | "";

export interface Visit {
  id: string;
  date: string;
  height: string;
  weight: string;
  headCirc: string;
  gaWeeks: string;
}

export interface PatientData {
  patientName: string;
  dob: string;
  gender: Gender;
  gaAtBirth: string;
  visits: Visit[];
}

export interface HomeFormState {
  patientName: string;
  dob: string;
  gender: Gender;
  gaAtBirth: string;
  visits: Visit[];
  plotted: boolean;
}

const STORAGE_KEY_PATIENT = "clinigrowth_patient";
const STORAGE_KEY_HOMEFORM = "clinigrowth_homeform";

function newVisit(): Visit { return { id: crypto.randomUUID(), date: "", height: "", weight: "", headCirc: "", gaWeeks: "" }; }
const DEFAULT_VISIT: Visit = newVisit();

const DEFAULT_FORM: HomeFormState = {
  patientName: "",
  dob: "",
  gender: "",
  gaAtBirth: "",
  visits: [DEFAULT_VISIT],
  plotted: false,
};

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* quota exceeded — ignore */ }
}

interface GrowchartContextType {
  patient: PatientData | null;
  setPatient: (p: PatientData) => void;
  homeForm: HomeFormState;
  setHomeForm: (f: HomeFormState | ((prev: HomeFormState) => HomeFormState)) => void;
}

const GrowchartContext = createContext<GrowchartContextType>({
  patient: null,
  setPatient: () => {},
  homeForm: DEFAULT_FORM,
  setHomeForm: () => {},
});

export function GrowchartProvider({ children }: { children: ReactNode }) {
  const [patient, setPatientState] = useState<PatientData | null>(() => loadFromStorage<PatientData | null>(STORAGE_KEY_PATIENT, null));
  const [homeForm, setHomeFormState] = useState<HomeFormState>(() => loadFromStorage<HomeFormState>(STORAGE_KEY_HOMEFORM, DEFAULT_FORM));

  const setPatient = useCallback((p: PatientData) => {
    setPatientState(p);
    saveToStorage(STORAGE_KEY_PATIENT, p);
  }, []);

  const setHomeForm = useCallback((f: HomeFormState | ((prev: HomeFormState) => HomeFormState)) => {
    setHomeFormState(prev => {
      const next = typeof f === "function" ? (f as (prev: HomeFormState) => HomeFormState)(prev) : f;
      saveToStorage(STORAGE_KEY_HOMEFORM, next);
      return next;
    });
  }, []);

  return (
    <GrowchartContext.Provider value={{ patient, setPatient, homeForm, setHomeForm }}>
      {children}
    </GrowchartContext.Provider>
  );
}

export function useGrowchart() {
  return useContext(GrowchartContext);
}