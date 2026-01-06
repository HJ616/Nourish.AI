import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, ChatMessage } from "../types";
import { GEMINI_TEXT_MODEL, GEMINI_VISION_MODEL, SYSTEM_INSTRUCTION } from "../constants";

const analysisSchema = {
  type: Type.OBJECT,
  properties: {
    productName: { type: Type.STRING },
    summary: { type: Type.STRING },
    audioScript: { type: Type.STRING },
    shareContent: { type: Type.STRING },
    healthScore: { type: Type.NUMBER },
    intentInference: { type: Type.STRING },
    dietaryClassification: { type: Type.STRING, enum: ['veg', 'non-veg', 'vegan', 'unknown'] },
    uncertainty: {
      type: Type.OBJECT,
      properties: {
        detected: { type: Type.BOOLEAN },
        reason: { type: Type.STRING },
      },
      required: ['detected', 'reason'],
    },
    villains: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          explanation: { type: Type.STRING },
        },
        required: ['name', 'explanation'],
      },
    },
    tradeoffs: {
      type: Type.OBJECT,
      properties: {
        pros: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        cons: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
      },
      required: ['pros', 'cons'],
    },
    insights: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          type: { type: Type.STRING, enum: ['positive', 'warning', 'critical', 'neutral'] },
          confidence: { type: Type.NUMBER },
        },
      },
    },
    radarData: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          subject: { type: Type.STRING },
          A: { type: Type.NUMBER },
          fullMark: { type: Type.NUMBER },
        },
      },
    },
    reasoningTrace: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: ['summary', 'audioScript', 'shareContent', 'healthScore', 'insights', 'radarData', 'dietaryClassification', 'tradeoffs', 'uncertainty', 'villains'],
};

function handleGeminiError(error: any): never {
  console.error("Gemini API Error:", error);
  const msg = typeof error === 'string' ? error : (error?.message || JSON.stringify(error));
  
  if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
    throw new Error("QUOTA_EXCEEDED");
  }
  throw error;
}

export async function analyzeImage(base64Data: string, mimeType: string, apiKey?: string, persona?: string): Promise<AnalysisResult> {
  const finalApiKey = (apiKey || process.env.API_KEY || "").trim();
  if (!finalApiKey) throw new Error("API Key is missing. Please provide one in settings.");
  
  const ai = new GoogleGenAI({ apiKey: finalApiKey });
  const promptText = `Analyze this food product label or image. Tell me what I'm eating. ${persona ? `\n\nUSER PERSONA: ${persona}. Adjust summary and insights specifically for this user profile.` : ''} Provide a JSON output matching the schema.`;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_VISION_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
          {
            text: promptText,
          },
        ],
      },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingBudget: 1024 } 
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response text from Gemini");
    
    return JSON.parse(text) as AnalysisResult;

  } catch (error) {
    handleGeminiError(error);
  }
}

export async function analyzeText(query: string, apiKey?: string, persona?: string): Promise<AnalysisResult> {
  const finalApiKey = (apiKey || process.env.API_KEY || "").trim();
  if (!finalApiKey) throw new Error("API Key is missing. Please provide one in settings.");

  const ai = new GoogleGenAI({ apiKey: finalApiKey });
  const promptText = `Analyze this food product/ingredient list: "${query}". ${persona ? `\n\nUSER PERSONA: ${persona}. Adjust summary and insights specifically for this user profile.` : ''} Provide a JSON output matching the schema.`;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL, 
      contents: {
        parts: [{ text: promptText }],
      },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingBudget: 1024 }
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response text from Gemini");

    return JSON.parse(text) as AnalysisResult;

  } catch (error) {
    handleGeminiError(error);
  }
}

export async function chatWithCoPilot(history: ChatMessage[], newMessage: string, context?: AnalysisResult, apiKey?: string): Promise<string> {
    const finalApiKey = (apiKey || process.env.API_KEY || "").trim();
    if (!finalApiKey) throw new Error("API Key is missing. Please provide one in settings.");

    const ai = new GoogleGenAI({ apiKey: finalApiKey });
    const contextString = context ? `Context: User is looking at a product named ${context.productName || 'unknown'}. 
    Summary: ${context.summary}. 
    Dietary Type: ${context.dietaryClassification}.
    Uncertainty Detected: ${context.uncertainty?.detected ? context.uncertainty.reason : 'None'}.
    Villains/Bad Ingredients: ${JSON.stringify(context.villains)}.
    Trade-offs: Pros - ${context.tradeoffs.pros.join(', ')}, Cons - ${context.tradeoffs.cons.join(', ')}.
    Insights: ${JSON.stringify(context.insights)}.` : '';

    try {
        const chat = ai.chats.create({
            model: GEMINI_TEXT_MODEL,
            config: {
                systemInstruction: `You are a helpful, empathetic food scientist co-pilot. Keep answers short, conversational, and direct. ${contextString}`
            },
            history: history.map(h => ({
                role: h.role,
                parts: [{ text: h.text }]
            }))
        });

        const result = await chat.sendMessage({ message: newMessage });
        return result.text || "I'm having trouble understanding that right now.";
    } catch (error) {
        handleGeminiError(error);
    }
}