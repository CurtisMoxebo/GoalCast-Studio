import fs from 'fs';
import path from 'path';
import os from 'os';

export interface MediaAssetInfo {
  id: string;
  filename: string;
  name: string;
  type: 'video' | 'audio';
  path: string;
}

export const RESOURCE_SUBDIRS = {
  backgroundVideos: 'background_videos',
  backgroundAudio: 'background_audio',
  effects: 'effects',
  voicePreviews: 'voice_previews'
} as const;

const EFFECT_FILENAMES = new Set(['swoosh.mp3', 'celebration.mp3', 'confetti_splash.mp4']);

export class AssetsManager {
  private resourcesDir: string;

  constructor() {
    // Look for resources in env, /resources (Docker container), or local folder
    if (process.env.RESOURCES_DIR && fs.existsSync(process.env.RESOURCES_DIR)) {
      this.resourcesDir = process.env.RESOURCES_DIR;
    } else if (fs.existsSync('/resources')) {
      this.resourcesDir = '/resources';
    } else {
      this.resourcesDir = path.resolve(process.cwd(), '../resources');
      if (!fs.existsSync(this.resourcesDir)) {
        const rootFallback = path.resolve(process.cwd(), 'resources');
        if (fs.existsSync(rootFallback)) {
          this.resourcesDir = rootFallback;
        }
      }
    }

    // Automatically group any legacy flat files into their respective subfolders
    this.organizeResourcesDirectory();
  }

  getResourcesDir(): string {
    return this.resourcesDir;
  }

  getSubdirPath(key: keyof typeof RESOURCE_SUBDIRS): string {
    return path.join(this.resourcesDir, RESOURCE_SUBDIRS[key]);
  }

  /**
   * Ensures grouped subfolders exist (`background_videos`, `background_audio`,
   * `effects`, `voice_previews`) and safely migrates any legacy root-level files.
   */
  organizeResourcesDirectory(): void {
    if (!fs.existsSync(this.resourcesDir)) return;

    try {
      for (const subdir of Object.values(RESOURCE_SUBDIRS)) {
        const fullSubdir = path.join(this.resourcesDir, subdir);
        if (!fs.existsSync(fullSubdir)) {
          fs.mkdirSync(fullSubdir, { recursive: true });
        }
      }

      const entries = fs.readdirSync(this.resourcesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;

        const filename = entry.name;
        const lower = filename.toLowerCase();
        let targetSubdir: string | null = null;

        if (lower.startsWith('background_video_') && lower.endsWith('.mp4')) {
          targetSubdir = RESOURCE_SUBDIRS.backgroundVideos;
        } else if (
          (lower.startsWith('background_audio_') || lower.startsWith('background_track_')) &&
          (lower.endsWith('.mp3') || lower.endsWith('.wav'))
        ) {
          targetSubdir = RESOURCE_SUBDIRS.backgroundAudio;
        } else if (EFFECT_FILENAMES.has(lower)) {
          targetSubdir = RESOURCE_SUBDIRS.effects;
        } else if (lower.startsWith('voice_preview_') && lower.endsWith('.wav')) {
          targetSubdir = RESOURCE_SUBDIRS.voicePreviews;
        }

        if (targetSubdir) {
          const srcPath = path.join(this.resourcesDir, filename);
          const destPath = path.join(this.resourcesDir, targetSubdir, filename);
          if (!fs.existsSync(destPath)) {
            fs.renameSync(srcPath, destPath);
            console.log(`[AssetsManager] 📂 Moved "${filename}" -> ${targetSubdir}/${filename}`);
          }
        }
      }
    } catch (err: any) {
      console.warn('[AssetsManager] ⚠️ Could not auto-organize resources directory:', err?.message);
    }
  }

  getCustomUploadsDir(): string {
    const dir = path.join(os.tmpdir(), 'goalcast_render', 'custom_uploads');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  getAssetPath(filename: string): string {
    const safeName = path.basename(filename);

    // Ephemeral one-time custom uploads (used only for the generated video)
    if (safeName.startsWith('custom_video_') || safeName.startsWith('custom_audio_')) {
      const customCandidate = path.join(os.tmpdir(), 'goalcast_render', 'custom_uploads', safeName);
      if (fs.existsSync(customCandidate)) {
        return customCandidate;
      }
    }

    const searchOrder = [
      path.join(this.resourcesDir, RESOURCE_SUBDIRS.backgroundVideos, safeName),
      path.join(this.resourcesDir, RESOURCE_SUBDIRS.backgroundAudio, safeName),
      path.join(this.resourcesDir, RESOURCE_SUBDIRS.effects, safeName),
      path.join(this.resourcesDir, RESOURCE_SUBDIRS.voicePreviews, safeName),
      path.join(this.resourcesDir, safeName)
    ];

    for (const candidate of searchOrder) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return path.join(this.resourcesDir, safeName);
  }

  getAvailableBackgroundVideos(): MediaAssetInfo[] {
    const videosDir = this.getSubdirPath('backgroundVideos');
    const found = new Map<string, string>();

    // Primary: any .mp4 file inside resources/background_videos/
    if (fs.existsSync(videosDir)) {
      for (const file of fs.readdirSync(videosDir)) {
        if (file.toLowerCase().endsWith('.mp4')) {
          found.set(file, path.join(videosDir, file));
        }
      }
    }

    // Fallback: any legacy background_video_*.mp4 still in root resources/
    if (fs.existsSync(this.resourcesDir)) {
      for (const file of fs.readdirSync(this.resourcesDir)) {
        const lower = file.toLowerCase();
        if (lower.startsWith('background_video_') && lower.endsWith('.mp4') && !found.has(file)) {
          found.set(file, path.join(this.resourcesDir, file));
        }
      }
    }

    return Array.from(found.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, fullPath], idx) => ({
        id: file,
        filename: file,
        name: `Background Video ${idx + 1}`,
        type: 'video',
        path: fullPath
      }));
  }

  getAvailableBackgroundAudio(): MediaAssetInfo[] {
    const audioDir = this.getSubdirPath('backgroundAudio');
    const found = new Map<string, string>();

    // Primary: any .mp3 or .wav file inside resources/background_audio/
    if (fs.existsSync(audioDir)) {
      for (const file of fs.readdirSync(audioDir)) {
        const lower = file.toLowerCase();
        if (lower.endsWith('.mp3') || lower.endsWith('.wav')) {
          found.set(file, path.join(audioDir, file));
        }
      }
    }

    // Fallback: any legacy background_track_* or background_audio_* still in root resources/
    if (fs.existsSync(this.resourcesDir)) {
      for (const file of fs.readdirSync(this.resourcesDir)) {
        const lower = file.toLowerCase();
        if (
          (lower.startsWith('background_audio_') || lower.startsWith('background_track_')) &&
          (lower.endsWith('.mp3') || lower.endsWith('.wav')) &&
          !found.has(file)
        ) {
          found.set(file, path.join(this.resourcesDir, file));
        }
      }
    }

    return Array.from(found.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, fullPath], idx) => ({
        id: file,
        filename: file,
        name: `Background Beat ${idx + 1}`,
        type: 'audio',
        path: fullPath
      }));
  }

  getSoundEffects(): { swoosh: string; celebration: string } {
    return {
      swoosh: this.getAssetPath('swoosh.mp3'),
      celebration: this.getAssetPath('celebration.mp3')
    };
  }
}

export const assetsManager = new AssetsManager();
