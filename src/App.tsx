import { Suspense, lazy, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ThemeProvider } from "./lib/ThemeContext";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const YearView = lazy(() => import("./pages/YearView"));
const SearchPage = lazy(() => import("./pages/Search"));
const StatsPage = lazy(() => import("./pages/Stats"));
const ProfilesPage = lazy(() => import("./pages/Profiles"));
const AwardsPage = lazy(() => import("./pages/Awards"));
const CollectionsPage = lazy(() => import("./pages/Collections"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const ReviewPage = lazy(() => import("./pages/Review"));

function RouteFallback() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 animate-pulse">
      <div className="h-10 w-48 rounded-2xl bg-white/10" />
      <div className="h-32 rounded-3xl bg-white/5" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="h-48 rounded-3xl bg-white/5" />
        <div className="h-48 rounded-3xl bg-white/5" />
        <div className="h-48 rounded-3xl bg-white/5" />
      </div>
    </div>
  );
}

function LazyRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<LazyRoute><Dashboard /></LazyRoute>} />
            <Route path="year/:year" element={<LazyRoute><YearView /></LazyRoute>} />
            <Route path="search" element={<LazyRoute><SearchPage /></LazyRoute>} />
            <Route path="stats" element={<LazyRoute><StatsPage /></LazyRoute>} />
            <Route path="profiles" element={<LazyRoute><ProfilesPage /></LazyRoute>} />
            <Route path="awards" element={<LazyRoute><AwardsPage /></LazyRoute>} />
            <Route path="collections" element={<LazyRoute><CollectionsPage /></LazyRoute>} />
            <Route path="review" element={<LazyRoute><ReviewPage /></LazyRoute>} />
            <Route path="settings" element={<LazyRoute><SettingsPage /></LazyRoute>} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
