import { IAIService } from './aiService.interface';
import { GeminiAIService } from './geminiAiService';
import { MockAIService } from './mockAiService';

let aiInstance: IAIService | null = null;

export function setAIServiceInstance(instance: IAIService | null): void {
  aiInstance = instance;
}

export function getAIService(): IAIService {
  if (aiInstance) return aiInstance;

  const provider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
  const apiKey = process.env.GEMINI_API_KEY;

  if (provider === 'gemini') {
    if (!apiKey || apiKey.trim() === '' || apiKey === 'your_gemini_api_key_here') {
      console.warn(
        '[AIService] No valid GEMINI_API_KEY detected in .env. Falling back to MockAIService for safe local development/testing.'
      );
      aiInstance = new MockAIService();
    } else {
      aiInstance = new GeminiAIService();
    }
  } else if (provider === 'mock') {
    aiInstance = new MockAIService();
  } else {
    console.warn(`[AIService] Unknown provider "${provider}", defaulting to GeminiAIService`);
    aiInstance = new GeminiAIService();
  }

  return aiInstance;
}
