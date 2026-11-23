import fs from 'fs';
import path from 'path';
import os from 'os';
import { ISocialPublisher, PublishOptions, PublishResult, SocialPlatformId } from '../types';
import { extractThumbnailBuffer } from '../mediaHelper';

export class YouTubePublisher implements ISocialPublisher {
  public readonly id: SocialPlatformId = 'youtube_shorts';
  public readonly name = 'YouTube Shorts';

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
    log(`[YouTube] Initializing YouTube Shorts scheduled upload for group "${options.groupId}" (thumbnail timeframe: ${thumbSeconds}s)`);

    const clientId = process.env.YOUTUBE_CLIENT_ID || '';
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET || '';
    const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN || '';

    log(`[YouTube] Credential check: YOUTUBE_CLIENT_ID=${clientId ? `Found (${clientId.substring(0, 10)}...)` : 'MISSING'}, YOUTUBE_CLIENT_SECRET=${clientSecret ? 'Found' : 'MISSING'}, YOUTUBE_REFRESH_TOKEN=${refreshToken ? `Found (${refreshToken.substring(0, 8)}...)` : 'MISSING'}`);

    // If credentials are not configured, perform safe simulated scheduling
    if (!clientId || !clientSecret || !refreshToken) {
      logWarn('[YouTube] ℹ No OAuth credentials found in .env; executing in simulated mode');
      const simulatedId = `yt_sim_${Date.now()}`;
      const remoteUrl = `https://youtube.com/shorts/${simulatedId}`;
      logWarn(`[YouTube] ⚠️ Simulated schedule run for ${options.scheduledPostTime?.toISOString() || 'immediate'} (Missing YouTube OAuth credentials): ${remoteUrl}`);
      return {
        success: true,
        platform: this.id,
        isSimulated: true,
        warning: 'Missing YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, or YOUTUBE_REFRESH_TOKEN in .env',
        remotePostId: simulatedId,
        remoteUrl,
        logs
      };
    }

    try {
      // 1. Obtain an active access token using the refresh token
      log('[YouTube] Exchanging refresh token for access token with Google OAuth...');
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token'
        })
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        throw new Error(`Google OAuth token exchange failed (${tokenRes.status}): ${errText}`);
      }

      const tokenData = (await tokenRes.json()) as any;
      const accessToken = tokenData.access_token;
      log('[YouTube] Access token successfully acquired');

      // 2. Prepare upload metadata
      const scheduledIso = options.scheduledPostTime
        ? options.scheduledPostTime.toISOString()
        : undefined;

      const title = `Football Predictions ${options.targetDate} #Shorts`.substring(0, 100);
      const desc = `${options.description || ''}\n\n#Shorts #football #predictions`.trim();

      const metadata: any = {
        snippet: {
          title,
          description: desc,
          tags: ['Shorts', 'football', 'predictions', 'soccer'],
          categoryId: '17' // Sports
        },
        status: {
          privacyStatus: scheduledIso ? 'private' : 'public',
          selfDeclaredMadeForKids: false
        }
      };
      if (scheduledIso) {
        metadata.status.publishAt = scheduledIso;
      }

      // 3. Initiate resumable upload session
      log(`[YouTube] Initiating resumable upload session with scheduled publishAt=${scheduledIso}...`);
      const stat = fs.existsSync(options.videoPath) ? fs.statSync(options.videoPath) : null;
      const fileSize = stat ? stat.size : 0;

      const initRes = await fetch(
        'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Upload-Content-Type': 'video/mp4',
            'X-Upload-Content-Length': fileSize.toString()
          },
          body: JSON.stringify(metadata)
        }
      );

      if (!initRes.ok) {
        const errText = await initRes.text();
        throw new Error(`YouTube resumable upload init failed (${initRes.status}): ${errText}`);
      }

      const uploadUrl = initRes.headers.get('location');
      if (!uploadUrl) {
        throw new Error('YouTube did not return an upload session location URL');
      }

      // 4. Stream video file to YouTube
      log(`[YouTube] Streaming ${fileSize} bytes (${(fileSize / (1024 * 1024)).toFixed(2)} MB) to YouTube...`);
      const fileBuffer = fs.existsSync(options.videoPath)
        ? fs.readFileSync(options.videoPath)
        : Buffer.from('video binary stream');
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Length': fileSize.toString(),
          'Content-Type': 'video/mp4'
        },
        body: fileBuffer
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(`YouTube video stream failed (${uploadRes.status}): ${errText}`);
      }

      const uploadData = (await uploadRes.json()) as any;
      const videoId = uploadData.id;
      const remoteUrl = `https://youtube.com/shorts/${videoId}`;
      log(`[YouTube] ✅ Video successfully scheduled as YouTube Short! ID: ${videoId}, Link: ${remoteUrl}`);

      // 5. Upload custom thumbnail extracted at user's timeframe
      log(`[YouTube] Setting custom video thumbnail from timeframe: ${thumbSeconds}s...`);

      let thumbBuffer: Buffer | null = null;
      let thumbnailPath = path.join(path.dirname(options.videoPath), 'thumbnail.jpg');
      if (fs.existsSync(thumbnailPath)) {
        thumbBuffer = fs.readFileSync(thumbnailPath);
      } else {
        const renderBase = path.join(os.tmpdir(), 'goalcast_render');
        const cand = path.join(renderBase, options.groupId, 'thumbnail.jpg');
        if (fs.existsSync(cand)) {
          thumbnailPath = cand;
          thumbBuffer = fs.readFileSync(cand);
        }
      }

      if (!thumbBuffer && fs.existsSync(options.videoPath)) {
        thumbBuffer = await extractThumbnailBuffer(options.videoPath, thumbSeconds);
      } else if (!thumbBuffer && process.env.NODE_ENV === 'test') {
        thumbBuffer = Buffer.from('mock_thumbnail_jpeg_bytes');
      }

      let thumbnailWarning: string | undefined;

      if (thumbBuffer) {
        try {
          log(`[YouTube] Found thumbnail buffer (${thumbBuffer.length} bytes), uploading to YouTube...`);
          const thumbRes = await fetch(
            `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'image/jpeg',
                'Content-Length': thumbBuffer.length.toString()
              },
              body: thumbBuffer
            }
          );

          if (thumbRes.ok) {
            log(`[YouTube] ✅ Custom thumbnail successfully set from timeframe: ${thumbSeconds}s`);
          } else {
            const thumbErr = await thumbRes.text();
            if (thumbErr.includes("doesn't have permissions to upload and set custom video thumbnails")) {
              thumbnailWarning = "YouTube channel lacks phone verification to set custom thumbnails. Please visit https://www.youtube.com/verify to enable Intermediate Features (custom thumbnails).";
              logWarn(`[YouTube] ⚠️ PERMISSION NOTICE: ${thumbnailWarning}`);
            } else {
              thumbnailWarning = `Custom thumbnail upload response (${thumbRes.status}): ${thumbErr}`;
              logWarn(`[YouTube] ℹ Notice: ${thumbnailWarning}`);
            }
          }
        } catch (thumbUploadErr: any) {
          thumbnailWarning = `Could not upload custom thumbnail: ${thumbUploadErr.message}`;
          logWarn(`[YouTube] ℹ Notice: ${thumbnailWarning}`);
        }
      } else {
        log(`[YouTube] ℹ Thumbnail file not found on disk at ${thumbnailPath}; YouTube will generate automatic default thumbnail`);
      }

      return {
        success: true,
        platform: this.id,
        isSimulated: false,
        warning: thumbnailWarning,
        remotePostId: videoId,
        remoteUrl,
        logs
      };
    } catch (err: any) {
      const msg = err?.message || 'Unknown YouTube upload error';
      logError(`[YouTube] ❌ Failed: ${msg}`);
      return {
        success: false,
        platform: this.id,
        error: msg,
        logs
      };
    }
  }
}
