import fs from 'fs';
import path from 'path';
import { ITTSService, VoiceOption, GenerateSpeechOptions } from './ttsService.interface';
import { DEFAULT_TTS_SPEED } from '../../constants/videoDefaults';

// Voice mapping from user requested names to Kokoro voice IDs
const VOICE_MAP: Record<string, string> = {
  hearth: 'af_heart',
  alloy: 'af_alloy',
  jessica: 'af_jessica',
  adam: 'am_adam',
  liam: 'am_liam'
};

export const AVAILABLE_VOICES: VoiceOption[] = [
  { id: 'hearth', name: 'Hearth', gender: 'female', accent: 'American', description: 'Warm and expressive' },
  { id: 'alloy', name: 'Alloy', gender: 'female', accent: 'Neutral', description: 'Crisp and professional' },
  { id: 'jessica', name: 'Jessica', gender: 'female', accent: 'American', description: 'Energetic and upbeat' },
  { id: 'adam', name: 'Adam', gender: 'male', accent: 'American', description: 'Deep and confident' },
  { id: 'liam', name: 'Liam', gender: 'male', accent: 'American', description: 'Friendly and modern' }
];

export class KokoroTTSService implements ITTSService {
  public readonly providerName = 'kokoro-js';
  private ttsInstance: any = null;
  private isInitializing = false;

  getAvailableVoices(): VoiceOption[] {
    return AVAILABLE_VOICES;
  }

  private async getTTS(): Promise<any> {
    if (this.ttsInstance) return this.ttsInstance;
    if (this.isInitializing) {
      // wait until initialized
      while (this.isInitializing) {
        await new Promise((r) => setTimeout(r, 100));
      }
      return this.ttsInstance;
    }

    try {
      this.isInitializing = true;
      const { KokoroTTS } = await import('kokoro-js');
      // Load Kokoro model
      console.log('[KokoroTTS] Initializing ONNX model...');
      this.ttsInstance = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-ONNX', {
        dtype: 'fp32'
      });
      console.log('[KokoroTTS] Model initialized successfully.');
      return this.ttsInstance;
    } catch (err) {
      console.error('[KokoroTTS] Failed to load model weights:', err);
      throw err;
    } finally {
      this.isInitializing = false;
    }
  }

  async generateSpeech(
    text: string,
    options: GenerateSpeechOptions
  ): Promise<{ durationSeconds: number; filePath: string }> {
    const outputDir = path.dirname(options.outputFilePath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const requestedVoice = (options.voice || 'hearth').toLowerCase();
    const kokoroVoiceId = VOICE_MAP[requestedVoice] || 'af_heart';

    try {
      const tts = await this.getTTS();
      const audio = await tts.generate(text, {
        voice: kokoroVoiceId,
        speed: options.speed || DEFAULT_TTS_SPEED
      });

      // Save to audio file
      await audio.save(options.outputFilePath);

      // Estimate or read duration
      // Kokoro audio sample rate is typically 24000Hz
      const sampleRate = audio.sampleRate || 24000;
      const durationSeconds = audio.audio?.length
        ? audio.audio.length / sampleRate
        : Math.max(1, text.split(' ').length * 0.4);

      return {
        durationSeconds,
        filePath: options.outputFilePath
      };
    } catch (error: any) {
      console.warn(`[KokoroTTS] Generation failed, falling back to silent synthetic audio: ${error?.message}`);
      // Fallback: create a dummy placeholder wav so video pipeline doesn't break
      const estimatedDuration = Math.max(1.5, text.split(' ').length * 0.35);
      await this.createSilentAudio(options.outputFilePath, estimatedDuration);
      return {
        durationSeconds: estimatedDuration,
        filePath: options.outputFilePath
      };
    }
  }

  private async createSilentAudio(outputPath: string, durationSeconds: number): Promise<void> {
    const ffmpeg = (await import('fluent-ffmpeg')).default;
    const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
    ffmpeg.setFfmpegPath(ffmpegPath);

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(`anullsrc=r=24000:cl=mono`)
        .inputFormat('lavfi')
        .duration(durationSeconds)
        .audioCodec('pcm_s16le')
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err: any) => reject(err))
        .run();
    });
  }
}
