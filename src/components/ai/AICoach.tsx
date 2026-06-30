"use client";

import { useState } from "react";
import { Sparkles, Clock, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { useTasks } from "@/context/TaskContext";
import { getClientTime } from "@/lib/date";

export default function AICoach() {
  const { tasks } = useTasks();

  const [loading, setLoading] = useState(false);
  const [advice, setAdvice] = useState<any>(null);

  async function generateAdvice() {
    if (tasks.length === 0) {
      alert(
        "🎉 Great job!\n\nNo pending tasks today."
      );
      return;
    }

    try {
      setLoading(true);

      const response = await fetch("/api/ai-coach", {
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

      setAdvice(data.advice);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="rounded-3xl p-6 shadow-lg">

      <div className="flex items-center gap-3">

        <Sparkles className="text-indigo-600" />

        <h2 className="text-2xl font-bold">
          AI Coach
        </h2>

      </div>

      <p className="mt-2 text-gray-500">
        Personalized productivity advice.
      </p>

      <Button
        className="mt-6 w-full"
        onClick={generateAdvice}
      >
        {loading
          ? "Thinking..."
          : "✨ Refresh Advice"}
      </Button>

      {advice && (

        <div className="mt-6 space-y-4">

          <div className="rounded-xl bg-indigo-50 p-4">

            <div className="flex items-center gap-2">

              <AlertTriangle
                className="text-red-500"
                size={18}
              />

              <span className="font-semibold">
                Highest Priority
              </span>

            </div>

            <p className="mt-2">
              {advice.highestPriority}
            </p>

          </div>

          <div className="rounded-xl bg-blue-50 p-4">

            <div className="flex items-center gap-2">

              <Clock
                className="text-blue-600"
                size={18}
              />

              <span className="font-semibold">
                Recommended Start
              </span>

            </div>

            <p className="mt-2">
              {advice.startTime}
            </p>

          </div>

          <div className="rounded-xl bg-green-50 p-4">

            <p className="font-semibold">
              AI Recommendation
            </p>

            <p className="mt-2">
              {advice.message}
            </p>

          </div>

        </div>

      )}

    </Card>
  );
}