
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
  UserCheck,
  Menu,
  FileCheck2,
  Trash2,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import paatamLogo from '../assets/paatam-logo-white-4000.png';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onClearDb?: () => void;
}

export default function Sidebar({
  collapsed,
  onToggle,
  onClearDb,
}: SidebarProps) {
  const location = useLocation();
  const { role } = useAuth();

  const isDean = role === 'ADMIN';
  const isTeacher = role === 'TEACHER';
  const isStudent = role === 'STUDENT';

  const isActive = (path: string, tab?: string) => {
    if (tab) {
      const searchParams = new URLSearchParams(location.search);

      return (
        location.pathname === '/' &&
        searchParams.get('tab') === tab
      );
    }

    if (path === '/') {
      return location.pathname === '/' && !location.search;
    }

    return (
      location.pathname === path ||
      location.pathname.startsWith(`${path}/`)
    );
  };

  const linkClass = (active: boolean) =>
    `sidebar-nav-link ${active ? 'active' : ''}`;

  return (
    <aside
      className={`app-sidebar no-print ${
        collapsed ? 'sidebar-is-collapsed' : ''
      }`}
    >
      {/* Brand and collapse control */}
      <div className="sidebar-brand">
        <div className="sidebar-logo-icon">
          <img
            src={paatamLogo}
            alt="Paatam AI logo"
            className="sidebar-logo-image"
          />
        </div>

        {!collapsed && (
          <div className="sidebar-brand-text">
            <p className="sidebar-brand-name">PAATAM.AI</p>
            <p className="sidebar-brand-tagline">
              AI SCHOOL MANAGEMENT
            </p>
          </div>
        )}

        <button
          type="button"
          className="sidebar-toggle-button"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Menu size={21} />
        </button>
      </div>

      {/* Role-based navigation with collapsed icon mode */}
      <nav className="sidebar-nav">
        {/* Campus Overview - ADMIN */}
        {isDean && (
          <NavLink
            to="/campus-overview"
            title="Campus Overview"
            className={() => linkClass(
              isActive('/campus-overview') ||
              isActive('/principal/overview')
            )}
          >
            <Building2 className="size-4 sidebar-nav-icon shrink-0" />
            {!collapsed && <span>Campus Overview</span>}
          </NavLink>
        )}

        {/* Overview - TEACHER */}
        {isTeacher && (
          <NavLink
            to="/"
            end
            title="Overview"
            className={() => linkClass(isActive('/', 'overview'))}
          >
            <LayoutDashboard className="size-4 sidebar-nav-icon shrink-0" />
            {!collapsed && <span>Overview</span>}
          </NavLink>
        )}

        {/* Campus and Leadership - ADMIN */}
        {isDean && (
          <NavLink
            to="/campuses"
            title="Campus & Leadership"
            className={({ isActive: active }) => linkClass(active)}
          >
            <Building2 className="size-4 sidebar-nav-icon shrink-0" />
            {!collapsed && <span>Campus & Leadership</span>}
          </NavLink>
        )}

        {/* Student Analytics - all roles */}
        <NavLink
          to="/analytics"
          title={isStudent ? 'My Progress Analytics' : 'Student Analytics'}
          className={({ isActive: active }) => linkClass(active)}
        >
          <BarChart3 className="size-4 sidebar-nav-icon shrink-0" />
          {!collapsed && (
            <span>
              {isStudent ? 'My Progress Analytics' : 'Student Analytics'}
            </span>
          )}
        </NavLink>

        {/* Faculty Directory - ADMIN */}
        {isDean && (
          <NavLink
            to="/teachers"
            title="Faculty Directory"
            className={({ isActive: active }) => linkClass(active)}
          >
            <UserCheck className="size-4 sidebar-nav-icon shrink-0" />
            {!collapsed && <span>Faculty Directory</span>}
          </NavLink>
        )}

        {/* Classes and Sections - ADMIN and TEACHER */}
        {!isStudent && (
          <NavLink
            to="/classes"
            title="Classes & Sections"
            className={({ isActive: active }) => linkClass(active)}
          >
            <Layers className="size-4 sidebar-nav-icon shrink-0" />
            {!collapsed && <span>Classes & Sections</span>}
          </NavLink>
        )}

        {/* Students and Parents - ADMIN */}
        {isDean && (
          <NavLink
            to="/students"
            title="Students & Parents"
            className={({ isActive: active }) => linkClass(active)}
          >
            <Users className="size-4 sidebar-nav-icon shrink-0" />
            {!collapsed && <span>Students & Parents</span>}
          </NavLink>
        )}

        {/* Knowledge Base - TEACHER */}
        {isTeacher && (
          <NavLink
            to="/knowledge"
            title="Knowledge Base"
            className={() =>
              linkClass(
                isActive('/knowledge') ||
                isActive('/', 'knowledge')
              )
            }
          >
            <BookOpen className="size-4 sidebar-nav-icon shrink-0" />
            {!collapsed && <span>Knowledge Base</span>}
          </NavLink>
        )}

        {/* Exam Generator - TEACHER */}
        {isTeacher && (
          <NavLink
            to="/generator"
            title="Exam Generator"
            className={() =>
              linkClass(
                isActive('/generator') ||
                isActive('/', 'generator') ||
                isActive('/', 'exam-generator')
              )
            }
          >
            <Sparkles className="size-4 sidebar-nav-icon shrink-0" />
            {!collapsed && <span>Exam Generator</span>}
          </NavLink>
        )}

        {/* Submissions Feed - ADMIN and TEACHER */}
        {!isStudent && (
          <NavLink
            to="/submissions"
            title="Submissions Feed"
            className={({ isActive: active }) => linkClass(active)}
          >
            <FileCheck2 className="size-4 sidebar-nav-icon shrink-0" />
            {!collapsed && <span>Submissions Feed</span>}
          </NavLink>
        )}

        {/* Student Workspace - STUDENT */}
        {isStudent && (
          <>
            <div className="sidebar-section-divider" />

            {!collapsed && (
              <div className="sidebar-section-title">
                Student Workspace
              </div>
            )}

            <NavLink
              to="/student"
              title="Student Portal"
              className={({ isActive: active }) => linkClass(active)}
            >
              <GraduationCap className="size-4 sidebar-nav-icon shrink-0" />
              {!collapsed && <span>Student Portal</span>}
            </NavLink>
          </>
        )}
      </nav>

      {/* Footer */}
      {isDean && (
        <div className="sidebar-footer">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.75rem',
              color: '#94A3B8',
            }}
          >
            <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" />
            {!collapsed && <span>6 AI Agents Active</span>}
          </div>

          <div className="sidebar-status">
            <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" />
            {!collapsed && <span>AI Grading Engine Online</span>}
          </div>

          {onClearDb && (
            <button
              type="button"
              onClick={onClearDb}
              title="Reset all database submissions"
              aria-label="Reset all database submissions"
              className="sidebar-reset-button"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
