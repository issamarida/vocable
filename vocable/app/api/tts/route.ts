import { NextRequest, NextResponse } from "next/server";

const DEFAULT_VOICE_ID = "CwhRBWXzGAHq8TQ4Fs17";

export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "ElevenLabs API key not configured. Add ELEVENLABS_API_KEY to .env.local" },
      { status: 500 },
    );
  }

  try {
    const { text, voice_id } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Text is required" },
        { status: 400 },
      );
    }

    const voiceId = voice_id || DEFAULT_VOICE_ID;

    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
      },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("ElevenLabs error:", res.status, err);
      const message =
        err?.detail?.message ?? err?.detail ?? `ElevenLabs request failed (${res.status})`;
      return NextResponse.json({ error: message }, { status: res.status });
    }

    const audioBuffer = await res.arrayBuffer();

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audioBuffer.byteLength),
      },
    });
  } catch (err) {
    console.error("TTS error:", err);
    return NextResponse.json(
      { error: "Something went wrong generating audio" },
      { status: 500 },
    );
  }
}
