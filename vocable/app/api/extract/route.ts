import { NextRequest, NextResponse } from "next/server";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

/**
 * Walk the Readability HTML output and extract text from block-level
 * elements, preserving the original paragraph/heading structure.
 */
function extractParagraphs(html: string): string[] {
  const { document: doc } = parseHTML(`<div id="vroot">${html}</div>`);
  const root = doc.getElementById("vroot");
  if (!root) return [];

  const BLOCK = new Set([
    "P", "H1", "H2", "H3", "H4", "H5", "H6",
    "LI", "BLOCKQUOTE", "PRE", "FIGCAPTION", "DT", "DD",
  ]);
  const CONTAINER = new Set([
    "DIV", "SECTION", "ARTICLE", "UL", "OL", "DL",
    "TABLE", "TBODY", "THEAD", "TR", "FIGURE",
    "MAIN", "ASIDE", "HEADER", "FOOTER",
  ]);

  const paragraphs: string[] = [];

  function walk(node: unknown) {
    const el = node as { nodeType: number; tagName?: string; textContent?: string; childNodes?: ArrayLike<unknown> };
    for (const child of Array.from(el.childNodes ?? [])) {
      const c = child as typeof el;
      if (c.nodeType === 3) {
        const text = (c.textContent ?? "").trim();
        if (text) paragraphs.push(text);
      } else if (c.nodeType === 1) {
        const tag = (c.tagName ?? "").toUpperCase();
        if (BLOCK.has(tag)) {
          const text = (c.textContent ?? "").trim();
          if (text) paragraphs.push(text);
        } else if (CONTAINER.has(tag)) {
          walk(c);
        } else {
          const text = (c.textContent ?? "").trim();
          if (text) paragraphs.push(text);
        }
      }
    }
  }

  walk(root);
  return paragraphs;
}

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

    const paragraphs = extractParagraphs(article.content ?? "");
    const content =
      paragraphs.length > 0
        ? paragraphs.join("\n\n")
        : (article.textContent ?? "").trim();

    return NextResponse.json({
      title: article.title,
      content,
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
