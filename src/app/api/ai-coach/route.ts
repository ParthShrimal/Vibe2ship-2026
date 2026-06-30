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
You are an AI productivity coach.

Current Date:
${time.localDate}

Current Time:
${time.localTime}

Current ISO:
${time.iso}

Tasks:

${JSON.stringify(tasks)}

Return ONLY JSON.

Schema:

{
"highestPriority":"",
"startTime":"",
"message":""
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
      advice: parsed,
    });

  } catch (err) {

    console.error(err);

    return NextResponse.json(
      {
        success:false
      },
      {
        status:500
      }
    );
  }
}