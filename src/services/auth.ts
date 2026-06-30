import {
  signInWithPopup,
  signOut,
} from "firebase/auth";

import { auth, googleProvider } from "@/lib/firebase";

export const login = async () => {
  return await signInWithPopup(auth, googleProvider);
};

export const logout = async () => {
  return await signOut(auth);
};