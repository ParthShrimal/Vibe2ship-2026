"use client";

import { GoogleAuthProvider, signInWithPopup, Auth } from "firebase/auth";

// Cache the access token in memory
let cachedCalendarToken: string | null = null;

export function getCalendarToken(): string | null {
  return cachedCalendarToken;
}

export function setCalendarToken(token: string | null) {
  cachedCalendarToken = token;
  if (token) {
    localStorage.setItem("google_calendar_linked", "true");
  } else {
    localStorage.removeItem("google_calendar_linked");
  }
}

export function hasLinkedCalendar(): boolean {
  return localStorage.getItem("google_calendar_linked") === "true";
}

export async function authorizeCalendar(auth: Auth): Promise<string> {
  const provider = new GoogleAuthProvider();
  provider.addScope("https://www.googleapis.com/auth/calendar.events");
  provider.addScope("https://www.googleapis.com/auth/calendar");

  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const token = credential?.accessToken;

  if (!token) {
    throw new Error("Failed to acquire access token from Google");
  }

  setCalendarToken(token);
  return token;
}

export function unlinkCalendar() {
  setCalendarToken(null);
}
