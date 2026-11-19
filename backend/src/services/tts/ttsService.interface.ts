export type TTSVoice = 'hearth' | 'alloy' | 'jessica' | 'adam' | 'liam' | string;

export interface VoiceOption {
  id: TTSVoice;
  name: string;
  gender: 'female' | 'male';
  accent?: string;
  description?: string;
}

export interface GenerateSpeechOptions {
  voice?: TTSVoice;
  speed?: number;
  outputFilePath: string; // destination .wav or .mp3
}

export interface ITTSService {
  readonly providerName: string;
  getAvailableVoices(): VoiceOption[];
  generateSpeech(text: string, options: GenerateSpeechOptions): Promise<{ durationSeconds: number; filePath: string }>;
}
