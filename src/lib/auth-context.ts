import { createContext, useContext } from "react";
import type { User } from "firebase/auth";

// Firebase auth is observed once at the application root. Keeping this state in
// context prevents every route shell from registering its own auth listener.
export const AuthUserContext = createContext<User | null>(null);

export function useAuthUser() {
  return useContext(AuthUserContext);
}
