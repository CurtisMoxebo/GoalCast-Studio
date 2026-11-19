declare module 'kokoro-js' {
  export class KokoroTTS {
    static from_pretrained(modelId: string, options?: any): Promise<KokoroTTS>;
    generate(text: string, options?: { voice?: string; speed?: number }): Promise<{
      audio: Float32Array;
      sampleRate: number;
      save(outputPath: string): Promise<void>;
    }>;
  }
}
