import { BrowserRouter, Routes, Route } from "react-router-dom";
import { GrowchartProvider } from "./Components/Growchart/GrowchartContext";
import Navbar from "./Components/Growchart/Navbar";
import GrowChart from "./Components/Growchart/growchart.tsx";
import GrowchartDetail from "./Components/Growchart/GrowchartDetail";
import TDSCChart from "./Components/Growchart/DevelopmentScreen.tsx";
import TDSC3yrs from "./Components/Growchart/TDSC3yrs.tsx";

function App() {
  return (
    <BrowserRouter>
      <GrowchartProvider>
        <Navbar />
        <Routes>
          <Route path="/" element={<GrowChart />} />
          <Route path="/detail" element={<GrowchartDetail />} />
          <Route path="/DevelopmentScreen" element={<TDSCChart />} />
          <Route path="/TDSC3yrs" element={<TDSC3yrs />} />
        </Routes>
      </GrowchartProvider>
    </BrowserRouter>
  );
}

export default App;
