import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Fetches the just-uploaded Blob, returns its content for the chat route to use:
 *  - .txt / .md → returned as text
 *  - .pdf → returned as base64 (Gemini reads it natively, no parsing here)
 *
 * Then deletes the Blob to keep storage clean.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { url?: string; name?: string };
    const { url, name } = body;

    if (!url || !name) {
      return NextResponse.json(
        { error: "url and name are required" },
        { status: 400 }
      );
    }

    if (
      !url.includes("public.blob.vercel-storage.com") &&
      !url.includes(".vercel-storage.com")
    ) {
      return NextResponse.json({ error: "Invalid blob URL" }, { status: 400 });
    }

    const fileName = name.toLowerCase();
    const fileRes = await fetch(url);
    if (!fileRes.ok) {
      return NextResponse.json(
        { error: `Could not fetch uploaded file: ${fileRes.status}` },
        { status: 500 }
      );
    }
    const arrayBuffer = await fileRes.arrayBuffer();
    const fileSize = arrayBuffer.byteLength;

    // Clean up the Blob immediately
    try {
      await del(url);
    } catch (delErr) {
      console.warn("[api/upload] failed to delete blob:", delErr);
    }

    if (fileName.endsWith(".txt") || fileName.endsWith(".md")) {
      const text = Buffer.from(arrayBuffer).toString("utf-8");
      if (text.trim().length < 50) {
        return NextResponse.json(
          { error: "File is too short (minimum 50 characters)." },
          { status: 400 }
        );
      }
      return NextResponse.json({
        kind: "text",
        text,
        name,
        characters: text.length,
      });
    }

    if (fileName.endsWith(".pdf")) {
      // Inline data limit is 20 MB raw. Base64 inflates by ~33%, so practical
      // raw cap is around 15 MB.
      const MAX_PDF_BYTES = 15 * 1024 * 1024;
      if (fileSize > MAX_PDF_BYTES) {
        return NextResponse.json(
          {
            error:
              "PDF too large. Please upload a PDF under 15 MB, or extract the text and upload as .txt.",
          },
          { status: 400 }
        );
      }
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      return NextResponse.json({
        kind: "pdf",
        base64,
        name,
        bytes: fileSize,
      });
    }

    return NextResponse.json(
      { error: "Unsupported file type. Upload .pdf, .txt, or .md files." },
      { status: 400 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[api/upload] error:", msg);
    return NextResponse.json(
      { error: `Upload processing failed: ${msg}` },
      { status: 500 }
    );
  }
}
