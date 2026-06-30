"use client";

import React, { useState } from "react";
import { Play, Pause, RotateCcw, Volume2, VolumeX, Square, SkipForward, Flame, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTimer } from "@/context/TimerContext";
import { useTasks } from "@/context/TaskContext";

export default function TimerCard() {
  const { tasks } = useTasks();
  const {
    timerState,
    isMuted,
    startTimer,
    pauseTimer,
    resumeTimer,
    stopTimer,
    restartTimer,
    toggleMute,
    skipBreak,
    adjustFocusDuration,
  } = useTimer();

  const [localTaskId, setLocalTaskId] = useState("");

  const activeTasks = tasks.filter((t: any) => t.status === "active");
  const selectedTask = tasks.find((t: any) => t.id === timerState.taskId);

  // Compute total duration depending on mode
  const totalDuration =
    timerState.mode === "focus"
      ? (timerState.focusDurationSeconds || 1500)
      : timerState.mode === "shortBreak"
      ? 300
      : 900;

  const percentage = (timerState.remainingSeconds / totalDuration) * 100;
  // Circular ring variables
  const radius = 40;
  const stroke = 6;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const minutes = Math.floor(timerState.remainingSeconds / 60);
  const seconds = timerState.remainingSeconds % 60;
  const displayTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  function handleStart() {
    const targetId = timerState.taskId || localTaskId;
    if (!targetId) {
      alert("Please select a task to focus on first!");
      return;
    }
    const taskObj = tasks.find((t: any) => t.id === targetId);
    startTimer(targetId, taskObj?.title || "Focus block");
  }

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-lg transition-all duration-300 hover:shadow-xl text-foreground">
      <div className="flex items-center justify-between border-b border-border pb-4 mb-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            ⏱ Smart Task Timer
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Synchronized Pomodoro System
          </p>
        </div>

        <button
          onClick={toggleMute}
          className="p-1.5 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground"
          title={isMuted ? "Unmute Timer" : "Mute Timer"}
        >
          {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
      </div>

      <div className="flex flex-col md:flex-row items-center gap-6">
        {/* SVG Circular Ring Indicator */}
        <div className="relative flex items-center justify-center">
          <svg
            height={radius * 2}
            width={radius * 2}
            className="transform -rotate-90"
          >
            <circle
              stroke="var(--border)"
              fill="transparent"
              strokeWidth={stroke}
              r={normalizedRadius}
              cx={radius}
              cy={radius}
            />
            <circle
              stroke={timerState.mode === "focus" ? "var(--color-indigo-600)" : "var(--color-emerald-500)"}
              fill="transparent"
              strokeWidth={stroke}
              strokeDasharray={circumference + " " + circumference}
              style={{ strokeDashoffset }}
              strokeLinecap="round"
              r={normalizedRadius}
              cx={radius}
              cy={radius}
              className="transition-all duration-1000"
            />
          </svg>
          <div className="absolute flex flex-col items-center">
            <span className="text-xl font-bold font-mono tracking-tight">{displayTime}</span>
            <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider mt-0.5">
              {timerState.mode === "focus" ? "Focus" : "Break"}
            </span>
          </div>
        </div>

        {/* Focus task metadata & selectors */}
        <div className="flex-1 space-y-3.5 w-full">
          {timerState.taskId ? (
            <div className="rounded-xl bg-muted/40 border border-border/60 p-3">
              <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Active Focus Target</span>
              <h4 className="font-semibold text-sm text-foreground mt-0.5 line-clamp-1">{selectedTask?.title || timerState.taskTitle}</h4>
              <p className="text-xs text-muted-foreground mt-0.5">Estimated Hours: {selectedTask?.estimatedHours || 1} hrs</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Select a Task to Focus on</label>
              <select
                className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                value={localTaskId}
                onChange={(e) => setLocalTaskId(e.target.value)}
              >
                <option value="">-- Choose Target Task --</option>
                {activeTasks.map((t: any) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {timerState.status === "stopped" && timerState.mode === "focus" && (
            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-semibold text-muted-foreground">Adjust Focus Timer</label>
              <div className="flex gap-1.5 flex-wrap">
                {[15, 25, 30, 45, 60].map((mins) => {
                  const currentMins = Math.round((timerState.focusDurationSeconds || 1500) / 60);
                  return (
                    <button
                      key={mins}
                      onClick={() => adjustFocusDuration(mins)}
                      className={`px-3 py-1 text-xs rounded-lg font-semibold border transition-all ${
                        currentMins === mins
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                          : "bg-muted hover:bg-muted/80 border-border text-muted-foreground"
                      }`}
                    >
                      {mins}m
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Interactive controls */}
          <div className="flex flex-wrap items-center gap-2">
            {timerState.status === "stopped" && (
              <Button
                onClick={handleStart}
                className="bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 rounded-xl h-10 px-4 text-xs font-semibold"
              >
                <Play size={13} />
                Start Focus
              </Button>
            )}

            {timerState.status === "running" && (
              <Button
                onClick={pauseTimer}
                variant="outline"
                className="flex items-center gap-1.5 rounded-xl h-10 px-4 text-xs font-semibold"
              >
                <Pause size={13} />
                Pause
              </Button>
            )}

            {timerState.status === "paused" && (
              <Button
                onClick={resumeTimer}
                className="bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 rounded-xl h-10 px-4 text-xs font-semibold"
              >
                <Play size={13} />
                Resume
              </Button>
            )}

            {timerState.status !== "stopped" && (
              <Button
                onClick={stopTimer}
                variant="destructive"
                className="flex items-center gap-1.5 rounded-xl h-10 px-4 text-xs font-semibold"
              >
                <Square size={13} />
                Stop
              </Button>
            )}

            {timerState.status === "paused" && (
              <Button
                onClick={restartTimer}
                variant="outline"
                className="flex items-center gap-1.5 rounded-xl h-10 px-4 text-xs font-semibold"
              >
                <RotateCcw size={13} />
                Restart
              </Button>
            )}

            {timerState.mode !== "focus" && (
              <Button
                onClick={skipBreak}
                variant="outline"
                className="flex items-center gap-1.5 rounded-xl h-10 px-4 text-xs font-semibold border-emerald-500/30 text-emerald-600 hover:bg-emerald-50"
              >
                <SkipForward size={13} />
                Skip Break
              </Button>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1.5 border-t border-border/40">
            <span className="flex items-center gap-1">
              <Flame size={13} className="text-orange-500" />
              Focus Sessions Today: <b>{timerState.focusSessions}</b>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
