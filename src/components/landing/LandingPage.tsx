"use client";

import { Button } from "@/components/ui/button";
import { ArrowRight, Clock3, BrainCircuit } from "lucide-react";
import LoginButton from "@/components/auth/LoginButton";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <section className="mx-auto flex max-w-7xl flex-col items-center justify-center px-6 py-28 text-center">

        <div className="mb-4 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 text-sm text-indigo-300">
          AI Productivity Companion
        </div>

        <h1 className="max-w-4xl text-6xl font-bold leading-tight">
          Never Miss Another
          <span className="text-indigo-400"> Deadline.</span>
        </h1>

        <p className="mt-6 max-w-2xl text-lg text-slate-300">
          Deadline Guardian AI helps you prioritize, plan and complete
          important tasks before time runs out.
        </p>

        <div className="mt-10">
            <LoginButton />
        </div>

        <div className="mt-24 grid gap-8 md:grid-cols-3">

          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <Clock3 className="mb-4 text-indigo-400" size={32} />
            <h3 className="mb-2 text-xl font-semibold">
              Smart Scheduling
            </h3>

            <p className="text-slate-400">
              Automatically organize your day around deadlines.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <BrainCircuit className="mb-4 text-indigo-400" size={32} />
            <h3 className="mb-2 text-xl font-semibold">
              AI Planning
            </h3>

            <p className="text-slate-400">
              Gemini generates personalized execution plans.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <ArrowRight className="mb-4 text-indigo-400" size={32} />
            <h3 className="mb-2 text-xl font-semibold">
              Rescue Mode
            </h3>

            <p className="text-slate-400">
              Get an instant recovery plan when deadlines get close.
            </p>
          </div>

        </div>

      </section>
    </main>
  );
}