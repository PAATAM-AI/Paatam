import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Users,
  GraduationCap,
  Crown,
  ArrowRight,
  Lock,
  Mail,
  Link2,
  Building2,
  Shield
} from 'lucide-react';
import { useAuth, type UserRole, DEMO_PROFILES } from '../context/AuthContext';
import paatamLogo from '../assets/paatam-logo-white-4000.png';

const MOCK_LOGIN_CREDENTIALS: Record<UserRole, { email: string; password: string }> = {
  ADMIN: { email: 'deepak.dev@paatam.in', password: 'Paatam@123' },
  TEACHER: { email: 'mohit.dev@paatam.in', password: 'Paatam@123' },
  STUDENT: { email: 'student.demo@paatam.in', password: 'Paatam@123' }
};

export default function LoginPage() {
  const navigate = useNavigate();
  const { loginWithProfile } = useAuth();

  const [desk, setDesk] = useState<UserRole>('ADMIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleCustomLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setIsLoading(true);
    setErrorMsg('');

    const creds = MOCK_LOGIN_CREDENTIALS[desk];
    const isValidEmail = email.trim().toLowerCase() === creds.email.toLowerCase();
    const isValidPassword = password === creds.password;

    if (!isValidEmail || !isValidPassword) {
      setErrorMsg('Invalid email or password for the selected desk.');
      setIsLoading(false);
      return;
    }

    const roleForDesk = desk === 'ADMIN' ? 'ADMIN' : desk === 'TEACHER' ? 'TEACHER' : 'STUDENT';
    loginWithProfile(DEMO_PROFILES[roleForDesk]);
    const landingPath = roleForDesk === 'ADMIN' ? '/campus-overview' : roleForDesk === 'TEACHER' ? '/' : '/student';

    setTimeout(() => {
      navigate(landingPath);
      setIsLoading(false);
    }, 350);
  };

  return (
    <main className="sso-page">
      <div className="sso-content">
        <header className="sso-heading">
          <div className="sso-brand">
            <img src={paatamLogo} alt="PAATAM logo" />
            <span>PAATAM.AI</span>
          </div>
          <h1>Enterprise Academic Single Sign-On</h1>
          <p>Intelligent School Management, Curriculum RAG &amp; Automated OCR Grading</p>
        </header>

        <section className="sso-card" aria-label="Institutional sign in">
          <div className="sso-desk-label">SELECT INSTITUTIONAL DESK</div>
          <div className="sso-desks" role="group" aria-label="Institutional desk">
            <button type="button" className={desk === 'ADMIN' ? 'selected' : ''} aria-pressed={desk === 'ADMIN'} onClick={() => { setDesk('ADMIN'); setErrorMsg(''); }}>
              <ShieldCheck size={17} /><span>Admin / Dean</span>
            </button>
            <button type="button" className={desk === 'TEACHER' ? 'selected' : ''} aria-pressed={desk === 'TEACHER'} onClick={() => { setDesk('TEACHER'); setErrorMsg(''); }}>
              <Users size={17} /><span>Teacher</span>
            </button>
            <button type="button" className={desk === 'STUDENT' ? 'selected' : ''} aria-pressed={desk === 'STUDENT'} onClick={() => { setDesk('STUDENT'); setErrorMsg(''); }}>
              <GraduationCap size={17} /><span>Student</span>
            </button>
            <button type="button" disabled title="Corporate sign-in is not available yet">
              <Crown size={17} /><span>Corporate</span>
            </button>
          </div>

          {errorMsg && <p className="sso-error" role="alert">{errorMsg}</p>}
          <form onSubmit={handleCustomLogin} className="sso-form">
            <div className="sso-field">
              <label htmlFor="sso-email">{desk === 'ADMIN' ? 'Administrator' : desk === 'TEACHER' ? 'Teacher' : 'Student'} Email or Username</label>
              <div className="sso-input">
                <Mail size={17} />
                <input id="sso-email" type="email" autoComplete="username" required placeholder="e.g. name@school.edu" value={email} onChange={(event) => setEmail(event.target.value)} />
              </div>
            </div>
            <div className="sso-field">
              <div className="sso-password-label">
                <label htmlFor="sso-password">Password</label>
                <button type="button" className="sso-text-button" onClick={() => setErrorMsg('Password recovery is unavailable for demo accounts.')}>Forgot password?</button>
              </div>
              <div className="sso-input">
                <Lock size={17} />
                <input id="sso-password" type="password" autoComplete="current-password" required placeholder="Enter password" value={password} onChange={(event) => setPassword(event.target.value)} />
              </div>
            </div>
            <button type="submit" className="sso-submit" disabled={isLoading}>
              <Link2 size={18} /><span>{isLoading ? 'Signing in...' : 'Sign In'}</span><ArrowRight size={17} />
            </button>
          </form>
          <button type="button" className="sso-register" onClick={() => setErrorMsg('Registration is unavailable in this demo.')}>
            <Building2 size={14} /><span>Register New Educational Group</span>
          </button>
        </section>

        <footer className="sso-footer">
          <span><Lock size={12} />256-Bit SSL Encrypted</span>
          <span aria-hidden="true">&bull;</span>
          <span><Shield size={12} />Institutional RBAC</span>
          <span aria-hidden="true">&bull;</span>
          <span>SOC-2 Cloud</span>
        </footer>
      </div>
    </main>
  );
}
