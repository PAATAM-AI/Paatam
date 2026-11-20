import React, { createContext, useContext, useState, useEffect } from 'react';
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
  currentUser: UserProfile;
  role: UserRole;
  branches: Branch[];
  currentBranchId: string;
  setCurrentBranchId: (id: string) => void;
  switchRole: (role: UserRole) => void;
  loginWithProfile: (profile: UserProfile, explicitBranchId?: string) => void;
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
    title: 'Senior Teacher • Hyderabad Central Campus',
    branchId: 'branch-main',
    branchName: 'Hyderabad Central Campus'
  },
  STUDENT: {
    id: 'student-204',
    name: 'Nikhil Sharma',
    email: 'student.demo@paatam.in',
    role: 'STUDENT',
    title: 'Student • Hyderabad Central Campus (Class 10-A)',
    branchId: 'branch-main',
    branchName: 'Hyderabad Central Campus',
    className: 'Class 10',
    sectionName: 'A'
  }
};

export const DEMO_CREDENTIALS: Record<UserRole, { email: string; password: string }> = {
  ADMIN: { email: 'deepak.dev@paatam.in', password: 'Paatam@123' },
  TEACHER: { email: 'mohit.dev@paatam.in', password: 'Paatam@123' },
  STUDENT: { email: 'student.demo@paatam.in', password: 'Paatam@123' }
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('paatam_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as UserProfile;
        if (parsed?.role === 'ADMIN') {
          return {
            ...DEMO_PROFILES.ADMIN,
            branchId: parsed.branchId || DEMO_PROFILES.ADMIN.branchId,
            branchName: parsed.branchName || DEMO_PROFILES.ADMIN.branchName
          };
        }
        if (parsed?.role === 'TEACHER') {
          return {
            ...DEMO_PROFILES.TEACHER,
            branchId: parsed.branchId || DEMO_PROFILES.TEACHER.branchId,
            branchName: parsed.branchName || DEMO_PROFILES.TEACHER.branchName
          };
        }
        if (parsed?.role === 'STUDENT') {
          return {
            ...DEMO_PROFILES.STUDENT,
            branchId: parsed.branchId || DEMO_PROFILES.STUDENT.branchId,
            branchName: parsed.branchName || DEMO_PROFILES.STUDENT.branchName
          };
        }
        return parsed;
      } catch (e) {}
    }
    return DEMO_PROFILES.ADMIN;
  });

  const [branches, setBranches] = useState<Branch[]>([
    { id: 'branch-main', name: 'Hyderabad Central Campus' },
    { id: 'branch-north', name: 'Bangalore North Campus' }
  ]);
  const [currentBranchId, setCurrentBranchId] = useState<string>(() => {
    return localStorage.getItem('paatam_branch_id') || 'branch-main';
  });

  // Fetch live branches from backend
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/branches`)
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.branches) && data.branches.length > 0) {
          setBranches(data.branches);
          const matchedBranch = data.branches.find((b: Branch) => b.id === currentBranchId) || data.branches[0];
          const activeId = matchedBranch.id;
          setCurrentBranchId(activeId);
          localStorage.setItem('paatam_branch_id', activeId);

          setCurrentUser(prev => {
            const updated = {
              ...prev,
              branchId: activeId,
              branchName: matchedBranch.name || prev.branchName
            };
            localStorage.setItem('paatam_user', JSON.stringify(updated));
            return updated;
          });
        }
      })
      .catch(() => {});
  }, []);

  const switchRole = (newRole: UserRole) => {
    loginWithProfile(DEMO_PROFILES[newRole]);
  };

  const loginWithProfile = (profile: UserProfile, explicitBranchId?: string) => {
    const targetBranchId = explicitBranchId || currentBranchId;
    const matchedBranch = branches.find(b => b.id === targetBranchId) || branches[0];
    const resolvedBranchId = matchedBranch ? matchedBranch.id : (targetBranchId || 'branch-main');
    const resolvedBranchName = matchedBranch ? matchedBranch.name : (profile.branchName || 'Hyderabad Central Campus');

    const resolvedProfile: UserProfile = {
      ...profile,
      branchId: resolvedBranchId,
      branchName: resolvedBranchName
    };

    setCurrentUser(resolvedProfile);
    setCurrentBranchId(resolvedBranchId);
    localStorage.setItem('paatam_user', JSON.stringify(resolvedProfile));
    localStorage.setItem('paatam_branch_id', resolvedBranchId);
  };

  const logout = () => {
    setCurrentUser(DEMO_PROFILES.ADMIN);
    localStorage.removeItem('paatam_user');
  };

  const isRole = (roles: UserRole[]) => {
    return roles.includes(currentUser.role);
  };

  const handleBranchChange = (branchId: string) => {
    setCurrentBranchId(branchId);
    localStorage.setItem('paatam_branch_id', branchId);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        role: currentUser.role,
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
