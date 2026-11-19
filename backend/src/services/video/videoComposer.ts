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
        month: 'long'
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

    // Speech 4: Match Predictions (Split: Match Announcement + Prediction Reveal)
    notify(30, 'Generating speech for each match prediction');
    const matchIntroSpeeches: { durationSeconds: number; filePath: string }[] = [];
    const matchPredSpeeches: { durationSeconds: number; filePath: string }[] = [];

    for (let i = 0; i < input.games.length; i++) {
      const g = input.games[i];
      const predSpoken = g.selections?.[0]?.spokenText || 'Both teams to score';

      // 4a. Match Announcement (Spoken as game box slides in)
      const introText = `Match ${i + 1}, ${g.homeTeam} versus ${g.awayTeam}.`;
      const introAudioPath = path.join(workDir, `speech_match_${i + 1}_intro.wav`);
      const introSpeech = await tts.generateSpeech(introText, {
        voice,
        outputFilePath: introAudioPath
      });
      matchIntroSpeeches.push(introSpeech);

      // 4b. Prediction Text (Spoken when prediction text reveals on video)
      const predText = `${predSpoken} stands out as the strongest outcome.`;
      const predAudioPath = path.join(workDir, `speech_match_${i + 1}_pred.wav`);
      const predSpeech = await tts.generateSpeech(predText, {
        voice,
        outputFilePath: predAudioPath
      });
      matchPredSpeeches.push(predSpeech);
    }

    // Speech 5: Outro
    const outroAudioPath = path.join(workDir, 'speech_outro.wav');
    const outroSpeech = await tts.generateSpeech(
      'Like, share and subscribe to get more daily predictions.',
      { voice, outputFilePath: outroAudioPath }
    );

    // 2. Generate Graphic Overlays (PNGs)
    notify(45, 'Rendering high-resolution visual cards and graphics');
    const tableIntroPng = path.join(workDir, 'overlay_table_intro.png');
    await overlayGenerator.generateTableOverlay(input.games, input.targetDate, tableIntroPng);

    let celebrationTablePng = '';
    if (input.previousWonGroup && input.previousWonGroup.games.length > 0) {
      celebrationTablePng = path.join(workDir, 'overlay_celebration.png');
      await overlayGenerator.generateCelebrationTableOverlay(
        input.previousWonGroup.games,
        celebrationTablePng
      );
    }

    // Generate Single Game Section Box + Dedicated Prediction Banner for each match
    const matchCardPngs: string[] = [];
    const matchPredPngs: string[] = [];
    for (let i = 0; i < input.games.length; i++) {
      const g = input.games[i];
      const predLabel = g.selections?.[0]?.label || 'Both Teams to Score';
      const cardPath = path.join(workDir, `overlay_match_${i + 1}_card.png`);
      const predPath = path.join(workDir, `overlay_match_${i + 1}_pred.png`);

      await overlayGenerator.generateMatchCardOverlay(
        g,
        i + 1,
        input.games.length,
        cardPath
      );
      matchCardPngs.push(cardPath);

      await overlayGenerator.generatePredictionOverlay(
        predLabel,
        predPath
      );
      matchPredPngs.push(predPath);
    }

    // 3. Compute Scene Durations & Match Timelines
    const introDuration = Math.max(3.5, introSpeech.durationSeconds + 1.0);
    const celebrationDuration = celebrationSpeech
      ? Math.max(4.0, celebrationSpeech.durationSeconds + 1.2)
      : 0;
    const transDuration = Math.max(2.0, transSpeech.durationSeconds + 0.5);

    interface MatchSceneTimeline {
      introAudioPath: string;
      predAudioPath: string;
      cardPngPath: string;
      predPngPath: string;
      predRevealOffset: number;
      sceneDuration: number;
    }

    const matchScenes: MatchSceneTimeline[] = [];
    for (let i = 0; i < input.games.length; i++) {
      const introDur = matchIntroSpeeches[i].durationSeconds;
      const predDur = matchPredSpeeches[i].durationSeconds;
      const predRevealOffset = Math.max(2.2, 0.35 + introDur + 0.25);
      const sceneDuration = predRevealOffset + predDur + 1.1;

      matchScenes.push({
        introAudioPath: matchIntroSpeeches[i].filePath,
        predAudioPath: matchPredSpeeches[i].filePath,
        cardPngPath: matchCardPngs[i],
        predPngPath: matchPredPngs[i],
        predRevealOffset,
        sceneDuration
      });
    }

    const outroDuration = Math.max(4.0, outroSpeech.durationSeconds + 1.0);

    const totalDuration =
      introDuration +
      celebrationDuration +
      transDuration +
      matchScenes.reduce((acc, m) => acc + m.sceneDuration, 0) +
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
      matchScenes,
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
      matchScenes,
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
    matchScenes: {
      introAudioPath: string;
      predAudioPath: string;
      predRevealOffset: number;
      sceneDuration: number;
    }[];
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

      interface MatchAudioInputs {
        cardSwooshIdx: number;
        introVoiceIdx: number;
        predVoiceIdx: number;
      }

      const matchInputs: MatchAudioInputs[] = [];
      for (const m of params.matchScenes) {
        const cardSwooshIdx = inputCount++;
        command.input(params.swooshPath);

        const introVoiceIdx = inputCount++;
        command.input(m.introAudioPath);

        const predVoiceIdx = inputCount++;
        command.input(m.predAudioPath);

        matchInputs.push({ cardSwooshIdx, introVoiceIdx, predVoiceIdx });
      }

      const outroVoiceIdx = inputCount++;
      command.input(params.outroAudioPath);

      // Compute timeline offsets
      let currentOffset = 0.3; // start intro speech at 0.3s after initial swoosh
      const filterSteps: string[] = [];
      const wholeSamples = Math.ceil(params.totalDuration * 44100);

      // 1. Background music at low volume (volume=0.20)
      filterSteps.push(
        `[0:a]volume=0.20,atrim=0:${params.totalDuration},aformat=sample_rates=44100:channel_layouts=stereo[bgm]`
      );

      // 2. Intro voice & swoosh
      const introMs = Math.round(currentOffset * 1000);
      filterSteps.push(
        `[1:a]volume=1.5,aformat=sample_rates=44100:channel_layouts=stereo,adelay=${introMs}|${introMs},apad=whole_len=${wholeSamples}[intro_v]`
      );
      filterSteps.push(
        `[2:a]volume=1.0,aformat=sample_rates=44100:channel_layouts=stereo,adelay=0|0,apad=whole_len=${wholeSamples}[swoosh_0]`
      );

      currentOffset += params.introDuration;

      // 3. Celebration (if any)
      if (celebrationVoiceIdx >= 0) {
        const celebMs = Math.round(currentOffset * 1000);
        filterSteps.push(
          `[${celebrationVoiceIdx}:a]volume=1.5,aformat=sample_rates=44100:channel_layouts=stereo,adelay=${celebMs}|${celebMs},apad=whole_len=${wholeSamples}[celeb_v]`
        );
        filterSteps.push(
          `[${celebrationSfxIdx}:a]volume=1.1,aformat=sample_rates=44100:channel_layouts=stereo,adelay=${celebMs}|${celebMs},apad=whole_len=${wholeSamples}[celeb_sfx]`
        );
        currentOffset += params.celebrationDuration;
      }

      // 4. Transition voice
      const transMs = Math.round(currentOffset * 1000);
      filterSteps.push(
        `[${transVoiceIdx}:a]volume=1.5,aformat=sample_rates=44100:channel_layouts=stereo,adelay=${transMs}|${transMs},apad=whole_len=${wholeSamples}[trans_v]`
      );
      currentOffset += params.transDuration;

      // 5. Match voices & swooshes (Card enter swoosh -> Match intro announcement -> Prediction announcement without reveal swoosh)
      for (let i = 0; i < params.matchScenes.length; i++) {
        const m = params.matchScenes[i];
        const mi = matchInputs[i];

        const cardSwooshMs = Math.round(currentOffset * 1000);
        const introVoiceMs = Math.round((currentOffset + 0.35) * 1000);
        const predRevealTime = currentOffset + m.predRevealOffset;
        const predVoiceMs = Math.round((predRevealTime + 0.1) * 1000);

        // Swoosh as card slides in
        filterSteps.push(
          `[${mi.cardSwooshIdx}:a]volume=1.0,aformat=sample_rates=44100:channel_layouts=stereo,adelay=${cardSwooshMs}|${cardSwooshMs},apad=whole_len=${wholeSamples}[card_swoosh_${i}]`
        );
        // Match announcement voice
        filterSteps.push(
          `[${mi.introVoiceIdx}:a]volume=1.5,aformat=sample_rates=44100:channel_layouts=stereo,adelay=${introVoiceMs}|${introVoiceMs},apad=whole_len=${wholeSamples}[intro_v_${i}]`
        );
        // Prediction voice (revealed cleanly without swoosh)
        filterSteps.push(
          `[${mi.predVoiceIdx}:a]volume=1.5,aformat=sample_rates=44100:channel_layouts=stereo,adelay=${predVoiceMs}|${predVoiceMs},apad=whole_len=${wholeSamples}[pred_v_${i}]`
        );

        currentOffset += m.sceneDuration;
      }

      // 6. Outro voice
      const outroMs = Math.round(currentOffset * 1000);
      filterSteps.push(
        `[${outroVoiceIdx}:a]volume=1.5,aformat=sample_rates=44100:channel_layouts=stereo,adelay=${outroMs}|${outroMs},apad=whole_len=${wholeSamples}[outro_v]`
      );

      // Collect all audio labels for amix
      const mixInputs = ['[bgm]', '[intro_v]', '[swoosh_0]'];
      if (celebrationVoiceIdx >= 0) {
        mixInputs.push('[celeb_v]', '[celeb_sfx]');
      }
      mixInputs.push('[trans_v]');
      for (let i = 0; i < params.matchScenes.length; i++) {
        mixInputs.push(`[card_swoosh_${i}]`, `[intro_v_${i}]`, `[pred_v_${i}]`);
      }
      mixInputs.push('[outro_v]');

      // Mix without dropout volume renormalization, normalized with EBU R128 loudnorm for 100% uniform audio
      filterSteps.push(
        `${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=first:dropout_transition=999999,loudnorm=I=-16:TP=-1.5:LRA=11,aformat=sample_rates=44100:channel_layouts=stereo[aout]`
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
    matchScenes: {
      cardPngPath: string;
      predPngPath: string;
      predRevealOffset: number;
      sceneDuration: number;
    }[];
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

      const matchCardIndices: number[] = [];
      const matchPredIndices: number[] = [];
      for (const m of params.matchScenes) {
        matchCardIndices.push(overlayInputIdx++);
        command.input(m.cardPngPath);

        matchPredIndices.push(overlayInputIdx++);
        command.input(m.predPngPath);
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

      // Match cards sequence (Game section box slides in, then prediction text reveals below it)
      for (let i = 0; i < params.matchScenes.length; i++) {
        const m = params.matchScenes[i];
        const cardInputIdx = matchCardIndices[i];
        const predInputIdx = matchPredIndices[i];
        const matchStart = currentTime;
        const matchEnd = matchStart + m.sceneDuration;
        const predRevealTime = matchStart + m.predRevealOffset;
        const cardStage = `[v_card_${i}]`;
        const nextStage = `[v_match_${i}]`;

        // 1. Single game section box: slides in from left in 0.35s, stays, slides out to right at matchEnd - 0.35s
        filters.push(
          `${lastVideoStage}[${cardInputIdx}:v]overlay=x='if(lt(t,${matchStart + 0.35}), -w + (W/2 + w/2)*(t-${matchStart})/0.35, if(gt(t,${matchEnd - 0.35}), (W-w)/2 + (W/2 + w/2)*(t-(${matchEnd-0.35}))/0.35, (W-w)/2))':y='(H-h)/2':enable='between(t,${matchStart},${matchEnd})'${cardStage}`
        );

        // 2. Prediction text banner: revealed under the game box at predRevealTime, pops up slightly, slides out to right with card
        filters.push(
          `${cardStage}[${predInputIdx}:v]overlay=x='if(gt(t,${matchEnd - 0.35}), (W-w)/2 + (W/2 + w/2)*(t-(${matchEnd-0.35}))/0.35, (W-w)/2)':y='if(lt(t,${predRevealTime + 0.25}), (H-h)/2 + 60*(1 - (t-${predRevealTime})/0.25), (H-h)/2)':enable='between(t,${predRevealTime},${matchEnd})'${nextStage}`
        );

        lastVideoStage = nextStage;
        currentTime = matchEnd;
      }

      command
        .complexFilter(filters.join(';'))
        .outputOptions([
          `-map ${lastVideoStage}`,
          '-map 1:a',
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
