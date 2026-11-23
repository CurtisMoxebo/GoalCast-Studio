import ffmpeg from 'fluent-ffmpeg';

try {
  const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
  const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
  if (ffmpegInstaller?.path) ffmpeg.setFfmpegPath(ffmpegInstaller.path);
  if (ffprobeInstaller?.path) ffmpeg.setFfprobePath(ffprobeInstaller.path);
} catch (e) {
  // Safe fallback if ffmpeg is in system PATH
}

/**
 * Returns exact duration of a local video file in seconds, or null if unreadable
 */
export function getVideoDurationInSeconds(videoPath: string): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err || !metadata?.format?.duration || isNaN(metadata.format.duration)) {
          resolve(null);
        } else {
          resolve(metadata.format.duration);
        }
      });
    } catch {
      resolve(null);
    }
  });
}

/**
 * Clamps a requested thumbnail timestamp (in seconds) to fall safely within video bounds.
 * Prevents out-of-bounds errors on social APIs (e.g. Meta Error 2207057 / silent fallback to 0.0s black frame).
 * When requested seconds exceeds video duration, clamps to the active prediction content window
 * (videoDuration - 5.0s) rather than the empty ending outro, ensuring prediction cards are shown.
 */
export function getSafeThumbnailOffset(
  requestedSeconds: number | undefined,
  videoDurationSeconds: number | null
): { seconds: number; ms: number } {
  let safeSec = typeof requestedSeconds === 'number' && !isNaN(requestedSeconds) ? requestedSeconds : 3.0;

  if (videoDurationSeconds && videoDurationSeconds > 0) {
    // Leave at least 5.0s margin before EOF on longer videos so we don't land in the empty ending outro
    const outroMargin = videoDurationSeconds > 10 ? 5.0 : 0.5;
    const maxAllowed = Math.max(1.5, videoDurationSeconds - outroMargin);
    if (safeSec > maxAllowed) {
      safeSec = maxAllowed;
    }
  }

  // Ensure minimum 1.0s so we don't land on the 0.0s black intro fade frame
  if (safeSec < 1.0) {
    safeSec = 1.0;
  }

  return {
    seconds: safeSec,
    ms: Math.round(safeSec * 1000)
  };
}
