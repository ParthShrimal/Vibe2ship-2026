import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { getCurrentContext } from "@/lib/time";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

export async function POST(req: Request) {
  try {
    const { tasks } = await req.json();
    const time = getCurrentContext();
    const task = tasks?.[0];

    if (!task) {
    return NextResponse.json(
        {
        success: false,
        error: "No urgent task received.",
        },
        { status: 400 }
    );
    } // Rescue receives only the urgent task

    const now = new Date();

    const deadline = new Date(task.deadline);

    const diffMs = deadline.getTime() - now.getTime();

    const totalMinutes = Math.max(0, Math.floor(diffMs / 60000));

    const hours = Math.floor(totalMinutes / 60);

    const minutes = totalMinutes % 60;

    const timeRemaining =
    hours > 0
        ? `${hours}h ${minutes}m`
        : `${minutes}m`;
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `
You are an expert productivity coach.

Current Date:
${time.localDate}

Current Time:
${time.localTime}

Current ISO:
${time.iso}

Current remaining time until deadline:

${timeRemaining}

IMPORTANT:

The remaining time has ALREADY been calculated.

Do NOT recalculate it.

Use this exact value everywhere.

Never change it.

Never estimate it.

These are the user's tasks:

${JSON.stringify(tasks, null, 2)}

Identify the MOST URGENT task.
Include the title of the urgent task in taskTitle.
Return ONLY valid JSON.

Do NOT return markdown.
Do NOT use backticks.
Do NOT explain anything.

Return exactly this schema:

{
  "taskTitle":"",
  "riskLevel":"High",
  "timeRemaining":"${timeRemaining}",
  "completionChance":91,
  "firstStep":"Start working on the highest priority task immediately.",
  "timeline":[
    {
      "time":"19:00",
      "activity":"Research"
    },
    {
      "time":"20:00",
      "activity":"Implementation"
    },
    {
      "time":"22:00",
      "activity":"Testing"
    },
    {
      "time":"23:00",
      "activity":"Final Review"
    }
  ]
}
`,
    });

    const text = response.text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const parsed = JSON.parse(text);

    return NextResponse.json({
      success: true,
      plan: parsed,
    });

  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to generate rescue plan.",
      },
      {
        status: 500,
      }
    );
  }
}