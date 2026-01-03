import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import YearView from "./pages/YearView";
import SearchPage from "./pages/Search";
import StatsPage from "./pages/Stats";
import ProfilesPage from "./pages/Profiles";
import AwardsPage from "./pages/Awards";
import CollectionsPage from "./pages/Collections";
import SettingsPage from "./pages/Settings";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="year/:year" element={<YearView />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="profiles" element={<ProfilesPage />} />
          <Route path="awards" element={<AwardsPage />} />
          <Route path="collections" element={<CollectionsPage />} />
          <Route path="settings" element={<SettingsPage />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;