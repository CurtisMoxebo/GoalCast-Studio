export type SocialPlatformId = 'facebook_reels' | 'instagram_reels' | 'tiktok' | 'youtube_shorts';

export interface PublishOptions {
  videoPath: string;
  description: string;
  targetDate: string;
  scheduledPostTime?: Date;
  thumbnailTimestamp?: number;
  groupId: string;
}

export interface PublishResult {
  success: boolean;
  platform: SocialPlatformId;
  remotePostId?: string;
  remoteUrl?: string;
  isSimulated?: boolean;
  warning?: string;
  error?: string;
  logs: string[];
}

export interface ISocialPublisher {
  readonly id: SocialPlatformId;
  readonly name: string;
  publish(options: PublishOptions): Promise<PublishResult>;
}

export interface SocialPipelineItemResult {
  platform: SocialPlatformId;
  platformName: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'IN_PROGRESS' | 'SIMULATED';
  isSimulated?: boolean;
  warning?: string;
  remotePostId?: string;
  remoteUrl?: string;
  error?: string;
  logs: string[];
  completedAt?: Date;
}

export interface SocialPipelineRunResult {
  pipelineId: string;
  groupId: string;
  status: 'COMPLETED' | 'PARTIALLY_FAILED' | 'FAILED' | 'SIMULATED';
  liveCount?: number;
  simulatedCount?: number;
  failedCount?: number;
  scheduledFor?: Date;
  items: SocialPipelineItemResult[];
}
