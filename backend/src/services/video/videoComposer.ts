import path from 'path';
import fs from 'fs';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import { assetsManager } from './assetsManager';
import { overlayGenerator, OverlayGameData } from './overlayGenerator';
import { getTTSService } from '../tts/ttsFactory';

// Configure ffmpeg & ffprobe paths
try {
  const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
  const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
  if (ffmpegInstaller?.path) ffmpeg.setFfmpegPath(ffmpegInstaller.path);
  if (ffprobeInstaller?.path) ffmpeg.setFfprobePath(ffprobeInstaller.path);
} catch (e) {
  console.warn('[VideoComposer] Could not set ffmpeg binary from installer package:', e);
}

export interface VideoComposerInput {
  jobId: string;
  targetDate: string;
  games: OverlayGameData[];
  backgroundVideo?: string;
  backgroundAudio?: string;
  voiceActor?: string;
  thumbnailTimestamp?: number;
  previousWonGroup?: {
    games: OverlayGameData[];
  };
  onProgress?: (percent: number, step: string) => void;
}

export interface VideoComposerResult {
  videoPath: string;
  thumbnailPath: string;
  durationSeconds: number;
}

export class VideoComposer {
  private formatDisplayDate(dateStr: string): string {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  }

  async renderVideo(input: VideoComposerInput): Promise<VideoComposerResult> {
    const notify = (pct: number, msg: string) => {
      console.log(`[VideoComposer ${input.jobId}] ${pct}%: ${msg}`);
      input.onProgress?.(pct, msg);
    };

    notify(5, 'Initializing temporary render workspace');
    const workDir = path.join(os.tmpdir(), 'goalcast_render', input.jobId);
    if (!fs.existsSync(workDir)) fs.mkdirSync(workDir, { recursive: true });

    const formattedDate = this.formatDisplayDate(input.targetDate);
    const tts = getTTSService();
    const voice = input.voiceActor || 'hearth';
    const soundEffects = assetsManager.getSoundEffects();

    // 1. Generate Voice Audio Clips & Measure Timelines
    notify(15, 'Synthesizing voice actor speech clips with Kokoro TTS');

    // Speech 1: Intro
    const introText = `best ${input.games.length} predictions for the football games going on on ${formattedDate}`;
    const introAudioPath = path.join(workDir, 'speech_intro.wav');
    const introSpeech = await tts.generateSpeech(introText, {
      voice,
      outputFilePath: introAudioPath
    });

    // Optional Speech 2: Celebration recap
    let celebrationSpeech: { durationSeconds: number; filePath: string } | null = null;
    let celebrationAudioPath = '';
    if (input.previousWonGroup && input.previousWonGroup.games.length > 0) {
      celebrationAudioPath = path.join(workDir, 'speech_celebration.wav');
      celebrationSpeech = await tts.generateSpeech(
        'Congratulations everyone! Our last prediction was a success! We won big!',
        { voice, outputFilePath: celebrationAudioPath }
      );
    }

    // Speech 3: Transition
    const transAudioPath = path.join(workDir, 'speech_transition.wav');
    const transSpeech = await tts.generateSpeech('Here comes the predictions', {
      voice,
      outputFilePath: transAudioPath
    });

    // Speech 4: Match Predictions
    notify(30, 'Generating speech for each match prediction');
    const matchSpeeches: { durationSeconds: number; filePath: string }[] = [];
    for (let i = 0; i < input.games.length; i++) {
      const g = input.games[i];
      const predSpoken = g.selections?.[0]?.spokenText || 'Both teams to score';
      const matchText = `Match ${i + 1}, ${g.homeTeam} versus ${g.awayTeam}. ${predSpoken} stands out as the strongest outcome.`;
      const matchAudioPath = path.join(workDir, `speech_match_${i + 1}.wav`);
      const speech = await tts.generateSpeech(matchText, {
        voice,
        outputFilePath: matchAudioPath
      });
      matchSpeeches.push(speech);
    }

    // Speech 5: Outro
    const outroAudioPath = path.join(workDir, 'speech_outro.wav');
    const outroSpeech = await tts.generateSpeech(
      'Like and share this video if you find so that more people can win big like you! Don\'t forget to subscribe to get daily predictions.',
      { voice, outputFilePath: outroAudioPath }
    );

    // 2. Generate Graphic Overlays (PNGs)
    notify(45, 'Rendering high-resolution visual cards and graphics');
    const tableIntroPng = path.join(workDir, 'overlay_table_intro.png');
    await overlayGenerator.generateTableOverlay(input.games, formattedDate, tableIntroPng);

    let celebrationTablePng = '';
    if (input.previousWonGroup && input.previousWonGroup.games.length > 0) {
      celebrationTablePng = path.join(workDir, 'overlay_celebration.png');
      await overlayGenerator.generateCelebrationTableOverlay(
        input.previousWonGroup.games,
        celebrationTablePng
      );
    }

    const matchCardPngs: string[] = [];
    for (let i = 0; i < input.games.length; i++) {
      const g = input.games[i];
      const predLabel = g.selections?.[0]?.label || 'Both Teams to Score';
      const cardPath = path.join(workDir, `overlay_match_${i + 1}.png`);
      await overlayGenerator.generateMatchCardOverlay(
        g,
        i + 1,
        input.games.length,
        predLabel,
        cardPath
      );
      matchCardPngs.push(cardPath);
    }

    // 3. Compute Scene Durations
    // Scene 1: Intro table (0.5s slide in + introSpeech duration + 0.5s)
    const introDuration = Math.max(3.5, introSpeech.durationSeconds + 1.0);
    // Scene 2: Celebration (if enabled)
    const celebrationDuration = celebrationSpeech
      ? Math.max(4.0, celebrationSpeech.durationSeconds + 1.2)
      : 0;
    // Scene 3: "Here comes the predictions" transition
    const transDuration = Math.max(2.0, transSpeech.durationSeconds + 0.5);

    // Matches durations
    const matchDurations = matchSpeeches.map((s) => Math.max(3.8, s.durationSeconds + 1.0));
    const outroDuration = Math.max(4.0, outroSpeech.durationSeconds + 1.0);

    const totalDuration =
      introDuration +
      celebrationDuration +
      transDuration +
      matchDurations.reduce((a, b) => a + b, 0) +
      outroDuration;

    notify(60, `Timeline prepared. Total duration: ${totalDuration.toFixed(1)}s. Assembling master video.`);

    // 4. Resolve Background Video & Audio
    const bgVideoName = input.backgroundVideo || 'background_video_1.mp4';
    const bgAudioName = input.backgroundAudio || 'background_track_1.mp3';
    let bgVideoPath = assetsManager.getAssetPath(bgVideoName);
    let bgAudioPath = assetsManager.getAssetPath(bgAudioName);

    // Fallbacks if files not found
    if (!fs.existsSync(bgVideoPath)) {
      const available = assetsManager.getAvailableBackgroundVideos();
      if (available.length > 0) bgVideoPath = available[0].path;
    }
    if (!fs.existsSync(bgAudioPath)) {
      const available = assetsManager.getAvailableBackgroundAudio();
      if (available.length > 0) bgAudioPath = available[0].path;
    }

    const outputVideoPath = path.join(workDir, `final_goalcast_${input.jobId}.mp4`);
    const outputThumbPath = path.join(workDir, `thumbnail_${input.jobId}.jpg`);

    // 5. Build Combined Audio Track
    notify(70, 'Mixing voice track, sound effects, and background beat');
    const masterAudioPath = path.join(workDir, 'master_audio.wav');
    await this.assembleAudioTrack({
      workDir,
      masterAudioPath,
      totalDuration,
      introAudioPath,
      introDuration,
      celebrationAudioPath,
      celebrationDuration,
      celebrationSfxPath: soundEffects.celebration,
      transAudioPath,
      transDuration,
      matchAudioPaths: matchSpeeches.map((s) => s.filePath),
      matchDurations,
      outroAudioPath,
      swooshPath: soundEffects.swoosh,
      bgAudioPath
    });

    // 6. Render Video with Background Loop and Animated Graphic Overlays
    notify(85, 'Encoding 9:16 vertical video with FFmpeg');
    await this.composeVideoWithOverlays({
      totalDuration,
      bgVideoPath,
      masterAudioPath,
      tableIntroPng,
      introDuration,
      celebrationTablePng,
      celebrationDuration,
      matchCardPngs,
      matchDurations,
      transDuration,
      outputVideoPath
    });

    // 7. Extract Thumbnail at requested timestamp
    notify(95, 'Extracting thumbnail frame');
    const thumbTime = Math.min(
      Math.max(0, input.thumbnailTimestamp || 3.0),
      totalDuration - 0.5
    );
    await this.extractThumbnail(outputVideoPath, outputThumbPath, thumbTime);

    notify(100, 'Video generation completed successfully');
    return {
      videoPath: outputVideoPath,
      thumbnailPath: outputThumbPath,
      durationSeconds: totalDuration
    };
  }

  /**
   * Mix all voice clips, swoosh sound effects, celebration sound, and background music
   */
  private assembleAudioTrack(params: {
    workDir: string;
    masterAudioPath: string;
    totalDuration: number;
    introAudioPath: string;
    introDuration: number;
    celebrationAudioPath: string;
    celebrationDuration: number;
    celebrationSfxPath: string;
    transAudioPath: string;
    transDuration: number;
    matchAudioPaths: string[];
    matchDurations: number[];
    outroAudioPath: string;
    swooshPath: string;
    bgAudioPath: string;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      const command = ffmpeg();

      // Input 0: Background music (looped)
      command.input(params.bgAudioPath).inputOptions(['-stream_loop -1']);

      // Voice inputs and SFX
      command.input(params.introAudioPath); // Input 1: intro voice
      command.input(params.swooshPath);     // Input 2: swoosh SFX

      let inputCount = 3;

      let celebrationVoiceIdx = -1;
      let celebrationSfxIdx = -1;
      if (params.celebrationDuration > 0 && fs.existsSync(params.celebrationAudioPath)) {
        celebrationVoiceIdx = inputCount++;
        command.input(params.celebrationAudioPath);
        celebrationSfxIdx = inputCount++;
        command.input(params.celebrationSfxPath);
      }

      const transVoiceIdx = inputCount++;
      command.input(params.transAudioPath);

      const matchVoiceIndices: number[] = [];
      const matchSwooshIndices: number[] = [];
      for (const mPath of params.matchAudioPaths) {
        matchVoiceIndices.push(inputCount++);
        command.input(mPath);
        matchSwooshIndices.push(inputCount++);
        command.input(params.swooshPath);
      }

      const outroVoiceIdx = inputCount++;
      command.input(params.outroAudioPath);

      // Compute timeline offsets
      let currentOffset = 0.3; // start intro speech at 0.3s after initial swoosh
      const filterSteps: string[] = [];

      // 1. Background music at low volume (volume=0.10)
      filterSteps.push(`[0:a]volume=0.10,atrim=0:${params.totalDuration}[bgm]`);

      // 2. Intro voice & swoosh
      filterSteps.push(`[1:a]adelay=${Math.round(currentOffset * 1000)}|${Math.round(currentOffset * 1000)}[intro_v]`);
      filterSteps.push(`[2:a]adelay=0|0,volume=0.7[swoosh_0]`);

      currentOffset += params.introDuration;

      // 3. Celebration (if any)
      if (celebrationVoiceIdx >= 0) {
        filterSteps.push(
          `[${celebrationVoiceIdx}:a]adelay=${Math.round(currentOffset * 1000)}|${Math.round(currentOffset * 1000)}[celeb_v]`
        );
        filterSteps.push(
          `[${celebrationSfxIdx}:a]adelay=${Math.round(currentOffset * 1000)}|${Math.round(currentOffset * 1000)},volume=0.8[celeb_sfx]`
        );
        currentOffset += params.celebrationDuration;
      }

      // 4. Transition voice
      filterSteps.push(
        `[${transVoiceIdx}:a]adelay=${Math.round(currentOffset * 1000)}|${Math.round(currentOffset * 1000)}[trans_v]`
      );
      currentOffset += params.transDuration;

      // 5. Match voices & swooshes
      for (let i = 0; i < params.matchAudioPaths.length; i++) {
        const vIdx = matchVoiceIndices[i];
        const sIdx = matchSwooshIndices[i];
        const matchDur = params.matchDurations[i];

        // Swoosh as card slides in
        filterSteps.push(
          `[${sIdx}:a]adelay=${Math.round(currentOffset * 1000)}|${Math.round(currentOffset * 1000)},volume=0.6[swoosh_${i + 1}]`
        );
        // Voice starts slightly after card enters
        filterSteps.push(
          `[${vIdx}:a]adelay=${Math.round((currentOffset + 0.3) * 1000)}|${Math.round((currentOffset + 0.3) * 1000)}[match_v_${i}]`
        );

        currentOffset += matchDur;
      }

      // 6. Outro voice
      filterSteps.push(
        `[${outroVoiceIdx}:a]adelay=${Math.round(currentOffset * 1000)}|${Math.round(currentOffset * 1000)}[outro_v]`
      );

      // Collect all audio labels for amix
      const mixInputs = ['[bgm]', '[intro_v]', '[swoosh_0]'];
      if (celebrationVoiceIdx >= 0) {
        mixInputs.push('[celeb_v]', '[celeb_sfx]');
      }
      mixInputs.push('[trans_v]');
      for (let i = 0; i < params.matchAudioPaths.length; i++) {
        mixInputs.push(`[swoosh_${i + 1}]`, `[match_v_${i}]`);
      }
      mixInputs.push('[outro_v]');

      filterSteps.push(
        `${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=first:dropout_transition=2[aout]`
      );

      command
        .complexFilter(filterSteps.join(';'), ['aout'])
        .duration(params.totalDuration)
        .audioCodec('pcm_s16le')
        .output(params.masterAudioPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
  }

  /**
   * Render video background loop + animated sliding overlays
   */
  private composeVideoWithOverlays(params: {
    totalDuration: number;
    bgVideoPath: string;
    masterAudioPath: string;
    tableIntroPng: string;
    introDuration: number;
    celebrationTablePng?: string;
    celebrationDuration: number;
    matchCardPngs: string[];
    matchDurations: number[];
    transDuration: number;
    outputVideoPath: string;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      const command = ffmpeg();

      // Input 0: Background video loop
      command.input(params.bgVideoPath).inputOptions(['-stream_loop -1']);

      // Input 1: Master audio
      command.input(params.masterAudioPath);

      // Input 2: Intro Table PNG
      command.input(params.tableIntroPng);

      let overlayInputIdx = 3;
      let celebInputIdx = -1;
      if (params.celebrationDuration > 0 && params.celebrationTablePng && fs.existsSync(params.celebrationTablePng)) {
        celebInputIdx = overlayInputIdx++;
        command.input(params.celebrationTablePng);
      }

      const matchInputIndices: number[] = [];
      for (const cardPng of params.matchCardPngs) {
        matchInputIndices.push(overlayInputIdx++);
        command.input(cardPng);
      }

      // Filter Complex:
      // 1. Scale and crop video to 1080x1920 (9:16 portrait)
      const filters: string[] = [
        `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1[bg]`
      ];

      let lastVideoStage = '[bg]';
      let currentTime = 0;

      // Intro table: slides in from left (0 to 0.4s), stays until introDuration, slides out to left
      const introStart = 0;
      const introEnd = introStart + params.introDuration;
      filters.push(
        `${lastVideoStage}[2:v]overlay=x='if(lt(t,${introStart + 0.4}), -w + w*(t-${introStart})/0.4, if(gt(t,${introEnd - 0.4}), (w*(t-(${introEnd-0.4}))/0.4)*-1, (W-w)/2))':y='(H-h)/2':enable='between(t,${introStart},${introEnd})'[v_intro]`
      );
      lastVideoStage = '[v_intro]';
      currentTime = introEnd;

      // Celebration table (if present)
      if (celebInputIdx >= 0) {
        const celebStart = currentTime;
        const celebEnd = celebStart + params.celebrationDuration;
        filters.push(
          `${lastVideoStage}[${celebInputIdx}:v]overlay=x='if(lt(t,${celebStart + 0.4}), -w + w*(t-${celebStart})/0.4, if(gt(t,${celebEnd - 0.4}), (w*(t-(${celebEnd-0.4}))/0.4)*-1, (W-w)/2))':y='(H-h)/2':enable='between(t,${celebStart},${celebEnd})'[v_celeb]`
        );
        lastVideoStage = '[v_celeb]';
        currentTime = celebEnd;
      }

      // Transition time (clean view of background video while "Here comes the predictions" is spoken)
      currentTime += params.transDuration;

      // Match cards sequence
      for (let i = 0; i < matchInputIndices.length; i++) {
        const inputIdx = matchInputIndices[i];
        const matchDur = params.matchDurations[i];
        const matchStart = currentTime;
        const matchEnd = matchStart + matchDur;
        const nextStage = `[v_match_${i}]`;

        // Card slides in from left (-w to center in 0.35s), holds, then slides out to right (center to W+w in 0.35s)
        filters.push(
          `${lastVideoStage}[${inputIdx}:v]overlay=x='if(lt(t,${matchStart + 0.35}), -w + (W/2 + w/2)*(t-${matchStart})/0.35, if(gt(t,${matchEnd - 0.35}), (W-w)/2 + (W/2 + w/2)*(t-(${matchEnd-0.35}))/0.35, (W-w)/2))':y='(H-h)/2':enable='between(t,${matchStart},${matchEnd})'${nextStage}`
        );
        lastVideoStage = nextStage;
        currentTime = matchEnd;
      }

      command
        .complexFilter(filters.join(';'), [lastVideoStage.replace('[', '').replace(']', '')])
        .outputOptions([
          '-c:v libx264',
          '-preset veryfast',
          '-pix_fmt yuv420p',
          '-c:a aac',
          '-b:a 192k',
          '-shortest',
          '-movflags +faststart'
        ])
        .duration(params.totalDuration)
        .output(params.outputVideoPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
  }

  /**
   * Extract thumbnail frame at the user-specified frame time
   */
  private extractThumbnail(videoPath: string, outputPath: string, timeSeconds: number): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .seekInput(timeSeconds)
        .frames(1)
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
  }
}

export const videoComposer = new VideoComposer();
