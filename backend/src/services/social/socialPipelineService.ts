import prisma from '../../db/prisma';
import { socialPublisherRegistry } from './socialPublisherRegistry';
import { FacebookReelsPublisher } from './publishers/facebookReelsPublisher';
import { InstagramReelsPublisher } from './publishers/instagramReelsPublisher';
import { TikTokPublisher } from './publishers/tiktokPublisher';
import { YouTubePublisher } from './publishers/youtubePublisher';
import {
  PublishOptions,
  SocialPipelineItemResult,
  SocialPipelineRunResult
} from './types';

export class SocialPipelineService {
  constructor() {
    this.registerDefaultPublishers();
  }

  private registerDefaultPublishers(): void {
    // Register the 4 default platforms in pipeline sequence
    socialPublisherRegistry.register(new FacebookReelsPublisher());
    socialPublisherRegistry.register(new InstagramReelsPublisher());
    socialPublisherRegistry.register(new TikTokPublisher());
    socialPublisherRegistry.register(new YouTubePublisher());
  }

  /**
   * Execute scheduled posting across all registered social media platforms.
   * If any platform fails, it records the failure, logs the error, and moves to the next platform.
   */
  public async executePipeline(params: {
    groupId: string;
    videoPath: string;
    description: string;
    targetDate: string;
    scheduledPostTime: Date;
    thumbnailTimestamp?: number;
  }): Promise<SocialPipelineRunResult> {
    const { groupId, videoPath, description, targetDate, scheduledPostTime, thumbnailTimestamp } = params;
    const finalThumbTime = typeof thumbnailTimestamp === 'number' && !isNaN(thumbnailTimestamp) ? thumbnailTimestamp : 3.0;

    console.log(`\n================== [Social Pipeline Execution] ==================`);
    console.log(`[SocialPipeline] 🕒 Started at: ${new Date().toISOString()}`);
    console.log(`[SocialPipeline] 🎯 Group ID: ${groupId}`);
    console.log(`[SocialPipeline] 📅 Scheduled Post Time: ${scheduledPostTime.toISOString()}`);
    console.log(`[SocialPipeline] 🖼️ Thumbnail Timeframe: ${finalThumbTime}s`);
    console.log(`[SocialPipeline] 📝 Target Date: ${targetDate}`);
    console.log(`=================================================================\n`);

    // 1. Create or initialize Pipeline row in database
    let pipelineId = `pipe_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    try {
      const created = await prisma.socialPostPipeline.create({
        data: {
          groupId,
          status: 'RUNNING',
          scheduledFor: scheduledPostTime,
          startedAt: new Date()
        }
      });
      pipelineId = created.id;
    } catch (dbErr: any) {
      console.warn('[SocialPipeline] Notice: DB pipeline creation skipped (offline/test mode):', dbErr?.message);
    }

    const publishers = socialPublisherRegistry.getAll();
    const itemResults: SocialPipelineItemResult[] = [];
    let hasFailure = false;
    let hasSuccess = false;

    // 2. Execute each platform in sequence
    for (let index = 0; index < publishers.length; index++) {
      const publisher = publishers[index];
      console.log(`\n-----------------------------------------------------------------`);
      console.log(`[SocialPipeline] 🚀 [Step ${index + 1}/${publishers.length}] Publishing to ${publisher.name}...`);

      let itemId = `item_${Date.now()}_${index}`;
      try {
        const itemCreated = await prisma.socialPostItem.create({
          data: {
            pipelineId,
            platform: publisher.id,
            status: 'IN_PROGRESS',
            attemptedAt: new Date()
          }
        });
        itemId = itemCreated.id;
      } catch (err: any) {
        // Non-blocking for offline DB
      }

      const publishOptions: PublishOptions = {
        groupId,
        videoPath,
        description,
        targetDate,
        scheduledPostTime,
        thumbnailTimestamp: finalThumbTime
      };

      let result;
      try {
        result = await publisher.publish(publishOptions);
      } catch (execErr: any) {
        result = {
          success: false,
          platform: publisher.id,
          error: execErr?.message || 'Unexpected execution crash',
          logs: [`[${publisher.name}] Crash: ${execErr?.message}`]
        };
      }

      const completedAt = new Date();
      if (result.success) {
        hasSuccess = true;
        console.log(`[SocialPipeline] ✅ ${publisher.name} SUCCEEDED!`);
        if (result.remotePostId) console.log(`[SocialPipeline]    Post ID: ${result.remotePostId}`);
        if (result.remoteUrl) console.log(`[SocialPipeline]    URL: ${result.remoteUrl}`);

        itemResults.push({
          platform: publisher.id,
          platformName: publisher.name,
          status: 'SUCCESS',
          remotePostId: result.remotePostId,
          remoteUrl: result.remoteUrl,
          logs: result.logs,
          completedAt
        });

        try {
          await prisma.socialPostItem.update({
            where: { id: itemId },
            data: {
              status: 'SUCCESS',
              remotePostId: result.remotePostId,
              remoteUrl: result.remoteUrl,
              logs: result.logs.join('\n'),
              completedAt
            }
          });
        } catch {}
      } else {
        hasFailure = true;
        console.error(`[SocialPipeline] ❌ ${publisher.name} FAILED: ${result.error}`);
        console.log(`[SocialPipeline] ⏩ Resilient fail-safe: Continuing to next social platform...`);

        itemResults.push({
          platform: publisher.id,
          platformName: publisher.name,
          status: 'FAILED',
          error: result.error,
          logs: result.logs,
          completedAt
        });

        try {
          await prisma.socialPostItem.update({
            where: { id: itemId },
            data: {
              status: 'FAILED',
              error: result.error,
              logs: result.logs.join('\n'),
              completedAt
            }
          });
        } catch {}
      }
    }

    // 3. Finalize pipeline status
    let finalStatus: 'COMPLETED' | 'PARTIALLY_FAILED' | 'FAILED' = 'COMPLETED';
    if (hasFailure && hasSuccess) {
      finalStatus = 'PARTIALLY_FAILED';
    } else if (hasFailure && !hasSuccess) {
      finalStatus = 'FAILED';
    }

    console.log(`\n=================================================================`);
    console.log(`[SocialPipeline] 🏁 Pipeline finished with status: ${finalStatus}`);
    console.log(`[SocialPipeline] 📊 Summary: ${itemResults.filter((i) => i.status === 'SUCCESS').length}/${publishers.length} succeeded`);
    console.log(`=================================================================\n`);

    try {
      await prisma.socialPostPipeline.update({
        where: { id: pipelineId },
        data: {
          status: finalStatus,
          completedAt: new Date()
        }
      });
    } catch {}

    return {
      pipelineId,
      groupId,
      status: finalStatus,
      scheduledFor: scheduledPostTime,
      items: itemResults
    };
  }

  /**
   * Retrieve latest pipeline details and platform items for a prediction group
   */
  public async getPipelineForGroup(groupId: string): Promise<SocialPipelineRunResult | null> {
    try {
      const pipeline = await prisma.socialPostPipeline.findFirst({
        where: { groupId },
        orderBy: { createdAt: 'desc' },
        include: { items: true }
      });

      if (!pipeline) return null;

      const items: SocialPipelineItemResult[] = pipeline.items.map((item) => {
        const pub = socialPublisherRegistry.get(item.platform);
        return {
          platform: item.platform as any,
          platformName: pub ? pub.name : item.platform,
          status: item.status as any,
          remotePostId: item.remotePostId || undefined,
          remoteUrl: item.remoteUrl || undefined,
          error: item.error || undefined,
          logs: item.logs ? item.logs.split('\n') : [],
          completedAt: item.completedAt || undefined
        };
      });

      return {
        pipelineId: pipeline.id,
        groupId: pipeline.groupId,
        status: pipeline.status as any,
        scheduledFor: pipeline.scheduledFor || undefined,
        items
      };
    } catch (err: any) {
      console.warn('[SocialPipeline] getPipelineForGroup fallback:', err?.message);
      return null;
    }
  }
}

export const socialPipelineService = new SocialPipelineService();
