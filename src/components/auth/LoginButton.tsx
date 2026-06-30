"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { ArrowRight, Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function LoginButton() {
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    try {
      setLoading(true);

      const provider = new GoogleAuthProvider();

      const result = await signInWithPopup(auth, provider);

      toast.success("Welcome to Deadline Guardian AI!");
    } catch (err: any) {
      const isPopupClosed = err.code === "auth/popup-closed-by-user" || err.message?.includes("popup-closed-by-user") || err.code === "auth/cancelled-popup-request" || err.message?.includes("cancelled-popup-request");
      if (!isPopupClosed) {
        console.error(err);
      } else {
        console.warn("Sign-in popup closed by user.");
      }
      if (isPopupClosed) {
        toast.info("The sign-in popup was closed before completion. Please try again.");
      } else if (err.code === "auth/network-request-failed" || err.message?.includes("network-request-failed")) {
        toast.error("Network connection to auth servers failed. If you have an Ad-Blocker, Brave Shields, or privacy extensions enabled, please temporarily disable them or click 'Open App in New Tab' to sign in successfully.", {
          duration: 10000,
        });
      } else if (err.code === "auth/unauthorized-domain" || err.message?.includes("unauthorized-domain")) {
        toast.error(
          <div className="flex flex-col gap-2 p-1 text-sm text-left">
            <span className="font-bold text-red-500">Firebase Unauthorized Domain Error</span>
            <span>
              Google Sign-In popups are blocked by modern browsers when run inside nested iframes (like the AI Studio Live Preview).
            </span>
            <span className="font-semibold text-indigo-600 dark:text-indigo-400">
              👉 Please click the "Open in New Tab" button in the top-right corner of the AI Studio window and sign in from there!
            </span>
            <span className="text-xs text-muted-foreground mt-1">
              Also make sure "ais-dev-zibfddjgq6ybedntgueomy-118826210790.asia-southeast1.run.app" is listed in your Firebase Auth &rarr; Settings &rarr; Authorized Domains list.
            </span>
          </div>,
          { duration: 15000 }
        );
      } else {
        toast.error("Sign-in failed: " + (err.message || "Please check your network and try again."));
      }
      setLoading(false);
    }
  }

  return (
    <Button
      size="lg"
      onClick={handleLogin}
      disabled={loading}
      className="
      group
      relative
      overflow-hidden
      rounded-xl
      bg-indigo-600
      px-8
      py-6
      text-lg
      transition-all
      duration-300
      hover:scale-105
      hover:bg-indigo-500
      active:scale-95
      "
    >
      <span
        className="
        absolute
        inset-0
        -translate-x-full
        bg-white/20
        transition-transform
        duration-700
        group-hover:translate-x-full
        "
      />

      <span className="relative flex items-center gap-3">
        {/* Elegant Google 'G' icon rendered in pure custom inline SVG */}
        <svg className="h-5 w-5 mr-0.5" viewBox="0 0 24 24" fill="none">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.23-.63-.35-1.3-.35-2.09s.12-1.46.35-2.09H5.84z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            fill="#EA4335"
          />
        </svg>

        {loading ? "Signing in..." : "Continue with Google"}

        <ArrowRight
          size={18}
          className="
          transition-transform
          duration-300
          group-hover:translate-x-1
          "
        />
      </span>
    </Button>
  );
}
