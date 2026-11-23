import fs from 'fs';
import path from 'path';
import { ISocialPublisher, PublishOptions, PublishResult, SocialPlatformId } from '../types';

export class TikTokPublisher implements ISocialPublisher {
  public readonly id: SocialPlatformId = 'tiktok';
  public readonly name = 'TikTok';

  private getAccessToken(): string {
    if (process.env.TIKTOK_ACCESS_TOKEN) return process.env.TIKTOK_ACCESS_TOKEN;
    try {
      const tokensPath = path.join(process.cwd(), 'social_tokens.json');
      if (fs.existsSync(tokensPath)) {
        const data = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
        if (data.tiktok?.accessToken) return data.tiktok.accessToken;
      }
    } catch {
      // ignore
    }
    return '';
  }

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
    log(`[TikTok] Initializing TikTok scheduled upload for group "${options.groupId}" (thumbnail timeframe: ${thumbSeconds}s / ${thumbOffsetMs}ms)`);

    const clientKey = process.env.TIKTOK_CLIENT_KEY || '';
    const accessToken = this.getAccessToken();

    log(`[TikTok] Credential check: TIKTOK_CLIENT_KEY=${clientKey ? `Found (${clientKey})` : 'MISSING'}, TIKTOK_ACCESS_TOKEN=${accessToken ? `Found (${accessToken.substring(0, 8)}...len=${accessToken.length})` : 'MISSING'}`);

    // If access token is not yet generated from review OAuth, execute in graceful simulated mode
    if (!accessToken || !clientKey) {
      logWarn('[TikTok] ℹ Missing TIKTOK_CLIENT_KEY or TIKTOK_ACCESS_TOKEN; executing in simulated mode');
      const simulatedId = `tiktok_post_${Date.now()}`;
      const remoteUrl = `https://www.tiktok.com/@goalcastxi/video/${simulatedId}`;
      logWarn(`[TikTok] ⚠️ Simulated schedule run for ${options.scheduledPostTime?.toISOString() || 'immediate'} (Missing TikTok credentials): ${remoteUrl}`);
      return {
        success: true,
        platform: this.id,
        isSimulated: true,
        warning: 'Missing TIKTOK_CLIENT_KEY or TIKTOK_ACCESS_TOKEN in .env',
        remotePostId: simulatedId,
        remoteUrl,
        logs
      };
    }

    try {
      log(`[TikTok] Initializing Content Posting API with Client Key: ${clientKey}, cover_clip_timestamp_ms: ${thumbOffsetMs} (${thumbSeconds}s)...`);
      const publicBase = process.env.PUBLIC_API_URL || 'https://goalcast-zone-api.moxebocurtis.com';
      const videoUrl = `${publicBase}/api/video/download/${options.groupId}`;

      const title = (options.description || `Football Predictions ${options.targetDate} #fyp #football`).substring(0, 150);

      const requestBody = {
        post_info: {
          title,
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_duet: false,
          disable_stitch: false,
          disable_comment: false,
          cover_clip_timestamp_ms: thumbOffsetMs
        },
        source_info: {
          source: 'PULL_FROM_URL',
          video_url: videoUrl
        }
      };

      log(`[TikTok] Sending Direct Post Init request to https://open.tiktokapis.com/v2/post/publish/video/init/ with video URL: ${videoUrl}`);

      // TikTok Content Posting API Direct Post init
      const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8'
        },
        body: JSON.stringify(requestBody)
      });

      if (!initRes.ok) {
        const errText = await initRes.text();
        throw new Error(`TikTok Content Posting init failed (${initRes.status}): ${errText}`);
      }

      const initData = (await initRes.json()) as any;
      const publishId = initData.data?.publish_id || `tt_${Date.now()}`;
      const remoteUrl = `https://www.tiktok.com/@goalcastxi/video/${publishId}`;

      log(`[TikTok] ✅ Video scheduled on TikTok! Publish ID: ${publishId}, Link: ${remoteUrl}`);
      return {
        success: true,
        platform: this.id,
        isSimulated: false,
        remotePostId: publishId,
        remoteUrl,
        logs
      };
    } catch (err: any) {
      const msg = err?.message || 'Unknown TikTok upload error';
      logError(`[TikTok] ❌ Failed: ${msg}`);
      return {
        success: false,
        platform: this.id,
        error: msg,
        logs
      };
    }
  }
}
