import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Bell,
  ChevronDown,
  LogOut,
  FileCheck2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import schoolLogo from '../assets/OIP.png';

interface TopBarProps {
  onClearDb?: () => void;
}

export default function TopBar({ onClearDb: _onClearDb }: TopBarProps) {
  const navigate = useNavigate();
  const {
    currentUser,
    role,
    logout
  } = useAuth();

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(true);

  const profileRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  // Close popups on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute initials (e.g. "Mohit Yadav" -> "MY")
  const getInitials = (name?: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const q = searchQuery.toLowerCase().trim();
    if (q.includes('student') || q.includes('roster')) {
      navigate('/students');
    } else if (q.includes('paper') || q.includes('exam')) {
      navigate('/generator');
    } else if (q.includes('class') || q.includes('section')) {
      navigate('/classes');
    } else if (q.includes('submi') || q.includes('grade') || q.includes('review')) {
      navigate('/submissions');
    } else {
      navigate(`/students?search=${encodeURIComponent(searchQuery)}`);
    }
  };

  const roleLabel = role === 'ADMIN' ? 'Dean & Principal' : role === 'TEACHER' ? 'Teacher' : 'Student';

  const mockNotifications = [
    {
      id: 'n1',
      title: 'Answer Sheet Ready for Review',
      desc: 'Student 42 (Mid Term Exam - Paper 2 Reading) waiting for teacher sign-off.',
      time: '5m ago',
      path: '/submissions'
    },
    {
      id: 'n2',
      title: 'AI Evaluation Completed',
      desc: 'Psychology Unit 3 auto-graded with 98% OCR confidence.',
      time: '18m ago',
      path: '/analytics'
    },
    {
      id: 'n3',
      title: 'Faculty Timetable Updated',
      desc: 'Section schedules were refreshed for the current week.',
      time: '1h ago',
      path: '/classes'
    }
  ];

  return (
    <header className="app-topbar no-print">
      <div className="topbar-school-block">
        <img src={schoolLogo} alt="Bellwether school logo" className="topbar-school-logo" />
        <div className="topbar-school-text">
          <span className="topbar-school-name">Bellwether International School</span>
          <span className="topbar-school-meta">Academic Campus · Session 2026-27</span>
        </div>
      </div>

      <form onSubmit={handleSearchSubmit} className="topbar-search-form">
        <div className="topbar-search-wrapper">
          <Search className="topbar-search-icon" size={17} />
          <input
            type="text"
            className="topbar-search-input"
            placeholder="Search students, papers, or classes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </form>

      <div className="topbar-right-group">
        <div className="topbar-cloud-pill">Cloud Online</div>

        {/* Notification Bell */}
        <div className="topbar-relative-container" ref={notificationsRef}>
          <button
            type="button"
            className="topbar-icon-button"
            title="Notifications"
            onClick={() => {
              setIsNotificationsOpen(!isNotificationsOpen);
              setIsProfileOpen(false);
              setHasUnreadNotifications(false);
            }}
          >
            <Bell size={18} className="text-slate-600" />
            {hasUnreadNotifications && <span className="topbar-badge-dot" />}
          </button>

          {/* Notifications Dropdown */}
          {isNotificationsOpen && (
            <div className="topbar-dropdown-menu notifications-menu animate-fade-in">
              <div className="dropdown-header">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700, color: '#0F172A' }}>
                    Notifications
                  </h4>
                  <span style={{ fontSize: '0.6875rem', color: '#2563EB', fontWeight: 600 }}>
                    3 New Alerts
                  </span>
                </div>
              </div>

              <div className="notifications-list">
                {mockNotifications.map((notif) => (
                  <div
                    key={notif.id}
                    className="notification-item"
                    onClick={() => {
                      setIsNotificationsOpen(false);
                      navigate(notif.path);
                    }}
                  >
                    <div className="notification-item-icon">
                      <FileCheck2 size={15} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="notification-item-title">{notif.title}</div>
                      <div className="notification-item-desc">{notif.desc}</div>
                      <div className="notification-item-time">{notif.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User Profile Pill Capsule */}
        <div className="topbar-relative-container" ref={profileRef}>
          <button
            type="button"
            className={`topbar-profile-capsule ${isProfileOpen ? 'active' : ''}`}
            onClick={() => {
              setIsProfileOpen(!isProfileOpen);
              setIsNotificationsOpen(false);
            }}
            title="Account settings"
          >
            <div className="topbar-avatar-circle">
              {getInitials(currentUser?.name)}
            </div>
            <div className="topbar-user-text">
              <span className="topbar-user-name">{currentUser?.name}</span>
              <span className="topbar-user-role">{roleLabel}</span>
            </div>
            <ChevronDown size={15} className={`topbar-chevron ${isProfileOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* User Profile Menu */}
          {isProfileOpen && (
            <div className="topbar-dropdown-menu profile-menu animate-fade-in">
              <div className="profile-menu-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div className="topbar-avatar-circle large">
                    {getInitials(currentUser?.name)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#0F172A' }}>
                      {currentUser?.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                      {currentUser?.email}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span className={`role-tag role-${(role || 'student').toLowerCase()}`}>
                    {roleLabel}
                  </span>
                  <span className="branch-tag">
                    {currentUser?.branchName || 'Hyderabad Central Campus'}
                  </span>
                </div>
              </div>

              <div className="profile-menu-footer">
                <button
                  type="button"
                  className="dropdown-action-btn text-destructive"
                  onClick={() => {
                    setIsProfileOpen(false);
                    logout();
                    navigate('/login');
                  }}
                >
                  <LogOut size={15} />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
