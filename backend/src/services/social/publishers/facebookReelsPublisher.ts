import fs from 'fs';
import { ISocialPublisher, PublishOptions, PublishResult, SocialPlatformId } from '../types';

export class FacebookReelsPublisher implements ISocialPublisher {
  public readonly id: SocialPlatformId = 'facebook_reels';
  public readonly name = 'Facebook Reels';

  public async publish(options: PublishOptions): Promise<PublishResult> {
    const logs: string[] = [];
    logs.push(`[Facebook] Initializing Facebook Reels scheduled upload for group "${options.groupId}"`);

    const pageId = process.env.FB_PAGE_ID || '';
    const pageToken = process.env.FB_PAGE_ACCESS_TOKEN || '';

    if (!pageId || !pageToken) {
      logs.push('[Facebook] ℹ No FB_PAGE_ID or FB_PAGE_ACCESS_TOKEN found in .env; executing in simulated mode');
      const simulatedId = `fb_reel_sim_${Date.now()}`;
      const remoteUrl = `https://www.facebook.com/reel/${simulatedId}`;
      logs.push(`[Facebook] ✅ Simulated schedule success for ${options.scheduledPostTime?.toISOString() || 'immediate'}: ${remoteUrl}`);
      return {
        success: true,
        platform: this.id,
        remotePostId: simulatedId,
        remoteUrl,
        logs
      };
    }

    try {
      const stat = fs.statSync(options.videoPath);
      const fileSize = stat.size;

      // Calculate Unix timestamp for scheduled publishing (Meta requires seconds)
      const scheduledEpoch = options.scheduledPostTime
        ? Math.floor(options.scheduledPostTime.getTime() / 1000)
        : Math.floor(Date.now() / 1000) + 45 * 60;

      // 1. Phase 1: Initialize Reel Upload
      logs.push(`[Facebook] Phase 1: Initializing Reel upload on Page ID ${pageId}...`);
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
      logs.push(`[Facebook] Phase 1 complete. Video ID: ${videoId}`);

      // 2. Phase 2: Binary Video Upload
      logs.push(`[Facebook] Phase 2: Uploading ${fileSize} bytes binary stream...`);
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
      logs.push('[Facebook] Phase 2 upload complete.');

      // 3. Phase 3: Finalize and Schedule Reel
      logs.push(`[Facebook] Phase 3: Scheduling Reel publish for Unix timestamp ${scheduledEpoch}...`);
      const desc = options.description || `Football Predictions ${options.targetDate} #reels #football`;
      const finishRes = await fetch(initUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          upload_phase: 'finish',
          access_token: pageToken,
          video_id: videoId,
          video_state: 'SCHEDULED',
          scheduled_publish_time: scheduledEpoch.toString(),
          description: desc
        })
      });

      if (!finishRes.ok) {
        const errText = await finishRes.text();
        throw new Error(`Facebook Reel finish/schedule failed (${finishRes.status}): ${errText}`);
      }

      const remoteUrl = `https://www.facebook.com/reel/${videoId}`;
      logs.push(`[Facebook] ✅ Reel successfully scheduled on Page! Video ID: ${videoId}, Link: ${remoteUrl}`);

      return {
        success: true,
        platform: this.id,
        remotePostId: videoId,
        remoteUrl,
        logs
      };
    } catch (err: any) {
      const msg = err?.message || 'Unknown Facebook Reel error';
      logs.push(`[Facebook] ❌ Failed: ${msg}`);
      return {
        success: false,
        platform: this.id,
        error: msg,
        logs
      };
    }
  }
}
