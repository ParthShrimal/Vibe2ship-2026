"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import { useTasks } from "@/context/TaskContext";
import { useTimer } from "@/context/TimerContext";
import { formatDate } from "@/lib/date";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Clock, Award, Target, HelpCircle, Activity } from "lucide-react";

export default function History() {
  const { tasks } = useTasks();
  const { analytics } = useTimer();
  const [chartType, setChartType] = React.useState<"focus" | "completed">("focus");

  const completed = tasks.filter((task: any) => task.status === "completed");
  const missed = tasks.filter((task: any) => task.status === "missed");
  const total = tasks.length;

  const completionRate =
    total === 0 ? 0 : Math.round((completed.length / total) * 100);

  // Compute Pomodoro focus session analytics
  const focusSessions = analytics || [];
  const completedFocusSessions = focusSessions.filter((s: any) => !s.interrupted);
  const interruptedFocusSessions = focusSessions.filter((s: any) => s.interrupted);

  const totalFocusSeconds = focusSessions.reduce((acc: number, curr: any) => acc + (curr.durationSeconds || 0), 0);
  const totalFocusMinutes = Math.round(totalFocusSeconds / 60);

  const avgSessionLength = focusSessions.length > 0
    ? Math.round((totalFocusSeconds / focusSessions.length) / 60)
    : 0;

  // Generate 7-day historical focus minutes chart
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
    return { dateStr, dayName, focusMinutes: 0 };
  }).reverse();

  focusSessions.forEach((session: any) => {
    const match = last7Days.find(day => day.dateStr === session.dateString);
    if (match) {
      const min = Math.round((session.durationSeconds || 0) / 60);
      match.focusMinutes += min;
    }
  });

  // Generate 7-day historical tasks completed chart
  const completedTasksData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
    return { dateStr, dayName, completedCount: 0 };
  }).reverse();

  completed.forEach((task: any) => {
    const rawDate = task.completedAt || task.createdAt;
    if (rawDate) {
      try {
        const compDate = typeof rawDate.toDate === "function" ? rawDate.toDate() : new Date(rawDate);
        if (!isNaN(compDate.getTime())) {
          const compDateStr = `${compDate.getFullYear()}-${String(compDate.getMonth() + 1).padStart(2, "0")}-${String(compDate.getDate()).padStart(2, "0")}`;
          const match = completedTasksData.find(day => day.dateStr === compDateStr);
          if (match) {
            match.completedCount += 1;
          }
        }
      } catch (err) {
        console.error("Error parsing completed date", err);
      }
    }
  });

  return (
    <main className="min-h-screen bg-background p-8 text-foreground transition-colors duration-300">
      <div className="mx-auto max-w-6xl space-y-8">
        <h1 className="text-4xl font-bold text-foreground">
          📜 Performance History
        </h1>

        {/* Productivity Summary banner card */}
        <Card className="rounded-3xl bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 p-8 text-white shadow-xl">
          <h2 className="text-3xl font-bold">📈 Task Productivity Summary</h2>
          <p className="mt-4 text-lg text-white/90">
            You completed{" "}
            <span className="font-bold underline decoration-cyan-300 decoration-2">{completed.length}</span> task
            {completed.length !== 1 && "s"} and missed{" "}
            <span className="font-bold underline decoration-red-400 decoration-2">{missed.length}</span> task
            {missed.length !== 1 && "s"}.
          </p>

          <div className="mt-6 h-3 overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-white transition-all duration-500"
              style={{
                width: `${completionRate}%`,
              }}
            />
          </div>

          <p className="mt-4 text-sm text-white/80">
            Success Rate: <strong>{completionRate}%</strong>. Keep your rate above 80% to protect deadlines perfectly!
          </p>
        </Card>

        {/* Task Metrics Grid */}
        <div className="grid gap-6 grid-cols-2 md:grid-cols-4">
          <Card className="rounded-3xl border border-border bg-card p-6 shadow-lg transition-all duration-300 hover:shadow-xl">
            <p className="text-sm font-semibold uppercase text-muted-foreground">Total Tasks</p>
            <h2 className="mt-2 text-4xl font-bold text-foreground">{total}</h2>
          </Card>

          <Card className="rounded-3xl border border-border bg-card p-6 shadow-lg transition-all duration-300 hover:shadow-xl">
            <p className="text-sm font-semibold uppercase text-emerald-500">Completed</p>
            <h2 className="mt-2 text-4xl font-bold text-emerald-600 dark:text-emerald-500">{completed.length}</h2>
          </Card>

          <Card className="rounded-3xl border border-border bg-card p-6 shadow-lg transition-all duration-300 hover:shadow-xl">
            <p className="text-sm font-semibold uppercase text-red-500">Missed</p>
            <h2 className="mt-2 text-4xl font-bold text-red-600 dark:text-red-400">{missed.length}</h2>
          </Card>

          <Card className="rounded-3xl border border-border bg-card p-6 shadow-lg transition-all duration-300 hover:shadow-xl">
            <p className="text-sm font-semibold uppercase text-indigo-500">Success Rate</p>
            <h2 className="mt-2 text-4xl font-bold text-indigo-600 dark:text-indigo-400">{completionRate}%</h2>
          </Card>
        </div>

        {/* Pomodoro Timer Analytics Section (Feature 21) */}
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="rounded-3xl border border-border bg-card p-6 shadow-lg md:col-span-1 space-y-6">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Clock className="text-indigo-500" size={20} />
              Focus Metrics
            </h2>

            <div className="space-y-4">
              <div className="flex justify-between items-center bg-muted/30 p-3 rounded-xl border border-border/40">
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  <Activity size={13} className="text-emerald-500" /> Total Work Time
                </span>
                <span className="font-bold text-foreground text-sm">{totalFocusMinutes} mins</span>
              </div>

              <div className="flex justify-between items-center bg-muted/30 p-3 rounded-xl border border-border/40">
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  <Award size={13} className="text-yellow-500" /> Completed Blocks
                </span>
                <span className="font-bold text-foreground text-sm">{completedFocusSessions.length} sessions</span>
              </div>

              <div className="flex justify-between items-center bg-muted/30 p-3 rounded-xl border border-border/40">
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  <Target size={13} className="text-red-500" /> Interrupted Blocks
                </span>
                <span className="font-bold text-foreground text-sm">{interruptedFocusSessions.length} sessions</span>
              </div>

              <div className="flex justify-between items-center bg-muted/30 p-3 rounded-xl border border-border/40">
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  <Clock size={13} className="text-blue-500" /> Avg Session Duration
                </span>
                <span className="font-bold text-foreground text-sm">{avgSessionLength} mins</span>
              </div>
            </div>
          </Card>

          {/* Bar Chart representing focus tracking & task completions */}
          <Card className="rounded-3xl border border-border bg-card p-6 shadow-lg md:col-span-2 flex flex-col justify-between">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <h2 className="text-xl font-bold text-foreground">
                {chartType === "focus" ? "⏱ Focus Time Last 7 Days (Mins)" : "✅ Tasks Completed Last 7 Days"}
              </h2>
              <div className="flex bg-muted/80 p-1 rounded-xl border border-border/40 self-start sm:self-auto shadow-inner">
                <button
                  onClick={() => setChartType("focus")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    chartType === "focus"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Focus Time
                </button>
                <button
                  onClick={() => setChartType("completed")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    chartType === "completed"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Completed Tasks
                </button>
              </div>
            </div>

            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartType === "focus" ? last7Days : completedTasksData}>
                  <XAxis dataKey="dayName" stroke="#888888" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={11} tickLine={false} axisLine={false} width={25} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card, #1e293b)",
                      borderColor: "var(--border, #334155)",
                      borderRadius: "12px",
                      color: "var(--foreground, #ffffff)",
                      fontFamily: "monospace",
                      fontSize: "12px",
                    }}
                    labelStyle={{
                      color: "var(--foreground, #ffffff)",
                      fontWeight: "bold",
                    }}
                    itemStyle={{
                      color: chartType === "focus" ? "#818cf8" : "#34d399",
                    }}
                    cursor={{ fill: "rgba(99, 102, 241, 0.05)" }}
                  />
                  <Bar dataKey={chartType === "focus" ? "focusMinutes" : "completedCount"} radius={[4, 4, 0, 0]}>
                    {(chartType === "focus" ? last7Days : completedTasksData).map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={chartType === "focus" ? "#4f46e5" : "#10b981"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Completed & Missed Lists layout */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Completed */}
          <Card className="rounded-3xl border border-border bg-card p-6 shadow-lg transition-colors duration-300">
            <h2 className="mb-6 text-2xl font-bold text-emerald-600 dark:text-emerald-500">
              ✅ Completed Tasks
            </h2>

            {completed.length === 0 ? (
              <p className="text-muted-foreground text-center py-6">No completed tasks yet.</p>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
                {completed.map((task: any) => (
                  <div
                    key={task.id}
                    className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm dark:border-emerald-950 dark:bg-emerald-950/20"
                  >
                    <h3 className="text-lg font-semibold text-foreground">{task.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1">Deadline: {formatDate(task.deadline)}</p>
                    <p className="text-emerald-600 font-medium text-xs mt-2 flex items-center gap-1">
                      <span>✔ Completed At: {new Date(task.completedAt || task.createdAt).toLocaleDateString()}</span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Missed */}
          <Card className="rounded-3xl border border-border bg-card p-6 shadow-lg transition-colors duration-300">
            <h2 className="mb-6 text-2xl font-bold text-red-600 dark:text-red-400">
              ❌ Missed Tasks
            </h2>

            {missed.length === 0 ? (
              <p className="text-muted-foreground text-center py-6">No missed tasks. Keep it up!</p>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
                {missed.map((task: any) => (
                  <div
                    key={task.id}
                    className="rounded-2xl border border-red-200 bg-red-50/50 p-4 shadow-sm dark:border-red-950 dark:bg-red-950/20"
                  >
                    <h3 className="text-lg font-semibold text-foreground">{task.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1">Deadline: {formatDate(task.deadline)}</p>
                    <p className="text-red-600 dark:text-red-400 font-medium text-xs mt-2 flex items-center gap-1">
                      <span>✖ Missed</span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}
