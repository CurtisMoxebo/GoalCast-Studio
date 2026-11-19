import { ITTSService } from './ttsService.interface';
import { KokoroTTSService } from './kokoroTtsService';

let ttsInstance: ITTSService | null = null;

export function getTTSService(): ITTSService {
  if (ttsInstance) return ttsInstance;

  // Default to KokoroTTSService; pluggable for other engines (ElevenLabs, Edge-TTS, etc.)
  ttsInstance = new KokoroTTSService();
  return ttsInstance;
}
