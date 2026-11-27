import dotenv from 'dotenv';
dotenv.config();
import { voicePreviewService } from '../services/tts/voicePreviewService';

async function main() {
  console.log('[GenerateVoicePreviews] Starting generation for all available voice actors...');
  const result = await voicePreviewService.ensureAllVoicePreviews();
  console.log('[GenerateVoicePreviews] Completed:', JSON.stringify(result));
  process.exit(0);
}

main().catch((err) => {
  console.error('[GenerateVoicePreviews] Error:', err);
  process.exit(1);
});
