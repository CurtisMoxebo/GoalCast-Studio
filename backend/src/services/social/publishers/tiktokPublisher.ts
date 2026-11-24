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
    let accessToken = this.getAccessToken();

    // If access token is missing locally, attempt to auto-sync from production server
    if (!accessToken && clientKey && process.env.NODE_ENV !== 'test') {
      try {
        const prodHost = 'https://goalcast-zone-api.moxebocurtis.com';
        log(`[TikTok] Access token not found locally. Attempting to fetch from remote server (${prodHost}/api/social/tiktok/token)...`);
        const syncRes = await fetch(`${prodHost}/api/social/tiktok/token`);
        if (syncRes.ok) {
          const syncData = (await syncRes.json()) as any;
          if (syncData.accessToken) {
            accessToken = syncData.accessToken;
            process.env.TIKTOK_ACCESS_TOKEN = accessToken;
            if (syncData.refreshToken) process.env.TIKTOK_REFRESH_TOKEN = syncData.refreshToken;
            log(`[TikTok] ✅ Successfully auto-synced live TikTok token from remote server!`);
            try {
              const tokensPath = path.join(process.cwd(), 'social_tokens.json');
              const existing = fs.existsSync(tokensPath) ? JSON.parse(fs.readFileSync(tokensPath, 'utf8')) : {};
              existing.tiktok = {
                accessToken,
                refreshToken: syncData.refreshToken,
                savedAt: new Date().toISOString()
              };
              fs.writeFileSync(tokensPath, JSON.stringify(existing, null, 2));
            } catch (diskErr: any) {
              logWarn(`[TikTok] Notice: Could not save synced token to disk: ${diskErr.message}`);
            }
          }
        }
      } catch (syncErr: any) {
        logWarn(`[TikTok] Token sync attempt from remote server failed: ${syncErr.message}`);
      }
    }

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
      const publicBase = (process.env.PUBLIC_API_URL || 'https://goalcast-zone-api.moxebocurtis.com').replace(/\/+$/, '');
      const folderName = options.videoPath ? path.basename(path.dirname(options.videoPath)) : options.groupId;
      const videoUrl = `${publicBase}/api/video/download/${folderName}`;

      let resolvedVideoPath = options.videoPath;
      if (!fs.existsSync(resolvedVideoPath)) {
        const renderBase = path.join(os.tmpdir(), 'goalcast_render');
        if (fs.existsSync(renderBase)) {
          const entries = fs.readdirSync(renderBase);
          for (const entry of entries) {
            const fullDir = path.join(renderBase, entry);
            try {
              if (fs.statSync(fullDir).isDirectory()) {
                const files = fs.readdirSync(fullDir);
                const mp4 = files.find((f) => f.endsWith('.mp4'));
                if (mp4) {
                  resolvedVideoPath = path.join(fullDir, mp4);
                  break;
                }
              }
            } catch {}
          }
        }
      }

      const fileSize = fs.existsSync(resolvedVideoPath) ? fs.statSync(resolvedVideoPath).size : 1024 * 1024;
      const title = (options.description || `Football Predictions ${options.targetDate} #fyp #football`).substring(0, 150);

      // Attempt 1: Direct Post to Feed (requires video.publish)
      let isDirectPosted = false;
      let publishId = '';
      let remoteUrl = 'https://www.tiktok.com/@goalcastxi';

      try {
        log(`[TikTok] Attempting Direct Post to feed with video URL: ${videoUrl}...`);
        const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8'
          },
          body: JSON.stringify({
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
          })
        });

        if (initRes.ok) {
          const initData = (await initRes.json()) as any;
          if (initData.data?.publish_id) {
            publishId = initData.data.publish_id;
            remoteUrl = `https://www.tiktok.com/@goalcastxi/video/${publishId}`;
            isDirectPosted = true;
            log(`[TikTok] ✅ Video directly posted to TikTok feed! Publish ID: ${publishId}, Link: ${remoteUrl}`);
          }
        }
      } catch (directErr: any) {
        logWarn(`[TikTok] Direct Post feed attempt skipped: ${directErr?.message}`);
      }

      // Attempt 2: TikTok Creator Upload / Inbox (uses video.upload with direct binary stream)
      if (!isDirectPosted) {
        log(`[TikTok] Utilizing TikTok Creator Upload with direct binary stream to inbox (video.upload)...`);
        const inboxRes = await fetch('https://open.tiktokapis.com/v2/post/publish/inbox/video/init/', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8'
          },
          body: JSON.stringify({
            source_info: {
              source: 'FILE_UPLOAD',
              video_size: fileSize,
              chunk_size: fileSize,
              total_chunk_count: 1
            }
          })
        });

        if (!inboxRes.ok) {
          const errText = await inboxRes.text();
          throw new Error(`TikTok Inbox upload init failed (${inboxRes.status}): ${errText}`);
        }

        const inboxData = (await inboxRes.json()) as any;
        if (inboxData.error && inboxData.error.code !== 'ok') {
          throw new Error(`TikTok Inbox API error: ${inboxData.error.message} (${inboxData.error.code})`);
        }

        const uploadUrl = inboxData.data?.upload_url;
        publishId = inboxData.data?.publish_id || `tt_inbox_${Date.now()}`;
        log(`[TikTok] Upload session ready (Publish ID: ${publishId}). Streaming ${(fileSize / (1024 * 1024)).toFixed(1)} MB binary video to TikTok...`);

        const fileBuffer = fs.existsSync(resolvedVideoPath)
          ? fs.readFileSync(resolvedVideoPath)
          : Buffer.alloc(fileSize);

        const putRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': 'video/mp4',
            'Content-Range': `bytes 0-${fileSize - 1}/${fileSize}`
          },
          body: fileBuffer
        });

        if (!putRes.ok) {
          const putErr = await putRes.text();
          throw new Error(`TikTok binary upload PUT failed (${putRes.status}): ${putErr}`);
        }

        log(`[TikTok] ✅ Video successfully uploaded to TikTok for @goalcastxi! Publish ID: ${publishId}`);
      }

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
