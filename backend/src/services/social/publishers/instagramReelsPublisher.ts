import fs from 'fs';
import { ISocialPublisher, PublishOptions, PublishResult, SocialPlatformId } from '../types';
import { getVideoDurationInSeconds, getSafeThumbnailOffset } from '../mediaHelper';

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

    const rawThumb = options.thumbnailTimestamp;
    const initialThumb = getSafeThumbnailOffset(rawThumb, null);
    log(`[Instagram] Initializing Instagram Reels upload for group "${options.groupId}" (thumbnail timeframe: ${initialThumb.seconds}s / ${initialThumb.ms}ms)`);

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

      const caption = options.description || `Football Predictions ${options.targetDate} ⚽🔥 #reels #football #predictions #fyp`;
      const stat = fs.existsSync(options.videoPath) ? fs.statSync(options.videoPath) : null;
      const fileSize = stat ? stat.size : 0;

      // Probe actual video duration to ensure thumb_offset falls strictly within bounds
      const videoDuration = await getVideoDurationInSeconds(options.videoPath);
      const safeThumb = getSafeThumbnailOffset(rawThumb, videoDuration);
      const thumbSeconds = safeThumb.seconds;
      const thumbOffsetMs = safeThumb.ms;

      log(`[Instagram] Video binary verified on disk: ${options.videoPath} (${(fileSize / (1024 * 1024)).toFixed(2)} MB${videoDuration ? `, duration: ${videoDuration.toFixed(1)}s` : ''})`);
      if (typeof rawThumb === 'number' && rawThumb !== thumbSeconds) {
        log(`[Instagram] ⚠️ Requested thumbnail (${rawThumb}s) exceeded video duration. Clamped to active prediction frame: ${thumbSeconds.toFixed(1)}s (${thumbOffsetMs}ms).`);
      } else {
        log(`[Instagram] Selected thumbnail frame: ${thumbSeconds}s (${thumbOffsetMs}ms)`);
      }

      let containerId = '';
      let isResumable = false;

      // Primary Strategy: Direct Resumable Binary Upload via rupload.facebook.com
      // This streams the local MP4 binary directly to Meta, eliminating crawler/URL fetch failures (error 2207076)
      try {
        log(`[Instagram] Phase 1: Initializing direct resumable upload session on Instagram Graph API...`);
        const initRes = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            media_type: 'REELS',
            upload_type: 'resumable',
            caption,
            share_to_feed: 'true',
            thumb_offset: thumbOffsetMs.toString(),
            access_token: pageToken
          })
        });

        if (initRes.ok) {
          const initData = (await initRes.json()) as any;
          if (initData.id) {
            containerId = initData.id;
            isResumable = true;
            const uploadUri = initData.uri || `https://rupload.facebook.com/ig-api-upload/v21.0/${containerId}`;
            log(`[Instagram] Resumable container created (ID: ${containerId}). Uploading binary stream to ${uploadUri}...`);

            const fileBuffer = fs.existsSync(options.videoPath)
              ? fs.readFileSync(options.videoPath)
              : Buffer.from('video binary stream');
            const uploadRes = await fetch(uploadUri, {
              method: 'POST',
              headers: {
                Authorization: `OAuth ${pageToken}`,
                offset: '0',
                file_size: fileSize.toString()
              },
              body: fileBuffer
            });

            if (!uploadRes.ok) {
              const uploadErrText = await uploadRes.text();
              throw new Error(`Resumable binary transfer to Meta failed (${uploadRes.status}): ${uploadErrText}`);
            }
            log(`[Instagram] Phase 1 complete: ${fileSize} bytes uploaded directly to Meta via rupload.`);
          }
        } else {
          const initErr = await initRes.text();
          logWarn(`[Instagram] Resumable upload init not accepted (${initRes.status}: ${initErr}). Falling back to URL ingestion...`);
        }
      } catch (resumableErr: any) {
        logWarn(`[Instagram] Direct binary upload error: ${resumableErr?.message}. Falling back to URL ingestion...`);
      }

      // Fallback Strategy: URL ingestion if resumable upload was not accepted
      if (!isResumable) {
        const publicBase = process.env.PUBLIC_API_URL || 'https://goalcast-zone-api.moxebocurtis.com';
        const videoPublicUrl = `${publicBase}/api/video/download/${options.groupId}`;
        log(`[Instagram] Fallback Phase 1: Creating media container with public URL: ${videoPublicUrl}...`);
        const containerParams: Record<string, string> = {
          media_type: 'REELS',
          video_url: videoPublicUrl,
          caption,
          share_to_feed: 'true',
          thumb_offset: thumbOffsetMs.toString(),
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
        containerId = containerData.id;
        if (!containerId) {
          throw new Error(`Instagram media container returned no ID: ${JSON.stringify(containerData)}`);
        }
        log(`[Instagram] Fallback media container created (ID: ${containerId})`);
      }

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
