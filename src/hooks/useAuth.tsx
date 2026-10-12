import {
  useEffect,
  useState,
  ReactNode,
  useRef,
} from "react";
import { ApiNetworkError, ApiRequestError, ApiService } from "@/lib/api";
import { OfflineQueueProvider } from "@/hooks/useOfflineQueue";
import { AuthContext } from "@/hooks/auth-context";
import { useNavigate } from "react-router-dom";
import {
  UserRole,
  VaultUser,
  clearOfflineVault,
  readVerifiedOfflineUser,
  storeVerifiedOfflineUser,
} from "@/lib/offlineAuthVault";

export type { UserRole };

export interface User {
  id: string;
  email: string;
  role: UserRole;
  profile?: Record<string, unknown>;
}

type LoginResponse =
  | { requires_otp: true; otp_token: string }
  | { requires_otp: false; token: string; user: User };

export interface AuthContextType {
  user: User | null;
  session: string | null;
  userRole: UserRole | null;
  loading: boolean;
  isOfflineSession: boolean;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null; needsOtp?: boolean; otpToken?: string }>;
  verifyOtp: (otpToken: string, code: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<{ error: string | null; needsOtp?: boolean; otpToken?: string }>;
  signOut: () => Promise<void>;
  role: UserRole | null;
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOfflineSession, setIsOfflineSession] = useState(false);
  const [onlineVerified, setOnlineVerified] = useState(false);
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    const initAuth = async () => {
      setOnlineVerified(false);
      try {
        const userData = await ApiService.get<User>("/auth/me");
        if (userData && userData.id) {
          setSession("active");
          setUser(userData);
          setUserRole(userData.role);
          setIsOfflineSession(false);
          setOnlineVerified(true);
          // Cryptographically seal the verified user snapshot
          await storeVerifiedOfflineUser(userData);
        } else {
          clearOfflineVault();
        }
      } catch (error) {
        const canContinueOffline =
          error instanceof ApiNetworkError ||
          (error instanceof ApiRequestError && error.status >= 500) ||
          !navigator.onLine;

        // Verify cryptographic signature of the cached user snapshot
        const cachedUser: VaultUser | null = canContinueOffline
          ? await readVerifiedOfflineUser()
          : null;

        if (cachedUser) {
          setSession("offline");
          setUser(cachedUser);
          // STRICT SECURITY ENFORCEMENT:
          // In offline mode, all sessions are strictly restricted to "cashier".
          // Administrative and managerial elevations are never permitted offline.
          setUserRole("cashier");
          setIsOfflineSession(true);
          navigateRef.current("/sales", { replace: true });
        } else {
          clearOfflineVault();
        }
      }
      setLoading(false);
    };

    void initAuth();
  }, []);

  useEffect(() => {
    if (!isOfflineSession || !user) return;
    let isChecking = false;

    const verifyWhenAvailable = async () => {
      if (isChecking || !navigator.onLine) return;
      isChecking = true;
      try {
        const verifiedUser = await ApiService.get<User>("/auth/me");
        if (verifiedUser.id !== user.id) {
          throw new ApiRequestError("The saved offline cashier no longer matches the online session.", 401);
        }
        setUser(verifiedUser);
        setUserRole(verifiedUser.role);
        setSession("active");
        setIsOfflineSession(false);
        setOnlineVerified(true);
        await storeVerifiedOfflineUser(verifiedUser);
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 401) {
          clearOfflineVault();
          setSession(null);
          setUser(null);
          setUserRole(null);
          setIsOfflineSession(false);
          setOnlineVerified(false);
          navigate("/auth", { replace: true });
        }
      } finally {
        isChecking = false;
      }
    };

    window.addEventListener("online", verifyWhenAvailable);
    const interval = window.setInterval(() => void verifyWhenAvailable(), 15_000);
    void verifyWhenAvailable();
    return () => {
      window.removeEventListener("online", verifyWhenAvailable);
      window.clearInterval(interval);
    };
  }, [isOfflineSession, navigate, user]);

  const signIn = async (email: string, password: string) => {
    try {
      const data = await ApiService.post<LoginResponse>("/auth/login", {
        email,
        password,
      });

      if (data.requires_otp === true) {
        return { error: null, needsOtp: true, otpToken: data.otp_token };
      }

      setSession("active");
      setUser(data.user);
      setUserRole(data.user.role);
      setIsOfflineSession(false);
      setOnlineVerified(true);
      await storeVerifiedOfflineUser(data.user);

      navigate("/");
      return { error: null, needsOtp: false };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Login failed" };
    }
  };

  const verifyOtp = async (otpToken: string, code: string) => {
    try {
      const data = await ApiService.post<{ token: string; user: User }>(
        "/auth/verify-otp",
        { otp_token: otpToken, code },
      );

      setSession("active");
      setUser(data.user);
      setUserRole(data.user.role);
      setIsOfflineSession(false);
      setOnlineVerified(true);
      await storeVerifiedOfflineUser(data.user);

      navigate("/");
      return { error: null };
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : "OTP verification failed",
      };
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      await ApiService.post("/auth/register", {
        email,
        password,
        full_name: fullName,
      });

      // Auto-login after registration (will trigger OTP flow)
      const data = await ApiService.post<LoginResponse>("/auth/login", {
        email,
        password,
      });

      if (data.requires_otp === true) {
        return { error: null, needsOtp: true, otpToken: data.otp_token };
      }

      setSession("active");
      setUser(data.user);
      setUserRole(data.user.role);
      setIsOfflineSession(false);
      setOnlineVerified(true);
      await storeVerifiedOfflineUser(data.user);

      navigate("/");
      return { error: null, needsOtp: false };
    } catch (error) {
      return {
        error:
          error instanceof Error ? error.message : "Registration failed",
      };
    }
  };

  const signOut = async () => {
    try {
      await ApiService.post("/auth/logout", {});
    } catch {
      // Ignore network errors during logout
    }
    clearOfflineVault();
    setSession(null);
    setUser(null);
    setUserRole(null);
    setIsOfflineSession(false);
    setOnlineVerified(false);
    navigate("/auth");
  };

  // DEFENSE IN DEPTH: Force effective role to "cashier" in offline mode
  const effectiveRole: UserRole | null = isOfflineSession ? "cashier" : userRole;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        userRole: effectiveRole,
        role: effectiveRole,
        loading,
        isOfflineSession,
        signIn,
        verifyOtp,
        signUp,
        signOut,
      }}
    >
      <OfflineQueueProvider
        userId={user?.id || null}
        onlineVerified={onlineVerified}
        offlineSession={isOfflineSession}
      >
        {children}
      </OfflineQueueProvider>
    </AuthContext.Provider>
  );
};

