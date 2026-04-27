import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Plain text and markdown files: just decode
    if (fileName.endsWith(".txt") || fileName.endsWith(".md")) {
      const text = buffer.toString("utf-8");
      return NextResponse.json({
        text,
        name: file.name,
        characters: text.length,
      });
    }

    // PDF files: parse on the server
    if (fileName.endsWith(".pdf")) {
      // Dynamically import pdf-parse to avoid issues at build time.
      // pdf-parse has a quirk where it tries to load a test file at import,
      // which breaks Vercel builds. Importing at runtime sidesteps it.
      const pdfParse = (await import("pdf-parse")).default;
      const data = await pdfParse(buffer);
      const text = data.text;

      if (!text || text.trim().length < 50) {
        return NextResponse.json(
          {
            error: "Could not extract readable text from this PDF. It may be a scanned/image PDF — try uploading a text-based PDF or paste the manual content directly.",
          },
          { status: 400 }
        );
      }

      return NextResponse.json({
        text,
        name: file.name,
        characters: text.length,
        pages: data.numpages,
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
      { error: `Upload failed: ${msg}` },
      { status: 500 }
    );
  }
}
