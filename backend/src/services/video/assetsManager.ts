import fs from 'fs';
import path from 'path';

export interface MediaAssetInfo {
  id: string;
  filename: string;
  name: string;
  type: 'video' | 'audio';
  path: string;
}

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
  }

  getResourcesDir(): string {
    return this.resourcesDir;
  }

  getAssetPath(filename: string): string {
    return path.join(this.resourcesDir, filename);
  }

  getAvailableBackgroundVideos(): MediaAssetInfo[] {
    if (!fs.existsSync(this.resourcesDir)) return [];

    const files = fs.readdirSync(this.resourcesDir);
    return files
      .filter((file) => {
        const lower = file.toLowerCase();
        return lower.startsWith('background_video_') && lower.endsWith('.mp4');
      })
      .sort()
      .map((file, idx) => ({
        id: file,
        filename: file,
        name: `Background Video ${idx + 1}`,
        type: 'video',
        path: path.join(this.resourcesDir, file)
      }));
  }

  getAvailableBackgroundAudio(): MediaAssetInfo[] {
    if (!fs.existsSync(this.resourcesDir)) return [];

    const files = fs.readdirSync(this.resourcesDir);
    return files
      .filter((file) => {
        const lower = file.toLowerCase();
        return (
          (lower.startsWith('background_audio_') || lower.startsWith('background_track_')) &&
          (lower.endsWith('.mp3') || lower.endsWith('.wav'))
        );
      })
      .sort()
      .map((file, idx) => ({
        id: file,
        filename: file,
        name: `Background Beat ${idx + 1}`,
        type: 'audio',
        path: path.join(this.resourcesDir, file)
      }));
  }

  getSoundEffects(): { swoosh: string; celebration: string } {
    return {
      swoosh: path.join(this.resourcesDir, 'swoosh.mp3'),
      celebration: path.join(this.resourcesDir, 'celebration.mp3')
    };
  }
}

export const assetsManager = new AssetsManager();
