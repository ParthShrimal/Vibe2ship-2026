import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { getCurrentContext, addHours } from "@/lib/time";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

export async function POST(req: Request) {
  try {
    const { task } = await req.json();

    const time = getCurrentContext();

    let resolvedDeadline = null;

    const hourMatch = task.match(/in\s+(\d+)\s+hours?/i);

    if (hourMatch) {
    resolvedDeadline = addHours(Number(hourMatch[1]));
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
contents: `
You are an AI productivity assistant.

Today's date is:

${time.iso}

The user may refer to dates like:
- today
- tomorrow
- next Friday
- this weekend

Always interpret them relative to today's date.

Extract the user's task.

Return ONLY valid JSON.

Do NOT use markdown.
Do NOT use triple backticks.
Do NOT explain anything.

Return this schema:

Schema:

{
"title":"",
"description":"",
"deadline":"ISO-8601 date and time",
"priority":"Low | Medium | High",
"estimatedHours":0
}

IMPORTANT:

Current Date:
${time.localDate}

Current Time:
${time.localTime}

Current ISO:
${time.iso}

Resolved Deadline:
${resolvedDeadline ?? "Not specified"}

If a resolved deadline is provided,
use it exactly.

Do NOT modify it.

If the user says:

"today"

return today's date.

If the user says:

"tomorrow"

return tomorrow's date.

If the user says:

"in 10 hours"

return the exact ISO timestamp 10 hours from now.

If no deadline is mentioned,
set deadline to null.

Return ONLY valid JSON.

Task:

${task}
`,
    });

    const text = response.text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const parsed = JSON.parse(text);

    if (!parsed.deadline) {
    parsed.deadline = new Date(
        Date.now() + 24 * 60 * 60 * 1000
    ).toISOString();
    }

    return NextResponse.json({
      success: true,
      data: parsed,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to analyze task",
      },
      { status: 500 }
    );
  }
}