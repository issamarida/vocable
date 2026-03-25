import { NextRequest, NextResponse } from "next/server";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "A valid URL is required" },
        { status: 400 }
      );
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 }
      );
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return NextResponse.json(
        { error: "URL must use http or https" },
        { status: 400 }
      );
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Vocable/1.0; +https://vocable.app)",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch URL (status ${response.status})` },
        { status: 502 }
      );
    }

    const html = await response.text();
    const { document } = parseHTML(html);

    const reader = new Readability(document as unknown as Document);
    const article = reader.parse();

    if (!article) {
      return NextResponse.json(
        { error: "Could not extract readable content from this URL" },
        { status: 422 }
      );
    }

    return NextResponse.json({
      title: article.title,
      content: (article.textContent ?? "").trim(),
      excerpt: article.excerpt ?? "",
    });
  } catch (err) {
    console.error("Extract error:", err);
    return NextResponse.json(
      { error: "Something went wrong while extracting the page" },
      { status: 500 }
    );
  }
}
