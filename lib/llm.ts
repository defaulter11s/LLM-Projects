import { GoogleGenerativeAI, Part } from "@google/generative-ai";

/**
 * LLM Client — abstracted so you can swap to Anthropic, OpenAI, or others
 * by changing this file alone. Currently uses Google Gemini (free tier).
 *
 * Free tier limits (as of 2026):
 *  - gemini-2.0-flash-exp: 15 RPM, 1500 RPD, 1M token context, vision support
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
  image?: {
    base64: string;
    mediaType: string;
  };
};

export type LLMResponse = {
  text: string;
  error?: string;
};

/**
 * Send a chat completion request with optional image input.
 * The systemPrompt is injected as a "system instruction" in Gemini.
 */
export async function chat(
  systemPrompt: string,
  messages: ChatMessage[]
): Promise<LLMResponse> {
  if (!genAI) {
    return { text: "", error: "GEMINI_API_KEY is not configured. Set it in .env.local or Vercel env vars." };
  }

  try {
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature: 0.3, // Low for grounded factual answers
        maxOutputTokens: 1000,
      },
    });

    // Gemini requires the first history message to be from "user".
    // Strip any leading assistant messages (e.g. our welcome greeting),
    // and ensure the last message is the user turn we want to send.
    const cleaned = stripLeadingAssistant(messages);
    if (cleaned.length === 0) {
      return { text: "", error: "No user message to send" };
    }

    const last = cleaned[cleaned.length - 1];
    if (last.role !== "user") {
      return { text: "", error: "Last message must be from user" };
    }

    // History = everything except the last (current) user message.
    // Gemini also requires strictly alternating user/model turns in history,
    // so we collapse any consecutive same-role messages defensively.
    const history = collapseAlternating(cleaned.slice(0, -1)).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: buildParts(m),
    }));

    const chatSession = model.startChat({ history });
    const result = await chatSession.sendMessage(buildParts(last));
    const text = result.response.text();

    return { text };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown LLM error";
    console.error("[llm] error:", msg);
    return { text: "", error: msg };
  }
}

/** Drop any leading assistant messages so history starts with a user turn. */
function stripLeadingAssistant(messages: ChatMessage[]): ChatMessage[] {
  let i = 0;
  while (i < messages.length && messages[i].role === "assistant") {
    i++;
  }
  return messages.slice(i);
}

/** Ensure strictly alternating user/assistant turns by merging consecutive ones. */
function collapseAlternating(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    const prev = out[out.length - 1];
    if (prev && prev.role === m.role) {
      // Merge content into previous turn
      prev.content = `${prev.content}\n\n${m.content}`.trim();
      // Keep the latest image if any
      if (m.image) prev.image = m.image;
    } else {
      out.push({ ...m });
    }
  }
  return out;
}

function buildParts(msg: ChatMessage): Part[] {
  const parts: Part[] = [];
  if (msg.image) {
    parts.push({
      inlineData: {
        data: msg.image.base64,
        mimeType: msg.image.mediaType,
      },
    });
  }
  if (msg.content) {
    parts.push({ text: msg.content });
  }
  return parts;
}
