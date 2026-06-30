"use client";

import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "@/lib/firebase";

export default function useAuth() {
  const [user, loading, error] = useAuthState(auth);

  return {
    user,
    loading,
    error,
  };
}