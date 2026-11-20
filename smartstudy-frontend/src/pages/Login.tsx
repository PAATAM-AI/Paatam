import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Users,
  GraduationCap,
  ArrowRight,
  Lock,
  Mail,
  Zap,
  Eye,
  EyeOff,
  Check,
  Sparkles,
  Shield,
  CheckCircle2
} from 'lucide-react';
import { useAuth, type UserRole, DEMO_PROFILES, DEMO_CREDENTIALS } from '../context/AuthContext';
import paatamLogo from '../assets/paatam-logo-white-4000.png';
import './Login.css';

interface PersonaTabConfig {
  role: UserRole;
  tabLabel: string;
  icon: React.ReactNode;
  personaName: string;
  roleSubtitle: string;
  email: string;
  password: string;
  ctaText: string;
  destination: string;
  avatarClass: string;
  initials: string;
}

const PERSONA_TABS: Record<UserRole, PersonaTabConfig> = {
  ADMIN: {
    role: 'ADMIN',
    tabLabel: 'Executive Admin',
    icon: <ShieldCheck size={18} />,
    personaName: 'Dr. Deepak Kumar',
    roleSubtitle: 'Dean & Principal (Executive Admin) • Hyderabad Central Campus',
    email: DEMO_CREDENTIALS.ADMIN.email,
    password: DEMO_CREDENTIALS.ADMIN.password,
    ctaText: 'Enter Executive Desk ->',
    destination: '/campus-overview',
    avatarClass: 'admin',
    initials: 'DK'
  },
  TEACHER: {
    role: 'TEACHER',
    tabLabel: 'Teacher Desk',
    icon: <Users size={18} />,
    personaName: 'Mohit Yadav',
    roleSubtitle: 'Senior Teacher • Hyderabad Central Campus',
    email: DEMO_CREDENTIALS.TEACHER.email,
    password: DEMO_CREDENTIALS.TEACHER.password,
    ctaText: 'Enter Teacher Desk ->',
    destination: '/?tab=scan',
    avatarClass: 'teacher',
    initials: 'MY'
  },
  STUDENT: {
    role: 'STUDENT',
    tabLabel: 'Student / Parent',
    icon: <GraduationCap size={18} />,
    personaName: 'Nikhil Sharma',
    roleSubtitle: 'Student • Hyderabad Central Campus (Class 10-A)',
    email: DEMO_CREDENTIALS.STUDENT.email,
    password: DEMO_CREDENTIALS.STUDENT.password,
    ctaText: 'Enter Student Portal ->',
    destination: '/student',
    avatarClass: 'student',
    initials: 'NS'
  }
};

export default function Login() {
  const navigate = useNavigate();
  const { loginWithProfile, branches, currentBranchId } = useAuth();

  const [activeTab, setActiveTab] = useState<UserRole>('ADMIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'info'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeConfig = PERSONA_TABS[activeTab];

  // Resolve active branch name for display
  const activeBranch = branches.find(b => b.id === currentBranchId) || branches[0];
  const activeBranchName = activeBranch ? activeBranch.name : 'Hyderabad Central Campus';

  const handleTabChange = (newRole: UserRole) => {
    setActiveTab(newRole);
    setFeedbackMsg(null);
  };

  // 1. "Fill Form" populates Email Address & Password input fields
  const handleFillForm = () => {
    setEmail(activeConfig.email);
    setPassword(activeConfig.password);
    setFeedbackMsg({
      type: 'info',
      text: `Populated credentials for ${activeConfig.personaName}`
    });
  };

  // 2. "One-Click Login" immediately logs in with full persona profile and real Supabase branch ID
  const handleOneClickLogin = () => {
    setIsSubmitting(true);
    setFeedbackMsg({
      type: 'success',
      text: `Logging in as ${activeConfig.personaName}...`
    });

    // Populate fields visually
    setEmail(activeConfig.email);
    setPassword(activeConfig.password);

    // Save profile and real branch ID to AuthContext + localStorage
    const profile = DEMO_PROFILES[activeTab];
    loginWithProfile(profile);

    // Transition smoothly to destination
    setTimeout(() => {
      navigate(activeConfig.destination);
    }, 250);
  };

  // 3. Form submission also logs in seamlessly without failing on strict password/JWT checks
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Check if input email corresponds to another persona, or default to current tab persona
    const inputEmailClean = email.trim().toLowerCase();
    let targetRole: UserRole = activeTab;

    if (inputEmailClean === DEMO_CREDENTIALS.ADMIN.email.toLowerCase()) {
      targetRole = 'ADMIN';
    } else if (inputEmailClean === DEMO_CREDENTIALS.TEACHER.email.toLowerCase()) {
      targetRole = 'TEACHER';
    } else if (inputEmailClean === DEMO_CREDENTIALS.STUDENT.email.toLowerCase()) {
      targetRole = 'STUDENT';
    }

    const baseProfile = DEMO_PROFILES[targetRole];
    const userProfile = {
      ...baseProfile,
      email: email.trim() || baseProfile.email
    };

    loginWithProfile(userProfile);

    const destination = PERSONA_TABS[targetRole].destination;
    setTimeout(() => {
      navigate(destination);
    }, 250);
  };

  return (
    <main className="paatam-login-root">
      <div className="paatam-login-ambient-grid" aria-hidden="true" />

      <div className="paatam-login-container">
        {/* Brand Header */}
        <header className="paatam-login-header">
          <div className="paatam-login-brand-badge">
            <img src={paatamLogo} alt="Paatam AI" className="paatam-login-logo-img" />
            <div>
              <h1 className="paatam-login-brand-title">PAATAM.AI</h1>
              <span className="paatam-login-subtitle-tag">AI LEARNING INTELLIGENCE</span>
            </div>
          </div>
          <p className="paatam-login-tagline">
            Institutional Demo Single Sign-On • Multi-Role Autonomous Learning Engine
          </p>
        </header>

        {/* Centered Login Card */}
        <section className="paatam-login-card" aria-label="Demo Persona Login">
          {/* 3 Role Tabs */}
          <div className="paatam-role-tabs" role="tablist" aria-label="Select Role">
            {(['ADMIN', 'TEACHER', 'STUDENT'] as UserRole[]).map((roleKey) => {
              const tab = PERSONA_TABS[roleKey];
              const isActive = activeTab === roleKey;
              return (
                <button
                  key={roleKey}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`paatam-role-tab-btn ${isActive ? 'active' : ''}`}
                  onClick={() => handleTabChange(roleKey)}
                >
                  <span className="paatam-tab-icon">{tab.icon}</span>
                  <span className="paatam-tab-label">{tab.tabLabel}</span>
                </button>
              );
            })}
          </div>

          {/* Feedback banner */}
          {feedbackMsg && (
            <div className={`paatam-feedback-banner ${feedbackMsg.type}`} role="status">
              <CheckCircle2 size={16} />
              <span>{feedbackMsg.text}</span>
            </div>
          )}

          {/* Highlighted DEMO CREDENTIALS QUICK-FILL Card */}
          <div className="paatam-quickfill-card">
            <div className="paatam-quickfill-header">
              <div className="paatam-quickfill-badge">
                <Sparkles size={13} />
                <span>DEMO CREDENTIALS QUICK-FILL</span>
              </div>
              <span className="paatam-status-dot" title="Live Supabase Branch Connected" />
            </div>

            <div className="paatam-persona-identity">
              <div className={`paatam-persona-avatar ${activeConfig.avatarClass}`}>
                {activeConfig.initials}
              </div>
              <div className="paatam-persona-meta">
                <h3 className="paatam-persona-name">{activeConfig.personaName}</h3>
                <p className="paatam-persona-subtitle">{activeConfig.roleSubtitle}</p>
              </div>
            </div>

            {/* Email & Password Preview */}
            <div className="paatam-credential-preview-box">
              <div className="paatam-cred-row">
                <span className="paatam-cred-label">Email:</span>
                <span className="paatam-cred-value">{activeConfig.email}</span>
              </div>
              <div className="paatam-cred-row">
                <span className="paatam-cred-label">Password:</span>
                <span className="paatam-cred-value">{activeConfig.password}</span>
              </div>
            </div>

            {/* Quick-Fill Action Buttons */}
            <div className="paatam-quickfill-actions">
              <button
                type="button"
                className="paatam-btn-fill"
                onClick={handleFillForm}
              >
                <Check size={15} />
                <span>Fill Form</span>
              </button>

              <button
                type="button"
                className="paatam-btn-oneclick"
                onClick={handleOneClickLogin}
                disabled={isSubmitting}
              >
                <Zap size={15} />
                <span>One-Click Login</span>
              </button>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleFormSubmit} className="paatam-login-form">
            <div className="paatam-form-group">
              <label htmlFor="login-email" className="paatam-form-label">
                Email Address
              </label>
              <div className="paatam-input-wrapper">
                <Mail size={16} className="paatam-input-icon" />
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="username"
                  placeholder={activeConfig.email}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="paatam-input-field"
                />
              </div>
            </div>

            <div className="paatam-form-group">
              <label htmlFor="login-password" className="paatam-form-label">
                Password
              </label>
              <div className="paatam-input-wrapper">
                <Lock size={16} className="paatam-input-icon" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="paatam-input-field"
                />
                <button
                  type="button"
                  className="paatam-toggle-password"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Dynamic CTA button */}
            <button
              type="submit"
              className="paatam-cta-button"
              disabled={isSubmitting}
            >
              <span>{isSubmitting ? 'Accessing Desk...' : activeConfig.ctaText}</span>
              <ArrowRight size={17} className="paatam-cta-arrow" />
            </button>
          </form>

          {/* Security & System Info Footer */}
          <footer className="paatam-login-footer">
            <span className="paatam-footer-item">
              <Lock size={12} />
              <span>256-Bit SSL Encrypted</span>
            </span>
            <span className="paatam-footer-dot" aria-hidden="true">•</span>
            <span className="paatam-footer-item">
              <Shield size={12} />
              <span>RBAC Active</span>
            </span>
            <span className="paatam-footer-dot" aria-hidden="true">•</span>
            <span className="paatam-footer-item">
              <span>Branch: {activeBranchName}</span>
            </span>
          </footer>
        </section>
      </div>
    </main>
  );
}
