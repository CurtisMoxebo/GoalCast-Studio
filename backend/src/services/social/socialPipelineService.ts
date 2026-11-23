import fs from 'fs';
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
    scheduledPostTime?: Date;
    thumbnailTimestamp?: number;
  }): Promise<SocialPipelineRunResult> {
    const { groupId, videoPath, description, targetDate, scheduledPostTime, thumbnailTimestamp } = params;
    const finalThumbTime = typeof thumbnailTimestamp === 'number' && !isNaN(thumbnailTimestamp) ? thumbnailTimestamp : 3.0;
    const pipelineStartTime = Date.now();

    let videoSizeMB = 'unknown';
    try {
      if (fs.existsSync(videoPath)) {
        videoSizeMB = (fs.statSync(videoPath).size / (1024 * 1024)).toFixed(2) + ' MB';
      }
    } catch {}

    console.log(`\n================== [Social Pipeline Execution] ==================`);
    console.log(`[SocialPipeline] 🕒 Started at: ${new Date().toISOString()}`);
    console.log(`[SocialPipeline] 🎯 Group ID: ${groupId}`);
    console.log(`[SocialPipeline] 🎬 Video File: ${videoPath} (${videoSizeMB})`);
    console.log(`[SocialPipeline] 📅 Mode: ${scheduledPostTime ? `SCHEDULED for ${scheduledPostTime.toISOString()}` : 'INSTANT (Immediate Publishing)'}`);
    console.log(`[SocialPipeline] 🖼️ Thumbnail Timeframe: ${finalThumbTime}s (${Math.round(finalThumbTime * 1000)}ms)`);
    console.log(`[SocialPipeline] 📝 Target Date: ${targetDate}`);
    console.log(`[SocialPipeline] 📄 Caption preview: "${description ? description.replace(/\n/g, ' ').substring(0, 80) : ''}..."`);
    console.log(`=================================================================\n`);

    // 1. Create or initialize Pipeline row in database
    let pipelineId = `pipe_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    try {
      console.log(`[SocialPipeline] 💾 Initializing database record for pipeline (groupId="${groupId}")...`);
      const created = await prisma.socialPostPipeline.create({
        data: {
          groupId,
          status: 'RUNNING',
          scheduledFor: scheduledPostTime,
          startedAt: new Date()
        }
      });
      pipelineId = created.id;
      console.log(`[SocialPipeline] ✅ Pipeline database entry created with ID: ${pipelineId}`);
    } catch (dbErr: any) {
      console.warn('[SocialPipeline] Notice: DB pipeline creation skipped (offline/test mode):', dbErr?.message);
    }

    const publishers = socialPublisherRegistry.getAll();
    const itemResults: SocialPipelineItemResult[] = [];
    console.log(`[SocialPipeline] 📋 Registered publishers queue (${publishers.length}): ${publishers.map((p) => p.name).join(', ')}`);

    // 2. Execute each platform in sequence
    for (let index = 0; index < publishers.length; index++) {
      const publisher = publishers[index];
      const stepStartTime = Date.now();
      console.log(`\n-----------------------------------------------------------------`);
      console.log(`[SocialPipeline] 🚀 [Step ${index + 1}/${publishers.length}] Publishing to ${publisher.name} (${publisher.id})...`);

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
        console.log(`[SocialPipeline] ⏳ Invoking publisher.publish() for ${publisher.name}...`);
        result = await publisher.publish(publishOptions);
      } catch (execErr: any) {
        console.error(`[SocialPipeline] 💥 Unexpected crash inside ${publisher.name}.publish():`, execErr);
        result = {
          success: false,
          platform: publisher.id,
          error: execErr?.message || 'Unexpected execution crash',
          logs: [`[${publisher.name}] Crash: ${execErr?.message}`]
        };
      }

      const stepDurationMs = Date.now() - stepStartTime;
      console.log(`[SocialPipeline] ⏱️ ${publisher.name} step finished in ${stepDurationMs}ms (success: ${result.success}, isSimulated: ${Boolean(result.isSimulated)})`);

      // Print all publisher internal log lines directly to stdout so they appear in server logs
      if (result.logs && result.logs.length > 0) {
        console.log(`[SocialPipeline] 📜 Detailed logs from ${publisher.name}:`);
        for (const logLine of result.logs) {
          console.log(`   │ ${logLine}`);
        }
      }

      const completedAt = new Date();
      if (result.success) {
        if (result.isSimulated) {
          console.log(`[SocialPipeline] ⚠️ ${publisher.name} SIMULATED (missing API credentials in .env)`);
          if (result.remotePostId) console.log(`[SocialPipeline]    Post ID: ${result.remotePostId}`);
          if (result.remoteUrl) console.log(`[SocialPipeline]    URL: ${result.remoteUrl}`);

          itemResults.push({
            platform: publisher.id,
            platformName: publisher.name,
            status: 'SIMULATED',
            isSimulated: true,
            warning: result.warning || 'Executed in simulated staging mode (missing API credentials in .env)',
            remotePostId: result.remotePostId,
            remoteUrl: result.remoteUrl,
            logs: result.logs,
            completedAt
          });

          try {
            await prisma.socialPostItem.update({
              where: { id: itemId },
              data: {
                status: 'SIMULATED',
                remotePostId: result.remotePostId,
                remoteUrl: result.remoteUrl,
                logs: result.logs.join('\n'),
                completedAt
              }
            });
          } catch {}
        } else {
          console.log(`[SocialPipeline] ✅ ${publisher.name} SUCCEEDED (LIVE POST)!`);
          if (result.remotePostId) console.log(`[SocialPipeline]    Post ID: ${result.remotePostId}`);
          if (result.remoteUrl) console.log(`[SocialPipeline]    URL: ${result.remoteUrl}`);

          itemResults.push({
            platform: publisher.id,
            platformName: publisher.name,
            status: 'SUCCESS',
            isSimulated: false,
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
        }
      } else {
        console.error(`[SocialPipeline] ❌ ${publisher.name} FAILED: ${result.error}`);
        console.log(`[SocialPipeline] ⏩ Resilient fail-safe: Continuing to next social platform...`);

        itemResults.push({
          platform: publisher.id,
          platformName: publisher.name,
          status: 'FAILED',
          isSimulated: false,
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
        } catch { }
      }
    }

    // 3. Finalize pipeline status
    const liveCount = itemResults.filter((i) => i.status === 'SUCCESS').length;
    const simulatedCount = itemResults.filter((i) => i.status === 'SIMULATED').length;
    const failedCount = itemResults.filter((i) => i.status === 'FAILED').length;

    let finalStatus: 'COMPLETED' | 'PARTIALLY_FAILED' | 'FAILED' | 'SIMULATED' = 'COMPLETED';
    if (failedCount > 0 && liveCount > 0) {
      finalStatus = 'PARTIALLY_FAILED';
    } else if (failedCount > 0 && liveCount === 0 && simulatedCount === 0) {
      finalStatus = 'FAILED';
    } else if (failedCount > 0 && simulatedCount > 0 && liveCount === 0) {
      finalStatus = 'PARTIALLY_FAILED';
    } else if (liveCount === 0 && simulatedCount > 0) {
      finalStatus = 'SIMULATED';
    } else {
      finalStatus = 'COMPLETED';
    }

    const totalPipelineDurationMs = Date.now() - pipelineStartTime;
    console.log(`\n=================================================================`);
    console.log(`[SocialPipeline] 🏁 Pipeline finished in ${totalPipelineDurationMs}ms with status: ${finalStatus}`);
    console.log(`[SocialPipeline] 📊 Summary: ${liveCount} live, ${simulatedCount} simulated, ${failedCount} failed`);
    for (const item of itemResults) {
      const badge = item.status === 'SUCCESS' ? '🟢 LIVE' : item.status === 'SIMULATED' ? '🟡 SIMULATED' : '🔴 FAILED';
      console.log(`  ${badge} [${item.platformName}]: ${item.remoteUrl || item.error || item.warning || item.status}`);
    }
    console.log(`=================================================================\n`);

    try {
      await prisma.socialPostPipeline.update({
        where: { id: pipelineId },
        data: {
          status: finalStatus,
          completedAt: new Date()
        }
      });
    } catch { }

    return {
      pipelineId,
      groupId,
      status: finalStatus,
      liveCount,
      simulatedCount,
      failedCount,
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
        const isSimulated = item.status === 'SIMULATED';
        return {
          platform: item.platform as any,
          platformName: pub ? pub.name : item.platform,
          status: item.status as any,
          isSimulated,
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
