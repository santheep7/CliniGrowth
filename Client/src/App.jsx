import { BrowserRouter, Routes, Route } from "react-router-dom";
import { GrowchartProvider } from "./Components/Growchart/GrowchartContext";
import Navbar from "./Components/Growchart/Navbar";
import GrowChart from "./Components/Growchart/growchart.tsx";
import GrowchartDetail from "./Components/Growchart/GrowchartDetail";
import TDSCChartManager from "./Components/Growchart/TDSchartmanager.tsx";

function App() {
  return (
    <BrowserRouter>
      <GrowchartProvider>
        <Navbar />
        <Routes>
          <Route path="/" element={<GrowChart />} />
          <Route path="/detail" element={<GrowchartDetail />} />
          <Route path="/TDSC3yrs" element={<TDSCChartManager />} />
        </Routes>
      </GrowchartProvider>
    </BrowserRouter>
  );
}

export default App;