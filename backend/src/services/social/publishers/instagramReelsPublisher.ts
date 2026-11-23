import { ISocialPublisher, PublishOptions, PublishResult, SocialPlatformId } from '../types';

export class InstagramReelsPublisher implements ISocialPublisher {
  public readonly id: SocialPlatformId = 'instagram_reels';
  public readonly name = 'Instagram Reels';

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
    log(`[Instagram] Initializing Instagram Reels upload for group "${options.groupId}" (thumbnail timeframe: ${thumbSeconds}s / ${thumbOffsetMs}ms)`);

    const igUserId = process.env.INSTAGRAM_ACCOUNT_ID || '';
    const pageToken = process.env.FB_PAGE_ACCESS_TOKEN || '';

    log(`[Instagram] Credential check: INSTAGRAM_ACCOUNT_ID=${igUserId ? `Found (${igUserId})` : 'MISSING'}, FB_PAGE_ACCESS_TOKEN=${pageToken ? `Found (${pageToken.substring(0, 8)}...len=${pageToken.length})` : 'MISSING'}`);

    if (!igUserId || !pageToken || (process.env.NODE_ENV === 'test' && !process.env.TEST_LIVE_INSTAGRAM)) {
      logWarn('[Instagram] ℹ No INSTAGRAM_ACCOUNT_ID or FB_PAGE_ACCESS_TOKEN found in .env (or in test mode); executing in simulated mode');
      const simulatedId = `ig_reel_sim_${Date.now()}`;
      const remoteUrl = `https://www.instagram.com/reel/${simulatedId}`;
      logWarn(`[Instagram] ⚠️ Simulated schedule run for ${options.scheduledPostTime?.toISOString() || 'immediate'}: ${remoteUrl}`);
      return {
        success: true,
        platform: this.id,
        isSimulated: true,
        warning: 'Missing INSTAGRAM_ACCOUNT_ID or FB_PAGE_ACCESS_TOKEN in .env (or test mode)',
        remotePostId: simulatedId,
        remoteUrl,
        logs
      };
    }

    try {
      log(`[Instagram] Target Instagram Account ID: ${igUserId}`);

      // Public video and thumbnail cover download URL accessible by Meta's crawler
      const publicBase = process.env.PUBLIC_API_URL || 'https://goalcast-zone-api.moxebocurtis.com';
      const videoPublicUrl = `${publicBase}/api/video/download/${options.groupId}`;
      const coverUrl = `${publicBase}/api/video/thumbnail/${options.groupId}`;
      const caption = options.description || `Football Predictions ${options.targetDate} ⚽🔥 #reels #football #predictions #fyp`;

      // Phase 1: Create Media Container
      log(`[Instagram] Phase 1: Creating media container (video: ${videoPublicUrl}, thumb_offset: ${thumbOffsetMs}ms, cover: ${coverUrl})...`);
      const containerParams: Record<string, string> = {
        media_type: 'REELS',
        video_url: videoPublicUrl,
        caption,
        share_to_feed: 'true',
        thumb_offset: thumbOffsetMs.toString(),
        cover_url: coverUrl,
        access_token: pageToken
      };

      const containerRes = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(containerParams)
      });

      if (!containerRes.ok) {
        const errText = await containerRes.text();
        throw new Error(`Instagram media container creation failed (${containerRes.status}): ${errText}`);
      }

      const containerData = (await containerRes.json()) as any;
      const containerId = containerData.id;
      if (!containerId) {
        throw new Error(`Instagram media container creation returned no container ID: ${JSON.stringify(containerData)}`);
      }
      log(`[Instagram] Media container created successfully (Container ID: ${containerId})`);

      // Phase 2: Poll container status until Meta finishes processing the video
      log(`[Instagram] Phase 2: Polling container processing status on Meta servers (Container ID: ${containerId})...`);
      let isReady = false;
      let attempts = 0;
      const maxAttempts = 30; // 30 attempts * 3s = 90s max wait (50ms in test)
      const pollIntervalMs = process.env.NODE_ENV === 'test' ? 50 : 3000;

      while (!isReady && attempts < maxAttempts) {
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

        const statusRes = await fetch(
          `https://graph.facebook.com/v21.0/${containerId}?fields=status_code,status&access_token=${pageToken}`
        );

        if (!statusRes.ok) {
          const errText = await statusRes.text();
          throw new Error(`Instagram status check failed (${statusRes.status}): ${errText}`);
        }

        const statusData = (await statusRes.json()) as any;
        const statusCode = statusData.status_code;
        log(`[Instagram] Processing check #${attempts}: status_code=${statusCode || 'UNKNOWN'}`);

        if (statusCode === 'FINISHED') {
          isReady = true;
          break;
        } else if (statusCode === 'ERROR') {
          logError(`[Instagram] ❌ Meta processing error details: ${JSON.stringify(statusData)}`);
          throw new Error(`Instagram video processing failed on Meta's servers: ${statusData.status || 'ERROR'}`);
        } else if (statusCode === 'EXPIRED') {
          throw new Error('Instagram media container expired before publication.');
        }
        // 'IN_PROGRESS' continues to next poll iteration
      }

      if (!isReady) {
        throw new Error(`Instagram container video processing timed out after ${maxAttempts * 3} seconds.`);
      }

      // Phase 3: Publish the container using media_publish
      log(`[Instagram] Phase 3: Container is FINISHED. Publishing Reel to Instagram via media_publish...`);
      const publishRes = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          creation_id: containerId,
          access_token: pageToken
        })
      });

      if (!publishRes.ok) {
        const errText = await publishRes.text();
        throw new Error(`Instagram media_publish failed (${publishRes.status}): ${errText}`);
      }

      const publishData = (await publishRes.json()) as any;
      const publishedMediaId = publishData.id;
      if (!publishedMediaId) {
        throw new Error(`Instagram media_publish succeeded but returned no Media ID: ${JSON.stringify(publishData)}`);
      }
      log(`[Instagram] Media successfully published to Instagram! Published Media ID: ${publishedMediaId}`);

      // Phase 4: Fetch live permalink for the published Reel
      let liveUrl = `https://www.instagram.com/reel/${publishedMediaId}`;
      try {
        log(`[Instagram] Phase 4: Fetching live permalink for Media ID: ${publishedMediaId}...`);
        const permalinkRes = await fetch(
          `https://graph.facebook.com/v21.0/${publishedMediaId}?fields=permalink,shortcode&access_token=${pageToken}`
        );
        if (permalinkRes.ok) {
          const permalinkData = (await permalinkRes.json()) as any;
          if (permalinkData.permalink) {
            liveUrl = permalinkData.permalink;
            log(`[Instagram] Retrieved official permalink: ${liveUrl}`);
          }
        }
      } catch (permalinkErr: any) {
        logWarn(`[Instagram] Could not fetch permalink (non-critical, using standard URL format): ${permalinkErr?.message}`);
      }

      log(`[Instagram] ✅ Instagram Reel is LIVE: ${liveUrl}`);

      return {
        success: true,
        platform: this.id,
        isSimulated: false,
        remotePostId: publishedMediaId,
        remoteUrl: liveUrl,
        logs
      };
    } catch (err: any) {
      const msg = err?.message || 'Unknown Instagram Reel error';
      logError(`[Instagram] ❌ Failed: ${msg}`);
      return {
        success: false,
        platform: this.id,
        error: msg,
        logs
      };
    }
  }
}
