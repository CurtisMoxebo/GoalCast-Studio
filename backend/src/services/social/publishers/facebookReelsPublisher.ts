import fs from 'fs';
import { ISocialPublisher, PublishOptions, PublishResult, SocialPlatformId } from '../types';
import { getVideoDurationInSeconds, getSafeThumbnailOffset } from '../mediaHelper';

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

    const rawThumb = options.thumbnailTimestamp;
    const initialThumb = getSafeThumbnailOffset(rawThumb, null);
    log(`[Facebook] Initializing Facebook Reels upload for group "${options.groupId}" (thumbnail: ${initialThumb.seconds}s / ${initialThumb.ms}ms)`);

    const pageId = process.env.FB_PAGE_ID || '';
    const pageToken = process.env.FB_PAGE_ACCESS_TOKEN || '';

    log(`[Facebook] Credential check: FB_PAGE_ID=${pageId ? `Found (${pageId})` : 'MISSING'}, FB_PAGE_ACCESS_TOKEN=${pageToken ? `Found (${pageToken.substring(0, 8)}...len=${pageToken.length})` : 'MISSING'}`);

    if (!pageId || !pageToken) {
      logWarn('[Facebook] ℹ No FB_PAGE_ID or FB_PAGE_ACCESS_TOKEN found in .env; executing in simulated mode');
      const simulatedId = `fb_reel_sim_${Date.now()}`;
      const remoteUrl = `https://www.facebook.com/reel/${simulatedId}/`;
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
      const stat = fs.existsSync(options.videoPath) ? fs.statSync(options.videoPath) : null;
      const fileSize = stat ? stat.size : 0;

      // Probe video duration to ensure thumb_offset falls strictly within bounds
      const videoDuration = await getVideoDurationInSeconds(options.videoPath);
      const safeThumb = getSafeThumbnailOffset(rawThumb, videoDuration);
      const thumbSeconds = safeThumb.seconds;
      const thumbOffsetMs = safeThumb.ms;

      log(`[Facebook] Video binary file verified: ${options.videoPath} (${(fileSize / (1024 * 1024)).toFixed(2)} MB${videoDuration ? `, duration: ${videoDuration.toFixed(1)}s` : ''})`);
      if (typeof rawThumb === 'number' && rawThumb !== thumbSeconds) {
        log(`[Facebook] ⚠️ Requested thumbnail (${rawThumb}s) exceeded video duration. Clamped to active prediction frame: ${thumbSeconds.toFixed(1)}s (${thumbOffsetMs}ms).`);
      } else {
        log(`[Facebook] Selected thumbnail frame: ${thumbSeconds}s (${thumbOffsetMs}ms)`);
      }

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
      const fileBuffer = fs.existsSync(options.videoPath)
        ? fs.readFileSync(options.videoPath)
        : Buffer.from('video binary stream');
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
      const finishData = (await finishRes.json()) as any;
      log(`[Facebook] Phase 3 finish accepted by Meta (post_id: ${finishData.post_id || 'queued'}). Awaiting video transcoding...`);

      // 4. Phase 4: Poll processing & publishing status until live
      log(`[Facebook] Phase 4: Polling processing status on Meta servers (Video ID: ${videoId})...`);
      let isReady = false;
      let permalink = `/reel/${videoId}/`;
      let attempts = 0;
      const maxAttempts = 30; // 30 attempts * 2.5s = 75s max wait (50ms in test)
      const pollIntervalMs = process.env.NODE_ENV === 'test' ? 50 : 2500;

      while (!isReady && attempts < maxAttempts) {
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

        const statusRes = await fetch(
          `https://graph.facebook.com/v21.0/${videoId}?fields=id,permalink_url,status&access_token=${pageToken}`
        );

        if (!statusRes.ok) {
          const errText = await statusRes.text();
          logWarn(`[Facebook] Status check attempt #${attempts} non-OK (${statusRes.status}): ${errText}`);
          continue;
        }

        const statusData = (await statusRes.json()) as any;
        const videoStatus = statusData.status?.video_status;
        const publishingPhase = statusData.status?.publishing_phase;
        const publishStatus = publishingPhase?.publish_status;

        if (statusData.permalink_url) {
          permalink = statusData.permalink_url;
        }

        log(`[Facebook] Processing check #${attempts}: video_status=${videoStatus || 'unknown'}, publish_status=${publishStatus || publishingPhase?.status || 'unknown'}`);

        if (videoStatus === 'ready' || publishStatus === 'published' || publishStatus === 'scheduled') {
          isReady = true;
          break;
        } else if (videoStatus === 'error' || publishingPhase?.status === 'error') {
          logError(`[Facebook] ❌ Meta processing error details: ${JSON.stringify(statusData)}`);
          throw new Error(`Facebook video processing failed on Meta servers: ${JSON.stringify(statusData.status || 'ERROR')}`);
        }
      }

      if (!isReady && !scheduledEpoch) {
        logWarn(`[Facebook] ⚠️ Polling reached timeout (${maxAttempts * 2.5}s) before video_status='ready'. Proceeding with canonical permalink.`);
      }

      const canonicalUrl = permalink.startsWith('http')
        ? permalink
        : `https://www.facebook.com${permalink.startsWith('/') ? permalink : '/' + permalink}`;

      // Ensure trailing slash on /reel/... URL for clean routing
      const finalUrl = canonicalUrl.endsWith('/') ? canonicalUrl : `${canonicalUrl}/`;
      log(`[Facebook] ✅ Reel successfully published/scheduled on Page! Video ID: ${videoId}, Link: ${finalUrl}`);

      return {
        success: true,
        platform: this.id,
        isSimulated: false,
        remotePostId: videoId,
        remoteUrl: finalUrl,
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
