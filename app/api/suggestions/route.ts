import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/llm";
import {
  buildSuggestionsPromptForText,
  buildSuggestionsPromptForPdf,
} from "@/lib/prompt";

export const runtime = "nodejs";
export const maxDuration = 30;

type SuggestionsRequest = {
  manual?: string;
  manualPdfBase64?: string;
};

/**
 * Generates 6 starter questions a rider would actually ask, drawn from the
 * loaded manual. Used to populate the question-chip grid above the chat input.
 *
 * Why this exists: a generic hardcoded list would be wrong for many manuals
 * (electric bikes have no oil; some manuals don't include service intervals
 * at all). Asking the LLM for questions it can answer guarantees that every
 * chip leads to a confident answer.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SuggestionsRequest;
    const { manual, manualPdfBase64 } = body;

    let systemPrompt: string;
    let attachment;

    if (manualPdfBase64) {
      systemPrompt = buildSuggestionsPromptForPdf();
      attachment = { kind: "pdf" as const, base64: manualPdfBase64 };
    } else if (manual && manual.trim().length >= 50) {
      const safeManual = manual.length > 500_000 ? manual.slice(0, 500_000) : manual;
      systemPrompt = buildSuggestionsPromptForText(safeManual);
      attachment = { kind: "text" as const, text: safeManual };
    } else {
      return NextResponse.json(
        { error: "manual or manualPdfBase64 required" },
        { status: 400 }
      );
    }

    // We send a minimal user message — the system prompt does the heavy lifting.
    // Lower temperature for more consistent JSON output.
    const response = await chat(
      systemPrompt,
      [{ role: "user", content: "Generate the questions now." }],
      attachment,
      { temperature: 0.2, maxOutputTokens: 400 }
    );

    if (response.error) {
      return NextResponse.json({ error: response.error }, { status: 500 });
    }

    // Parse JSON, tolerating common LLM quirks (markdown code fences, prose preamble)
    const questions = parseSuggestions(response.text);
    if (!questions || questions.length === 0) {
      return NextResponse.json(
        { error: "Could not parse suggestions", raw: response.text },
        { status: 500 }
      );
    }

    return NextResponse.json({ questions: questions.slice(0, 6) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[api/suggestions] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function parseSuggestions(raw: string): string[] | null {
  // Strip markdown code fences if present
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");

  // Find JSON object boundaries
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) return null;
  const jsonStr = cleaned.slice(firstBrace, lastBrace + 1);

  try {
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed.questions)) {
      return parsed.questions
        .filter((q: unknown): q is string => typeof q === "string")
        .map((q: string) => q.trim())
        .filter((q: string) => q.length > 0 && q.length < 200);
    }
  } catch {
    // Fallthrough
  }
  return null;
}
