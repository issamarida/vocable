import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are explaining a webpage to someone who finds reading difficult or tiring.

Do not summarize like a news article. Do not copy the original text.

Instead, explain the page thoroughly and clearly:

1. Start with one sentence about what this page is about overall.
2. Then go through ALL the key ideas, topics, and important details from the page — do not skip things.
3. Explain each idea in its own short paragraph so it is easy to follow.
4. Use simple, clear language. Short sentences. No jargon unless you explain it.
5. If there are numbers, dates, names, or facts, include them.
6. If there are steps or instructions, walk through each one.
7. If there are opinions or arguments, explain what they are and why they matter.
8. End with a brief wrap-up of the most important takeaway.

Your goal is to be detailed and thorough — not brief. Cover everything important on the page so the listener does not need to read the original. Make it easy to follow when spoken aloud.`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "OpenAI API key not configured. Add OPENAI_API_KEY to your .env.local file.",
      },
      { status: 500 }
    );
  }

  try {
    const { text, language } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Text content is required" },
        { status: 400 }
      );
    }

    const langName = language || "English";

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        max_tokens: 3000,
        messages: [
          {
            role: "system",
            content: `${SYSTEM_PROMPT}\n\nRespond in ${langName}.`,
          },
          { role: "user", content: text.slice(0, 12_000) },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("OpenAI error:", err);
      return NextResponse.json(
        {
          error:
            err.error?.message ?? `LLM request failed (status ${res.status})`,
        },
        { status: 502 }
      );
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      return NextResponse.json(
        { error: "No response from LLM" },
        { status: 502 }
      );
    }

    return NextResponse.json({ content });
  } catch (err) {
    console.error("Understand error:", err);
    return NextResponse.json(
      { error: "Something went wrong while processing" },
      { status: 500 }
    );
  }
}
