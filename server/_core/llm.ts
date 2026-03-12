import { GoogleGenerativeAI, type Part } from "@google/generative-ai";
import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4";
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type InvokeParams = {
  messages: Message[];
  responseFormat?: { type: "text" | "json_object" | "json_schema" };
  response_format?: { type: "text" | "json_object" | "json_schema" };
  maxTokens?: number;
  max_tokens?: number;
  /** Gemini 2.5 思考トークン数。値が大きいほど精度が上がるが処理時間も増える。OCRには 5000 推奨。 */
  thinkingBudget?: number;
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

async function urlToInlineData(url: string): Promise<{ data: string; mimeType: string }> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = response.headers.get("content-type") || "image/jpeg";
  return {
    data: buffer.toString("base64"),
    mimeType: contentType.split(";")[0] || "image/jpeg",
  };
}

async function convertContentToParts(
  content: MessageContent | MessageContent[],
): Promise<Part[]> {
  const parts = Array.isArray(content) ? content : [content];
  const result: Part[] = [];

  for (const part of parts) {
    if (typeof part === "string") {
      result.push({ text: part });
    } else if (part.type === "text") {
      result.push({ text: part.text });
    } else if (part.type === "image_url") {
      const url = part.image_url.url;
      if (url.startsWith("data:")) {
        // Already base64 encoded data URI
        const [header, data] = url.split(",");
        const mimeType = header.split(":")[1].split(";")[0];
        result.push({ inlineData: { data, mimeType } });
      } else {
        // Fetch and convert to inline data
        const inlineData = await urlToInlineData(url);
        result.push({ inlineData });
      }
    }
    // Skip file_url (not supported in basic Gemini text generation)
  }

  return result;
}

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  if (!ENV.geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const genAI = new GoogleGenerativeAI(ENV.geminiApiKey);

  // Separate system messages from conversation messages
  const systemMessages = params.messages.filter((m) => m.role === "system");
  const conversationMessages = params.messages.filter((m) => m.role !== "system");

  // Build system instruction text
  const systemInstruction =
    systemMessages.length > 0
      ? systemMessages
          .map((m) => (typeof m.content === "string" ? m.content : ""))
          .filter(Boolean)
          .join("\n")
      : undefined;

  // Check if JSON output is requested
  const responseFormatType =
    (params.responseFormat?.type ?? params.response_format?.type) === "json_object"
      ? "json_object"
      : undefined;

  // generationConfig: JSON強制出力 + 思考モード（精度向上）
  const generationConfig: Record<string, unknown> = {};
  if (responseFormatType === "json_object") {
    // responseMimeType でモデルに JSON 出力を強制（テキスト指示より確実）
    generationConfig.responseMimeType = "application/json";
  }
  if (params.thinkingBudget && params.thinkingBudget > 0) {
    // thinking: モデルが回答前に内部で推論するトークン数
    // OCRのような複雑な視覚タスクで精度が大幅に向上する
    generationConfig.thinkingConfig = { thinkingBudget: params.thinkingBudget };
  }

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    ...(systemInstruction ? { systemInstruction } : {}),
    ...(Object.keys(generationConfig).length > 0
      ? { generationConfig: generationConfig as any }
      : {}),
  });

  // Convert messages to Gemini history format (all but the last)
  const history: { role: "user" | "model"; parts: Part[] }[] = [];
  const lastMessage = conversationMessages[conversationMessages.length - 1];

  for (const msg of conversationMessages.slice(0, -1)) {
    const geminiRole = msg.role === "assistant" ? "model" : "user";
    history.push({
      role: geminiRole,
      parts: await convertContentToParts(msg.content),
    });
  }

  const chat = model.startChat({ history });

  // Build parts for the last message
  const lastParts = lastMessage
    ? await convertContentToParts(lastMessage.content)
    : [{ text: "" }];

  // responseMimeType: "application/json" が設定されている場合、テキストリマインダー不要
  const finalParts = lastParts;

  const result = await chat.sendMessage(finalParts);
  const responseText = result.response.text();

  return {
    id: `gemini-${Date.now()}`,
    created: Math.floor(Date.now() / 1000),
    model: "gemini-2.5-flash",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: responseText,
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: result.response.usageMetadata?.promptTokenCount ?? 0,
      completion_tokens: result.response.usageMetadata?.candidatesTokenCount ?? 0,
      total_tokens: result.response.usageMetadata?.totalTokenCount ?? 0,
    },
  };
}
