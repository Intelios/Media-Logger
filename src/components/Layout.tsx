import { NavLink, Outlet } from "react-router-dom";
import { Home, Calendar, BarChart3, Search, Award, Users, Layers } from "lucide-react";
import { cn } from "../lib/utils_ui";

// Configurable Years matching your python config
const YEARS = ["2023", "2024", "2025", "2026"];

export function Layout() {
  return (
    <div className="flex h-screen bg-[#121212] text-white overflow-hidden">
      
      {/* Sidebar */}
      <aside className="w-64 bg-[#1E1E1E]/50 backdrop-blur-xl border-r border-white/5 flex flex-col p-4">
        <div className="mb-8 px-2">
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
            Media Logger
          </h1>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 space-y-1 overflow-y-auto pr-2 custom-scrollbar">
          <NavItem to="/" icon={<Home size={18} />} label="Home" />
          
          <div className="py-2">
            <p className="px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Years</p>
            {YEARS.map(year => (
              <NavItem key={year} to={`/year/${year}`} icon={<Calendar size={18} />} label={year} />
            ))}
          </div>

          <NavItem to="/stats" icon={<BarChart3 size={18} />} label="Stats" />
          <NavItem to="/search" icon={<Search size={18} />} label="Search" />
          <NavItem to="/awards" icon={<Award size={18} />} label="Awards" />
          <NavItem to="/profiles" icon={<Users size={18} />} label="Profiles" />
          <NavItem to="/collections" icon={<Layers size={18} />} label="Collections" />
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-6 scroll-smooth">
        <Outlet />
      </main>
    </div>
  );
}

// Small sub-component for links
function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
          isActive 
            ? "bg-primary text-white shadow-lg shadow-primary/25" 
            : "text-gray-400 hover:bg-white/5 hover:text-white"
        )
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}