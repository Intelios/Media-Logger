import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import YearView from "./pages/YearView";
import SearchPage from "./pages/Search";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="year/:year" element={<YearView />} />
          <Route path="search" element={<SearchPage />} />
          
          {/* Placeholders for other routes - we'll build these next */}
          <Route path="stats" element={<div>Stats View (Coming Soon)</div>} />
          <Route path="search" element={<div>Search View (Coming Soon)</div>} />
          <Route path="awards" element={<div>Awards View (Coming Soon)</div>} />
          <Route path="profiles" element={<div>Profiles View (Coming Soon)</div>} />
          <Route path="collections" element={<div>Collections View (Coming Soon)</div>} />
          
          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;