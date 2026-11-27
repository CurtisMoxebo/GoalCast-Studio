import fs from 'fs';
import path from 'path';
import { assetsManager } from '../video/assetsManager';
import { AVAILABLE_VOICES } from './kokoroTtsService';
import { getTTSService } from './ttsFactory';
import { DEFAULT_TTS_SPEED, VOICE_PREVIEW_SAMPLE_TEXT } from '../../constants/videoDefaults';

/**
 * Manages pre-generated voice actor preview audio clips inside `<resources>/voice_previews/`.
 * Uses the exact opening sentence and speech speed from the video composer.
 */
export class VoicePreviewService {
  private inFlight = new Map<string, Promise<string>>();

  getVoicePreviewsDir(): string {
    return path.join(assetsManager.getResourcesDir(), 'voice_previews');
  }

  getVoicePreviewFilename(voiceId: string): string {
    return `voice_preview_${voiceId.toLowerCase()}.wav`;
  }

  getVoicePreviewPath(voiceId: string): string {
    return path.join(this.getVoicePreviewsDir(), this.getVoicePreviewFilename(voiceId));
  }

  isValidVoiceId(voiceId: string): boolean {
    const normalized = voiceId.toLowerCase();
    return AVAILABLE_VOICES.some((v) => v.id === normalized);
  }

  /**
   * Returns the path to a voice actor's preview WAV file, generating and saving it
   * into the resources folder if it does not yet exist.
   */
  async ensureVoicePreview(voiceId: string): Promise<string> {
    const normalized = voiceId.toLowerCase();
    if (!this.isValidVoiceId(normalized)) {
      throw new Error(`Unknown voice actor: ${voiceId}`);
    }

    const filePath = this.getVoicePreviewPath(normalized);
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 44) {
      return filePath;
    }

    const existingPromise = this.inFlight.get(normalized);
    if (existingPromise) {
      return existingPromise;
    }

    const task = (async () => {
      const dir = this.getVoicePreviewsDir();
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      console.log(`[VoicePreview] 🎙️ Generating preview audio for voice "${normalized}" -> ${filePath}`);
      const tts = getTTSService();
      await tts.generateSpeech(VOICE_PREVIEW_SAMPLE_TEXT, {
        voice: normalized,
        speed: DEFAULT_TTS_SPEED,
        outputFilePath: filePath
      });
      console.log(`[VoicePreview] ✅ Saved voice preview for "${normalized}" (${(fs.statSync(filePath).size / 1024).toFixed(1)} KB)`);
      return filePath;
    })();

    this.inFlight.set(normalized, task);
    try {
      return await task;
    } finally {
      this.inFlight.delete(normalized);
    }
  }

  /**
   * Generates and saves preview audio files for all available voice actors
   * that do not already have a cached file in `<resources>/voice_previews/`.
   */
  async ensureAllVoicePreviews(): Promise<{ generated: string[]; existing: string[] }> {
    const generated: string[] = [];
    const existing: string[] = [];

    for (const voice of AVAILABLE_VOICES) {
      const filePath = this.getVoicePreviewPath(voice.id);
      if (fs.existsSync(filePath) && fs.statSync(filePath).size > 44) {
        existing.push(voice.id);
      } else {
        await this.ensureVoicePreview(voice.id);
        generated.push(voice.id);
      }
    }

    return { generated, existing };
  }
}

export const voicePreviewService = new VoicePreviewService();
