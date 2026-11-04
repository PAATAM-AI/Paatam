import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  BookOpen,
  Sparkles,
  GraduationCap,
  CheckCircle2,
  Layers,
  BarChart3,
  Users,
  Building2,
  UserCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import paatamLogo from '../assets/paatam-logo-white-4000.png';

interface SidebarProps {
  onClearDb?: () => void;
}

export default function Sidebar({ onClearDb: _onClearDb }: SidebarProps) {
  const location = useLocation();
  const { role } = useAuth();
  const isDean = role === 'ADMIN';
  const isTeacher = role === 'TEACHER';

  const isActive = (path: string, tab?: string) => {
    if (tab) {
      const searchParams = new URLSearchParams(location.search);
      return location.pathname === '/' && searchParams.get('tab') === tab;
    }
    if (path === '/' && (location.pathname === '/' && !location.search)) {
      return true;
    }
    return location.pathname === path || (location.pathname.startsWith(path) && path !== '/');
  };

  return (
    <>
      <aside className="app-sidebar no-print">
        {/* Brand Header */}
        <div className="sidebar-brand">
          <div className="sidebar-logo-icon">
            <img src={paatamLogo} alt="Paatam AI logo" className="sidebar-logo-image" />
          </div>
          <div>
            <p className="sidebar-brand-name">PAATAM.AI</p>
            <p className="sidebar-brand-tagline">AI SCHOOL MANAGEMENT</p>
          </div>
        </div>

        {/* Main Navigation (Role-Based) */}
        <nav className="sidebar-nav">
          {/* 1. Campus Overview (Dean placeholder tab) */}
          {isDean && (
            <NavLink
              to="/campus-overview"
              className={({ isActive: isNavActive }) => `sidebar-nav-link ${isNavActive ? 'active' : ''}`}
            >
              <Building2 className="size-4 sidebar-nav-icon shrink-0" />
              <span>Campus Overview</span>
            </NavLink>
          )}

          {/* 2. Overview (Teacher only) */}
          {isTeacher && (
            <NavLink
              to="/"
              end
              className={({ isActive: isNavActive }) => `sidebar-nav-link ${isNavActive || isActive('/', 'overview') ? 'active' : ''}`}
            >
              <LayoutDashboard className="size-4 sidebar-nav-icon shrink-0" />
              <span>Overview</span>
            </NavLink>
          )}

          {/* 3. Analytics (All Roles - personalized for Student) */}
          <NavLink
            to="/analytics"
            className={({ isActive: isNavActive }) => `sidebar-nav-link ${isNavActive ? 'active' : ''}`}
          >
            <BarChart3 className="size-4 sidebar-nav-icon shrink-0" />
            <span>{role === 'STUDENT' ? 'My Progress Analytics' : 'Student Analytics'}</span>
          </NavLink>

          {/* 4. Faculty & Staff (Dean only) */}
          {isDean && (
            <NavLink
              to="/teachers"
              className={({ isActive: isNavActive }) => `sidebar-nav-link ${isNavActive ? 'active' : ''}`}
            >
              <UserCheck className="size-4 sidebar-nav-icon shrink-0" />
              <span>Faculty Directory</span>
            </NavLink>
          )}

          {/* 5. Classes & Sections (Admin & Teacher) */}
          {role !== 'STUDENT' && (
            <NavLink
              to="/classes"
              className={({ isActive: isNavActive }) => `sidebar-nav-link ${isNavActive ? 'active' : ''}`}
            >
              <Layers className="size-4 sidebar-nav-icon shrink-0" />
              <span>Classes & Sections</span>
            </NavLink>
          )}

          {/* 6. Student Roster & Bulk CSV (Dean only) */}
          {isDean && (
            <NavLink
              to="/students"
              className={({ isActive: isNavActive }) => `sidebar-nav-link ${isNavActive ? 'active' : ''}`}
            >
              <Users className="size-4 sidebar-nav-icon shrink-0" />
              <span>Students & Parents</span>
            </NavLink>
          )}

          {/* 7. Knowledge Base (Teacher only) */}
          {isTeacher && (
            <NavLink
              to="/knowledge"
              className={({ isActive: isNavActive }) => `sidebar-nav-link ${isNavActive || isActive('/', 'knowledge') ? 'active' : ''}`}
            >
              <BookOpen className="size-4 sidebar-nav-icon shrink-0" />
              <span>Knowledge Base</span>
            </NavLink>
          )}

          {/* 8. Exam Generator (Teacher only) */}
          {isTeacher && (
            <NavLink
              to="/generator"
              className={({ isActive: isNavActive }) => `sidebar-nav-link ${isNavActive || isActive('/', 'generator') ? 'active' : ''}`}
            >
              <Sparkles className="size-4 sidebar-nav-icon shrink-0" />
              <span>Exam Generator</span>
            </NavLink>
          )}

          {/* Student Portal (Shown ONLY to Student role) */}
          {role === 'STUDENT' && (
            <>
              <div className="sidebar-section-divider" />
              <div className="sidebar-section-title">Student Workspace</div>
              <NavLink
                to="/student"
                className={({ isActive: isNavActive }) => `sidebar-nav-link ${isNavActive ? 'active' : ''}`}
              >
                <GraduationCap className="size-4 sidebar-nav-icon shrink-0" />
                <span>Student Portal</span>
              </NavLink>
            </>
          )}
        </nav>

        {/* Footer info & DB reset (Admin Only - Hidden for Student and Teacher) */}
        {role === 'ADMIN' && (
          <div className="sidebar-footer">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#94A3B8' }}>
              <CheckCircle2 className="size-3.5 text-emerald-400" />
              <span>6 AI Agents Active</span>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
