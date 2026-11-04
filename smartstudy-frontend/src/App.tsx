
import { useState } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
} from 'react-router-dom';

import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';

import LoginPage from './pages/LoginPage';
import Overview from './pages/Overview';
import ScanGrade from './pages/ScanGrade';
import ReviewQueue from './pages/ReviewQueue';
import ReviewSubmission from './pages/ReviewSubmission';
import KnowledgeBase from './pages/KnowledgeBase';
import ExamGenerator from './pages/ExamGenerator';
import StudentPortal from './pages/StudentPortal';
import ParentPortal from './pages/ParentPortal';

import Classes from './pages/Classes';
import ClassDetail from './pages/ClassDetail';
import SubjectWorkspace from './pages/SubjectWorkspace';
import PaperDetail from './pages/PaperDetail';

import Analytics from './pages/Analytics';
import Teachers from './pages/Teachers';
import StudentsRoster from './pages/StudentsRoster';
import Campuses from './pages/Campuses';

import PrincipalOverview from './pages/principal/Overview';
import PrincipalClasses from './pages/principal/ClassesSections';
import PrincipalTeachers from './pages/principal/TeacherPerformance';

import { AuthProvider } from './context/AuthContext';
import { API_BASE_URL } from './config/api';

// Handles both normal routes and legacy query parameter navigation.
function MainRouteDispatcher() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const tab = searchParams.get('tab');

  if (location.pathname === '/') {
    if (tab === 'scan') return <ScanGrade />;
    if (tab === 'queue') return <ReviewQueue />;
    if (tab === 'knowledge') return <KnowledgeBase />;

    if (tab === 'generator' || tab === 'exam-generator') {
      return <ExamGenerator />;
    }

    if (tab === 'analytics') return <Analytics />;

    return <Overview />;
  }

  return null;
}

function App() {
  const handleClearDb = async () => {
    if (
      window.confirm(
        'Are you sure you want to clear all submissions and database records?'
      )
    ) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/clear`, {
          method: 'DELETE',
        });

        const data = await res.json();

        alert(data.message || 'Database reset complete!');
        window.location.reload();
      } catch (err) {
        console.error(err);
        alert('Error resetting database.');
      }
    }
  };

  return (
    <AuthProvider>
      <Router>
        <AppLayout onClearDb={handleClearDb} />
      </Router>
    </AuthProvider>
  );
}

function AppLayout({
  onClearDb,
}: {
  onClearDb: () => void;
}) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const isLoginPage = location.pathname === '/login';

  const handleSidebarToggle = () => {
    setCollapsed((previous) => !previous);
  };

  // Keep the existing login screen layout unchanged.
  if (isLoginPage) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <div
      className={`app-shell-container ${
        collapsed ? 'sidebar-collapsed' : ''
      }`}
    >
      <Sidebar
        collapsed={collapsed}
        onToggle={handleSidebarToggle}
        onClearDb={onClearDb}
      />

      <div className="app-main-content">
        <TopBar onClearDb={onClearDb} />

        <Routes>
          {/* Existing dashboard and legacy navigation */}
          <Route path="/" element={<MainRouteDispatcher />} />
          <Route path="/login" element={<LoginPage />} />

          {/* Student Analytics */}
          <Route path="/analytics" element={<Analytics />} />

          {/* Existing classes and sections */}
          <Route path="/classes" element={<Classes />} />
          <Route path="/classes/:classId" element={<ClassDetail />} />
          <Route
            path="/classes/:classId/:classSubjectId"
            element={<SubjectWorkspace />}
          />

          {/* Existing faculty, students and campuses */}
          <Route path="/teachers" element={<Teachers />} />
          <Route path="/students" element={<StudentsRoster />} />
          <Route path="/campuses" element={<Campuses />} />

          {/* Campus Overview: Mohit's original route and local alias */}
          <Route
            path="/campus-overview"
            element={<PrincipalOverview />}
          />
          <Route
            path="/principal/overview"
            element={<PrincipalOverview />}
          />

          {/* Principal dashboard drill-down pages */}
          <Route
            path="/principal/classes"
            element={<PrincipalClasses />}
          />
          <Route
            path="/principal/teachers"
            element={<PrincipalTeachers />}
          />

          {/* Existing examination and submission routes */}
          <Route path="/papers/:assignmentId" element={<PaperDetail />} />
          <Route path="/upload" element={<ScanGrade />} />
          <Route path="/submissions" element={<ReviewQueue />} />
          <Route path="/knowledge" element={<KnowledgeBase />} />
          <Route path="/generator" element={<ExamGenerator />} />
          <Route path="/review/:id" element={<ReviewSubmission />} />
          <Route path="/verify/:id" element={<ReviewSubmission />} />

          {/* Existing student and parent portals */}
          <Route path="/student" element={<StudentPortal />} />
          <Route path="/parent" element={<ParentPortal />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;
