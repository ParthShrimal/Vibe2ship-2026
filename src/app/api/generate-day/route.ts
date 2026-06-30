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
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `
You are an expert productivity coach.

Using these tasks:

${JSON.stringify(tasks, null, 2)}

Current Date:
${time.localDate}

Current Time:
${time.localTime}

Generate today's schedule.

IMPORTANT:

Start from the current time.

Never create events in the past.

Round to the next 15 minutes.

Example:

Current time = 3:40 PM

Start at 3:45 PM.

Rules:
- Prioritize urgent tasks.
- Include short breaks.
- Return ONLY plain text.
- Use 24-hour time.

Example:

09:00 - Task
10:30 - Break
11:00 - Task
`,
    });

    return NextResponse.json({
      success: true,
      plan: response.text,
    });

  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { success: false },
      { status: 500 }
    );
  }
}