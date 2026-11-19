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
    // Look for resources in root folder or env
    this.resourcesDir =
      process.env.RESOURCES_DIR ||
      path.resolve(process.cwd(), '../resources');

    // Fallback if running from root directory
    if (!fs.existsSync(this.resourcesDir)) {
      const rootFallback = path.resolve(process.cwd(), 'resources');
      if (fs.existsSync(rootFallback)) {
        this.resourcesDir = rootFallback;
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
      .filter((file) => file.startsWith('background_video_') && file.endsWith('.mp4'))
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
      .filter(
        (file) =>
          (file.startsWith('background_audio_') || file.startsWith('background_track_')) &&
          (file.endsWith('.mp3') || file.endsWith('.wav'))
      )
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
