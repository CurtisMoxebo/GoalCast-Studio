import * as FileSystem from 'expo-file-system/legacy';

export interface StorageMetadata {
  groupId: string;
  targetDate: string;
  videoUri: string;
  createdAt: string;
  title: string;
}

export class DeviceStorageService {
  private getStorageDir(): string {
    // Falls back gracefully in non-native test environments
    if (!FileSystem.documentDirectory) {
      return '/tmp/goalcast_videos/';
    }
    return `${FileSystem.documentDirectory}goalcast_videos/`;
  }

  async ensureDirectoryExists(): Promise<void> {
    try {
      const dir = this.getStorageDir();
      const info = await FileSystem.getInfoAsync(dir);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      }
    } catch (err) {
      console.warn('[DeviceStorage] Directory creation notice:', err);
    }
  }

  /**
   * Download and save video file to permanent mobile app storage
   */
  async saveVideoToDevice(downloadUrl: string, filename: string): Promise<string> {
    await this.ensureDirectoryExists();
    const destination = `${this.getStorageDir()}${filename}`;

    try {
      // If previous file exists (e.g. modify / re-generate), delete it first to replace
      const info = await FileSystem.getInfoAsync(destination);
      if (info.exists) {
        await FileSystem.deleteAsync(destination, { idempotent: true });
      }

      const downloadResult = await FileSystem.downloadAsync(downloadUrl, destination);
      return downloadResult.uri;
    } catch (err) {
      console.error('[DeviceStorage] Error saving video:', err);
      throw err;
    }
  }

  /**
   * Delete video file from device storage (e.g. on Cancel)
   */
  async deleteVideoFromDevice(filenameOrUri: string): Promise<void> {
    try {
      const uri = filenameOrUri.startsWith('file://')
        ? filenameOrUri
        : `${this.getStorageDir()}${filenameOrUri}`;

      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists) {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      }
    } catch (err) {
      console.warn('[DeviceStorage] Error deleting video file:', err);
    }
  }

  /**
   * Check if video file exists on mobile storage
   */
  async doesVideoExist(filenameOrUri: string): Promise<boolean> {
    try {
      const uri = filenameOrUri.startsWith('file://')
        ? filenameOrUri
        : `${this.getStorageDir()}${filenameOrUri}`;
      const info = await FileSystem.getInfoAsync(uri);
      return info.exists;
    } catch {
      return false;
    }
  }

  /**
   * List all locally saved videos
   */
  async listSavedVideos(): Promise<string[]> {
    try {
      await this.ensureDirectoryExists();
      const dir = this.getStorageDir();
      return await FileSystem.readDirectoryAsync(dir);
    } catch {
      return [];
    }
  }
}

export const deviceStorage = new DeviceStorageService();
