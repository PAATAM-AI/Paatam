import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../config/api';

export type UserRole = 'ADMIN' | 'TEACHER' | 'STUDENT';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  title: string;
  branchId?: string;
  branchName?: string;
  classId?: string;
  className?: string;
  sectionName?: string;
}

export interface Branch {
  id: string;
  corporate_id?: string;
  name: string;
  pincode?: string;
  address?: string;
  branch_contact_mail?: string;
  mobile_number?: string;
}

interface AuthContextType {
  currentUser: UserProfile | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  branches: Branch[];
  currentBranchId: string;
  setCurrentBranchId: (id: string) => void;
  switchRole: (role: UserRole) => void;
  loginWithProfile: (profile: UserProfile) => void;
  isRole: (roles: UserRole[]) => boolean;
  logout: () => void;
}

// Pre-configured Personas for instant demo switching
export const DEMO_PROFILES: Record<UserRole, UserProfile> = {
  ADMIN: {
    id: 'admin-dean-1',
    name: 'Dr. Deepak Kumar',
    email: 'deepak.dev@paatam.in',
    role: 'ADMIN',
    title: 'Dean & Principal (Executive Admin)',
    branchId: 'branch-main',
    branchName: 'Hyderabad Central Campus'
  },
  TEACHER: {
    id: 'teacher-101',
    name: 'Mohit Yadav',
    email: 'mohit.dev@paatam.in',
    role: 'TEACHER',
    title: 'Teacher',
    branchId: 'branch-main',
    branchName: 'Hyderabad Central Campus'
  },
  STUDENT: {
    id: 'student-204',
    name: 'Aarav Patel',
    email: 'aarav.patel@student.paatam.edu',
    role: 'STUDENT',
    title: 'Grade 10 - Section A (Roll: 14)',
    branchId: 'branch-main',
    branchName: 'Hyderabad Central Campus',
    className: 'Grade 10',
    sectionName: 'A'
  }
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Always start logged out so opening the app never auto-enters a dashboard from localStorage.
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  const [branches, setBranches] = useState<Branch[]>([
    { id: 'branch-main', name: 'Hyderabad Central Campus' },
    { id: 'branch-north', name: 'Bangalore North Campus' }
  ]);
  const [currentBranchId, setCurrentBranchId] = useState<string>(() => {
    return localStorage.getItem('paatam_branch_id') || 'branch-main';
  });

  useEffect(() => {
    // Clear any previously persisted user session so stale localStorage entries never trigger auto-login.
    localStorage.removeItem('paatam_user');
  }, []);

  // Fetch live branches from backend
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/branches`)
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.branches) && data.branches.length > 0) {
          setBranches(data.branches);
          if (!data.branches.some((b: Branch) => b.id === currentBranchId)) {
            setCurrentBranchId(data.branches[0].id);
          }
        }
      })
      .catch(() => {});
  }, []);

  const switchRole = (newRole: UserRole) => {
    setCurrentUser(DEMO_PROFILES[newRole]);
  };

  const loginWithProfile = (profile: UserProfile) => {
    setCurrentUser(profile);
  };

  const logout = useCallback(() => {
    setCurrentUser(null);
    localStorage.removeItem('paatam_user');
  }, []);

  const isRole = (roles: UserRole[]) => {
    return currentUser ? roles.includes(currentUser.role) : false;
  };

  const handleBranchChange = (branchId: string) => {
    setCurrentBranchId(branchId);
    localStorage.setItem('paatam_branch_id', branchId);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        role: currentUser?.role ?? null,
        isAuthenticated: Boolean(currentUser),
        branches,
        currentBranchId,
        setCurrentBranchId: handleBranchChange,
        switchRole,
        loginWithProfile,
        isRole,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
