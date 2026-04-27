import { GoogleGenerativeAI, Part } from "@google/generative-ai";

/**
 * LLM Client — abstracted so you can swap to Anthropic, OpenAI, or others
 * by changing this file alone. Currently uses Google Gemini (free tier).
 *
 * Free tier limits (as of 2026):
 *  - gemini-2.5-flash: ~10 RPM, ~250 RPD, 1M token context, vision support
 *  - Get key: https://aistudio.google.com/app/apikey
 */

const apiKey = process.env.GEMINI_API_KEY;
const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

if (!apiKey) {
  console.warn("[llm] GEMINI_API_KEY not set — API routes will fail until configured");
}

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  /** Optional inline image attached to this turn (data URL, e.g. "data:image/jpeg;base64,...") */
  imageDataUrl?: string;
};

export type LLMResponse = {
  text: string;
  error?: string;
};

export type ManualAttachment =
  | { kind: "text"; text: string }
  | { kind: "pdf"; base64: string };

/**
 * Send a chat completion request. The systemPrompt becomes the system instruction.
 * If manualAttachment is a PDF, it's attached to the first user turn for
 * Gemini to read natively (no client-side parsing needed).
 *
 * Gemini quirks handled here:
 *  - History must start with a "user" turn (we strip leading assistants)
 *  - History must strictly alternate user/model (we collapse same-role pairs)
 */
export async function chat(
  systemPrompt: string,
  messages: ChatMessage[],
  manualAttachment?: ManualAttachment,
  generationOverride?: { temperature?: number; maxOutputTokens?: number }
): Promise<LLMResponse> {
  if (!genAI) {
    return {
      text: "",
      error: "GEMINI_API_KEY is not configured. Set it in Vercel env vars.",
    };
  }

  try {
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature: generationOverride?.temperature ?? 0.4,
        maxOutputTokens: generationOverride?.maxOutputTokens ?? 800,
      },
    });

    const cleaned = stripLeadingAssistant(messages);
    if (cleaned.length === 0) {
      return { text: "", error: "No user message to send" };
    }

    const last = cleaned[cleaned.length - 1];
    if (last.role !== "user") {
      return { text: "", error: "Last message must be from user" };
    }

    // Build history. Attach PDF (if any) to the first user turn so Gemini
    // can reference it throughout the conversation. Attach images to whichever
    // turn carries them.
    const history = collapseAlternating(cleaned.slice(0, -1)).map((m, idx) => {
      const role = m.role === "assistant" ? "model" : "user";
      const parts: Part[] = [{ text: m.content }];

      if (
        idx === 0 &&
        role === "user" &&
        manualAttachment?.kind === "pdf"
      ) {
        parts.push({
          inlineData: {
            mimeType: "application/pdf",
            data: manualAttachment.base64,
          },
        });
      }

      if (m.imageDataUrl && role === "user") {
        const parsed = parseDataUrl(m.imageDataUrl);
        if (parsed) {
          parts.push({
            inlineData: { mimeType: parsed.mime, data: parsed.b64 },
          });
        }
      }

      return { role, parts };
    });

    // Build the current (last) message parts
    const lastParts: Part[] = [{ text: last.content }];

    // If no prior history, attach PDF here too
    if (
      history.length === 0 &&
      manualAttachment?.kind === "pdf"
    ) {
      lastParts.push({
        inlineData: {
          mimeType: "application/pdf",
          data: manualAttachment.base64,
        },
      });
    }

    if (last.imageDataUrl) {
      const parsed = parseDataUrl(last.imageDataUrl);
      if (parsed) {
        lastParts.push({
          inlineData: { mimeType: parsed.mime, data: parsed.b64 },
        });
      }
    }

    const chatSession = model.startChat({ history });
    const result = await chatSession.sendMessage(lastParts);
    const text = result.response.text();

    return { text };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown LLM error";
    console.error("[llm] error:", msg);
    return { text: "", error: msg };
  }
}

function stripLeadingAssistant(messages: ChatMessage[]): ChatMessage[] {
  let i = 0;
  while (i < messages.length && messages[i].role === "assistant") {
    i++;
  }
  return messages.slice(i);
}

function collapseAlternating(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    const prev = out[out.length - 1];
    if (prev && prev.role === m.role) {
      prev.content = `${prev.content}\n\n${m.content}`.trim();
      // Keep the most recent image attachment if present
      if (m.imageDataUrl) prev.imageDataUrl = m.imageDataUrl;
    } else {
      out.push({ ...m });
    }
  }
  return out;
}

function parseDataUrl(dataUrl: string): { mime: string; b64: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mime: match[1], b64: match[2] };
}
