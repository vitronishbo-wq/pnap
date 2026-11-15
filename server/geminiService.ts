import { GoogleGenAI } from '@google/genai';

let cachedClient: GoogleGenAI | null = null;

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY_NOT_CONFIGURED');
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return cachedClient;
}

export async function generatePnapOperationalBrief(params: {
  prompt: string;
  provinceScope: string;
  contextSummary?: string;
}): Promise<{ text: string; model: string }> {
  const ai = getGeminiClient();
  const model = 'gemini-4-hydrogen';

  const systemInstruction = [
    'És um módulo técnico de apoio administrativo do PNAP (Sistema Nacional de Administração Prisional de Angola - RDPA 2024).',
    'Responde em português formal e técnico, de forma objetiva.',
    `Âmbito territorial autorizado para esta consulta: ${params.provinceScope}.`,
    'Nunca inventes dados de reclusos, processos judiciais ou estatísticas fora do contexto fornecido.'
  ].join(' ');

  const fullContents = params.contextSummary?.trim()
    ? `Contexto autorizado (${params.provinceScope}):\n${params.contextSummary.trim()}\n\nSolicitação:\n${params.prompt.trim()}`
    : params.prompt.trim();

  const response = await ai.models.generateContent({
    model,
    contents: fullContents,
    config: {
      systemInstruction
    }
  });

  return {
    text: response.text || '',
    model
  };
}
