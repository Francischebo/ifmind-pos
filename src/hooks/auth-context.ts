import { createContext } from "react";
import type { AuthContextType } from "@/hooks/useAuth";

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
