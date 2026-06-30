"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useTasks } from "@/context/TaskContext";
import { getClientTime } from "@/lib/date";

export default function DayPlanner() {
  const { tasks } = useTasks();

  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState("");

  async function generatePlan() {
    setLoading(true);

    const response = await fetch("/api/generate-day", {
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

    setPlan(data.plan);

    setLoading(false);
  }

  return (
    <div className="rounded-3xl bg-white p-6 shadow-lg">

      <Button
        className="w-full"
        onClick={generatePlan}
      >
        {loading ? "Generating..." : "✨ Generate My Day"}
      </Button>

      {plan && (
        <pre className="mt-6 whitespace-pre-wrap rounded-xl bg-slate-100 p-4">
          {plan}
        </pre>
      )}

    </div>
  );
}