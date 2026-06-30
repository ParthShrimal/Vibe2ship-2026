"use client";

import { useState } from "react";
import { AlertTriangle, Clock, Target, Flag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useTasks } from "@/context/TaskContext";
import { getClientTime } from "@/lib/date";

interface TimelineItem {
  time: string;
  activity: string;
}

interface RescuePlan {
  riskLevel: string;
  timeRemaining: string;
  completionChance: number;
  firstStep: string;
  timeline: TimelineItem[];
}

export default function RescueMode() {
  const { tasks } = useTasks();

  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<RescuePlan | null>(null);

  async function generateRescuePlan() {
    if (tasks.length === 0) {
      alert(
        "🎉 Hurray!\n\nNo urgent tasks found.\nEnjoy your day!"
      );
      return;
    }

    try {
      setLoading(true);

      const response = await fetch("/api/rescue-mode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tasks: tasks.map((t: any) => ({
            id: t.id,
            title: t.title,
            description: t.description || "",
            deadline: t.deadline,
            priority: t.priority,
            estimatedHours: t.estimatedHours,
            status: t.status,
            createdAt: t.createdAt,
          })),
          clientTime: getClientTime(),
        }),
      });

      const data = await response.json();

      if (data.success) {
        setPlan(data.plan);
      } else {
        alert("Failed to generate rescue plan.");
      }
    } catch (err) {
      console.error(err);
      alert("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="rounded-3xl border-red-200 p-6 shadow-lg">

      <div className="flex items-center gap-3">

        <AlertTriangle className="text-red-500" />

        <h2 className="text-2xl font-bold">
          🚨 Rescue Mode
        </h2>

      </div>

      <p className="mt-2 text-gray-500">
        AI generates an emergency recovery plan for urgent deadlines.
      </p>

      <Button
        className="mt-6 w-full"
        onClick={generateRescuePlan}
        disabled={loading}
      >
        {loading
          ? "Generating Rescue Plan..."
          : "🚨 Activate Rescue Mode"}
      </Button>

      {plan && (
        <div className="mt-8 space-y-6">

          <div className="grid gap-4 md:grid-cols-3">

            <div className="rounded-xl bg-red-50 p-4">

              <div className="flex items-center gap-2">

                <AlertTriangle className="text-red-500" size={18} />

                <p className="text-sm text-gray-500">
                  Risk
                </p>

              </div>

              <p className="mt-2 text-xl font-bold text-red-600">
                {plan.riskLevel}
              </p>

            </div>

            <div className="rounded-xl bg-blue-50 p-4">

              <div className="flex items-center gap-2">

                <Clock className="text-blue-500" size={18} />

                <p className="text-sm text-gray-500">
                  Time Left
                </p>

              </div>

              <p className="mt-2 text-xl font-bold">
                {plan.timeRemaining}
              </p>

            </div>

            <div className="rounded-xl bg-green-50 p-4">

              <div className="flex items-center gap-2">

                <Target
                  className="text-green-600"
                  size={18}
                />

                <p className="text-sm text-gray-500">
                  Completion Chance
                </p>

              </div>

              <p className="mt-2 text-xl font-bold text-green-600">
                {plan.completionChance}%
              </p>

            </div>

          </div>

          <div className="rounded-xl bg-yellow-50 p-5">

            <div className="flex items-center gap-2">

              <Flag
                className="text-yellow-600"
                size={18}
              />

              <h3 className="font-semibold">
                First Step
              </h3>

            </div>

            <p className="mt-3">
              {plan.firstStep}
            </p>

          </div>

          <div>

            <h3 className="mb-4 text-xl font-bold">
              🕒 Recovery Timeline
            </h3>

            <div className="space-y-3">

              {plan.timeline.map((item, index) => (

                <div
                  key={index}
                  className="flex items-center justify-between rounded-xl border p-4"
                >

                  <span className="font-semibold text-indigo-600">
                    {item.time}
                  </span>

                  <span>
                    {item.activity}
                  </span>

                </div>

              ))}

            </div>

          </div>

        </div>
      )}

    </Card>
  );
}