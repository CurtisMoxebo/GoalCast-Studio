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
    log(`[Instagram] Initializing Instagram Reels scheduled upload for group "${options.groupId}" (thumbnail timeframe: ${thumbSeconds}s / ${thumbOffsetMs}ms)`);

    const igUserId = process.env.INSTAGRAM_ACCOUNT_ID || '';
    const pageToken = process.env.FB_PAGE_ACCESS_TOKEN || '';

    log(`[Instagram] Credential check: INSTAGRAM_ACCOUNT_ID=${igUserId ? `Found (${igUserId})` : 'MISSING'}, FB_PAGE_ACCESS_TOKEN=${pageToken ? `Found (${pageToken.substring(0, 8)}...len=${pageToken.length})` : 'MISSING'}`);

    if (!igUserId || !pageToken) {
      logWarn('[Instagram] ℹ No INSTAGRAM_ACCOUNT_ID or FB_PAGE_ACCESS_TOKEN found in .env; executing in simulated mode');
      const simulatedId = `ig_reel_sim_${Date.now()}`;
      const remoteUrl = `https://www.instagram.com/reel/${simulatedId}`;
      logWarn(`[Instagram] ⚠️ Simulated schedule run for ${options.scheduledPostTime?.toISOString() || 'immediate'} (Missing INSTAGRAM_ACCOUNT_ID/FB_PAGE_ACCESS_TOKEN): ${remoteUrl}`);
      return {
        success: true,
        platform: this.id,
        isSimulated: true,
        warning: 'Missing INSTAGRAM_ACCOUNT_ID or FB_PAGE_ACCESS_TOKEN in .env',
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

      const scheduledEpoch = options.scheduledPostTime
        ? Math.floor(options.scheduledPostTime.getTime() / 1000)
        : undefined;

      log(`[Instagram] Creating media container with video URL: ${videoPublicUrl}, thumb_offset: ${thumbOffsetMs}ms (${thumbSeconds}s), cover URL: ${coverUrl}${scheduledEpoch ? `, scheduled_publish_time: ${scheduledEpoch}` : ' (instant publish)'}...`);
      
      const containerParams: Record<string, string> = {
        media_type: 'REELS',
        video_url: videoPublicUrl,
        caption,
        share_to_feed: 'true',
        thumb_offset: thumbOffsetMs.toString(),
        cover_url: coverUrl,
        access_token: pageToken
      };
      if (scheduledEpoch) {
        containerParams.scheduled_publish_time = scheduledEpoch.toString();
      }

      log(`[Instagram] Sending request to https://graph.facebook.com/v21.0/${igUserId}/media`);
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
      log(`[Instagram] Media container created successfully (Container ID: ${containerId})`);

      // For scheduled Instagram reels:
      // Instagram Graph API registers container and publishes at scheduled time
      log(`[Instagram] Scheduled container registered for ${options.scheduledPostTime?.toISOString() || 'publish time'}`);
      const remoteUrl = `https://www.instagram.com/reel/${containerId}`;
      log(`[Instagram] ✅ Instagram Reel container registered: ${remoteUrl}`);

      return {
        success: true,
        platform: this.id,
        isSimulated: false,
        remotePostId: containerId,
        remoteUrl,
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
