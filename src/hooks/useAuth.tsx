import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { ApiService } from '@/lib/api';
import { useNavigate } from 'react-router-dom';

export interface User {
  id: string;
  email: string;
  role: 'admin' | 'cashier';
  profile?: any;
}

interface AuthContextType {
  user: User | null;
  session: string | null;
  userRole: 'admin' | 'cashier' | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any, needsOtp?: boolean, otpToken?: string }>;
  verifyOtp: (otpToken: string, code: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: any, needsOtp?: boolean, otpToken?: string }>;
  signOut: () => Promise<void>;
  role: 'admin' | 'cashier' | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'cashier' | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('jwt_token');
      if (token) {
        try {
          const userData = await ApiService.get<User>('/auth/me');
          if (userData) {
            setSession(token);
            setUser(userData);
            setUserRole(userData.role);
          } else {
            localStorage.removeItem('jwt_token');
          }
        } catch (error) {
          console.error("Failed to restore session", error);
          localStorage.removeItem('jwt_token');
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const data = await ApiService.post<any>('/auth/login', { email, password });
      
      if (data.requires_otp) {
        return { error: null, needsOtp: true, otpToken: data.otp_token };
      }

      localStorage.setItem('jwt_token', data.token);
      setSession(data.token);
      setUser(data.user);
      setUserRole(data.user.role);
      
      navigate('/');
      return { error: null, needsOtp: false };
    } catch (error: any) {
      return { error: error.message || "Login failed" };
    }
  };

  const verifyOtp = async (otpToken: string, code: string) => {
    try {
      const data = await ApiService.post<{ token: string, user: User }>('/auth/verify-otp', { otp_token: otpToken, code });
      
      localStorage.setItem('jwt_token', data.token);
      setSession(data.token);
      setUser(data.user);
      setUserRole(data.user.role);
      
      navigate('/');
      return { error: null };
    } catch (error: any) {
      return { error: error.message || "OTP verification failed" };
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      await ApiService.post('/auth/register', { email, password, full_name: fullName });
      
      // Auto-login after registration (will trigger OTP flow)
      const data = await ApiService.post<any>('/auth/login', { email, password });
      
      if (data.requires_otp) {
        return { error: null, needsOtp: true, otpToken: data.otp_token };
      }

      localStorage.setItem('jwt_token', data.token);
      setSession(data.token);
      setUser(data.user);
      setUserRole(data.user.role);
      
      navigate('/');
      return { error: null, needsOtp: false };
    } catch (error: any) {
      return { error: error.message || "Registration failed" };
    }
  };

  const signOut = async () => {
    localStorage.removeItem('jwt_token');
    setSession(null);
    setUser(null);
    setUserRole(null);
    navigate('/auth');
  };

  return (
    <AuthContext.Provider value={{ user, session, userRole, role: userRole, loading, signIn, verifyOtp, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
