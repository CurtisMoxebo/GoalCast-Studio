import fs from 'fs';
import { ISocialPublisher, PublishOptions, PublishResult, SocialPlatformId } from '../types';

export class FacebookReelsPublisher implements ISocialPublisher {
  public readonly id: SocialPlatformId = 'facebook_reels';
  public readonly name = 'Facebook Reels';

  public async publish(options: PublishOptions): Promise<PublishResult> {
    const logs: string[] = [];
    const log = (msg: string) => {
      logs.push(msg);
      console.log(msg);
    };
    const logWarn = (msg: string) => {
      logs.push(msg);
      console.warn(msg);
    };
    const logError = (msg: string) => {
      logs.push(msg);
      console.error(msg);
    };

    const thumbSeconds = typeof options.thumbnailTimestamp === 'number' && !isNaN(options.thumbnailTimestamp) ? options.thumbnailTimestamp : 3.0;
    const thumbOffsetMs = Math.round(thumbSeconds * 1000);
    log(`[Facebook] Initializing Facebook Reels upload for group "${options.groupId}" (thumbnail: ${thumbSeconds}s / ${thumbOffsetMs}ms)`);

    const pageId = process.env.FB_PAGE_ID || '';
    const pageToken = process.env.FB_PAGE_ACCESS_TOKEN || '';

    log(`[Facebook] Credential check: FB_PAGE_ID=${pageId ? `Found (${pageId})` : 'MISSING'}, FB_PAGE_ACCESS_TOKEN=${pageToken ? `Found (${pageToken.substring(0, 8)}...len=${pageToken.length})` : 'MISSING'}`);

    if (!pageId || !pageToken) {
      logWarn('[Facebook] ℹ No FB_PAGE_ID or FB_PAGE_ACCESS_TOKEN found in .env; executing in simulated mode');
      const simulatedId = `fb_reel_sim_${Date.now()}`;
      const remoteUrl = `https://www.facebook.com/reel/${simulatedId}`;
      logWarn(`[Facebook] ⚠️ Simulated schedule run for ${options.scheduledPostTime?.toISOString() || 'immediate'} (Missing FB_PAGE_ID/FB_PAGE_ACCESS_TOKEN): ${remoteUrl}`);
      return {
        success: true,
        platform: this.id,
        isSimulated: true,
        warning: 'Missing FB_PAGE_ID or FB_PAGE_ACCESS_TOKEN in .env',
        remotePostId: simulatedId,
        remoteUrl,
        logs
      };
    }

    try {
      const stat = fs.statSync(options.videoPath);
      const fileSize = stat.size;
      log(`[Facebook] Video binary file verified: ${options.videoPath} (${(fileSize / (1024 * 1024)).toFixed(2)} MB)`);

      // Calculate Unix timestamp for scheduled publishing if provided (Meta requires seconds)
      const scheduledEpoch = options.scheduledPostTime
        ? Math.floor(options.scheduledPostTime.getTime() / 1000)
        : undefined;

      // 1. Phase 1: Initialize Reel Upload
      log(`[Facebook] Phase 1: Initializing Reel upload on Page ID ${pageId}...`);
      const initUrl = `https://graph.facebook.com/v21.0/${pageId}/video_reels`;
      const initRes = await fetch(initUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          upload_phase: 'start',
          access_token: pageToken
        })
      });

      if (!initRes.ok) {
        const errText = await initRes.text();
        throw new Error(`Facebook Reel init failed (${initRes.status}): ${errText}`);
      }

      const initData = (await initRes.json()) as any;
      const videoId = initData.video_id;
      const uploadUrl = initData.upload_url;
      log(`[Facebook] Phase 1 complete. Assigned Video ID: ${videoId}, Upload URL: ${uploadUrl?.substring(0, 50)}...`);

      // 2. Phase 2: Binary Video Upload
      log(`[Facebook] Phase 2: Uploading ${fileSize} bytes binary stream...`);
      const fileBuffer = fs.readFileSync(options.videoPath);
      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `OAuth ${pageToken}`,
          offset: '0',
          file_size: fileSize.toString()
        },
        body: fileBuffer
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(`Facebook binary upload failed (${uploadRes.status}): ${errText}`);
      }
      log('[Facebook] Phase 2 upload complete. Binary stream accepted by Meta Graph API.');

      // 3. Phase 3: Finalize and Schedule/Publish Reel
      log(`[Facebook] Phase 3: Finalizing Reel (${scheduledEpoch ? `Scheduled publish for Unix timestamp ${scheduledEpoch}` : 'Immediate release'})...`);
      const desc = options.description || `Football Predictions ${options.targetDate} #reels #football`;
      const finishParams: Record<string, string> = {
        upload_phase: 'finish',
        access_token: pageToken,
        video_id: videoId,
        video_state: scheduledEpoch ? 'SCHEDULED' : 'PUBLISHED',
        description: desc,
        thumb_offset: thumbOffsetMs.toString()
      };
      if (scheduledEpoch) {
        finishParams.scheduled_publish_time = scheduledEpoch.toString();
      }

      const finishRes = await fetch(initUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(finishParams)
      });

      if (!finishRes.ok) {
        const errText = await finishRes.text();
        throw new Error(`Facebook Reel finish/schedule failed (${finishRes.status}): ${errText}`);
      }

      const remoteUrl = `https://www.facebook.com/reel/${videoId}`;
      log(`[Facebook] ✅ Reel successfully published/scheduled on Page! Video ID: ${videoId}, Link: ${remoteUrl}`);

      return {
        success: true,
        platform: this.id,
        isSimulated: false,
        remotePostId: videoId,
        remoteUrl,
        logs
      };
    } catch (err: any) {
      const msg = err?.message || 'Unknown Facebook Reel error';
      logError(`[Facebook] ❌ Failed: ${msg}`);
      if (err?.stack) console.error(err.stack);
      return {
        success: false,
        platform: this.id,
        error: msg,
        logs
      };
    }
  }
}
