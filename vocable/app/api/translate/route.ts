import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenAI API key not configured." },
      { status: 500 },
    );
  }

  try {
    const { text, language } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Text is required" },
        { status: 400 },
      );
    }

    if (!language || typeof language !== "string") {
      return NextResponse.json(
        { error: "Target language is required" },
        { status: 400 },
      );
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        max_tokens: 4000,
        messages: [
          {
            role: "system",
            content: `You are a professional translator. Translate the following text into ${language}. 

Rules:
- Translate faithfully and completely — do not skip, summarize, or shorten anything
- Preserve the meaning, tone, and structure of the original
- Keep paragraph breaks
- Do not add any commentary, notes, or explanations
- Output ONLY the translated text`,
          },
          { role: "user", content: text.slice(0, 15_000) },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("OpenAI translate error:", err);
      return NextResponse.json(
        { error: err.error?.message ?? "Translation failed" },
        { status: 502 },
      );
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      return NextResponse.json(
        { error: "No translation returned" },
        { status: 502 },
      );
    }

    return NextResponse.json({ content });
  } catch (err) {
    console.error("Translate error:", err);
    return NextResponse.json(
      { error: "Something went wrong during translation" },
      { status: 500 },
    );
  }
}
