import { ISocialPublisher, PublishOptions, PublishResult, SocialPlatformId } from '../types';

export class InstagramReelsPublisher implements ISocialPublisher {
  public readonly id: SocialPlatformId = 'instagram_reels';
  public readonly name = 'Instagram Reels';

  public async publish(options: PublishOptions): Promise<PublishResult> {
    const logs: string[] = [];
    const thumbSeconds = typeof options.thumbnailTimestamp === 'number' && !isNaN(options.thumbnailTimestamp) ? options.thumbnailTimestamp : 3.0;
    const thumbOffsetMs = Math.round(thumbSeconds * 1000);
    logs.push(`[Instagram] Initializing Instagram Reels scheduled upload for group "${options.groupId}" (thumbnail timeframe: ${thumbSeconds}s / ${thumbOffsetMs}ms)`);

    const igUserId = process.env.INSTAGRAM_ACCOUNT_ID || '';
    const pageToken = process.env.FB_PAGE_ACCESS_TOKEN || '';

    if (!igUserId || !pageToken) {
      logs.push('[Instagram] ℹ No INSTAGRAM_ACCOUNT_ID or FB_PAGE_ACCESS_TOKEN found in .env; executing in simulated mode');
      const simulatedId = `ig_reel_sim_${Date.now()}`;
      const remoteUrl = `https://www.instagram.com/reel/${simulatedId}`;
      logs.push(`[Instagram] ⚠️ Simulated schedule run for ${options.scheduledPostTime?.toISOString() || 'immediate'} (Missing INSTAGRAM_ACCOUNT_ID/FB_PAGE_ACCESS_TOKEN): ${remoteUrl}`);
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
      logs.push(`[Instagram] Target Instagram Account ID: ${igUserId}`);

      // Public video and thumbnail cover download URL accessible by Meta's crawler
      const publicBase = process.env.PUBLIC_API_URL || 'https://goalcast-zone-api.moxebocurtis.com';
      const videoPublicUrl = `${publicBase}/api/video/download/${options.groupId}`;
      const coverUrl = `${publicBase}/api/video/thumbnail/${options.groupId}`;
      const caption = options.description || `Football Predictions ${options.targetDate} ⚽🔥 #reels #football #predictions #fyp`;

      const scheduledEpoch = options.scheduledPostTime
        ? Math.floor(options.scheduledPostTime.getTime() / 1000)
        : Math.floor(Date.now() / 1000) + 45 * 60;

      logs.push(`[Instagram] Creating media container with video URL: ${videoPublicUrl}, thumb_offset: ${thumbOffsetMs}ms (${thumbSeconds}s), cover URL: ${coverUrl}, scheduled_publish_time: ${scheduledEpoch}...`);
      
      const containerParams: Record<string, string> = {
        media_type: 'REELS',
        video_url: videoPublicUrl,
        caption,
        share_to_feed: 'true',
        thumb_offset: thumbOffsetMs.toString(),
        cover_url: coverUrl,
        scheduled_publish_time: scheduledEpoch.toString(),
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
      logs.push(`[Instagram] Media container created successfully (Container ID: ${containerId})`);

      // For scheduled Instagram reels:
      // Instagram Graph API registers container and publishes at scheduled time
      logs.push(`[Instagram] Scheduled container registered for ${options.scheduledPostTime?.toISOString() || 'publish time'}`);
      const remoteUrl = `https://www.instagram.com/reel/${containerId}`;

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
      logs.push(`[Instagram] ❌ Failed: ${msg}`);
      return {
        success: false,
        platform: this.id,
        error: msg,
        logs
      };
    }
  }
}
