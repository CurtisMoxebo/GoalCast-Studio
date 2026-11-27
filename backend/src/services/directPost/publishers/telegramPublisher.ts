import fs from 'fs';
import path from 'path';
import {
  DirectMediaType,
  DirectPostPayload,
  DirectPostResult,
  IDirectPostPublisher
} from '../types';

/**
 * Telegram Channel Publisher for Direct Social Posts.
 * Supports photos now (`sendPhoto`) and videos (`sendVideo`) for future expansion.
 */
export class TelegramDirectPublisher implements IDirectPostPublisher {
  public readonly id = 'telegram';
  public readonly name = 'Telegram';
  public readonly subtitle = 'Channel broadcast · Text, photo & caption';
  public readonly color = '#229ED9';
  public readonly supportedMediaTypes: DirectMediaType[] = ['text', 'photo', 'video'];

  isConfigured(): boolean {
    return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
  }

  private buildTelegramPostUrl(chatId: string, messageId: number): string | undefined {
    const trimmed = chatId.trim();
    if (trimmed.startsWith('@')) {
      return `https://t.me/${trimmed.slice(1)}/${messageId}`;
    }
    if (trimmed.startsWith('-100')) {
      return `https://t.me/c/${trimmed.slice(4)}/${messageId}`;
    }
    return undefined;
  }

  private resolveMimeType(filename: string, mediaType: DirectMediaType): string {
    const ext = path.extname(filename).toLowerCase();
    if (mediaType === 'video') {
      if (ext === '.mov') return 'video/quicktime';
      if (ext === '.webm') return 'video/webm';
      return 'video/mp4';
    }
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    return 'image/jpeg';
  }

  async publish(payload: DirectPostPayload): Promise<DirectPostResult> {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const chatId = process.env.TELEGRAM_CHAT_ID?.trim();

    if (!token || !chatId) {
      return {
        platform: this.id,
        platformName: this.name,
        status: 'FAILED',
        error: 'Telegram is not configured (missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in .env).'
      };
    }

    if (payload.mediaType === 'text' || !payload.mediaPath) {
      const text = (payload.description || '').trim();
      if (!text) {
        return {
          platform: this.id,
          platformName: this.name,
          status: 'FAILED',
          error: 'Please enter a text description to post.'
        };
      }

      try {
        console.log(`[TelegramDirect] 📤 Sending text message to Telegram chat "${chatId}"...`);
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text
          })
        });

        const data: any = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok) {
          const errMsg = data?.description || `Telegram API error (HTTP ${response.status})`;
          console.error(`[TelegramDirect] ❌ Text post failed: ${errMsg}`);
          return {
            platform: this.id,
            platformName: this.name,
            status: 'FAILED',
            error: errMsg
          };
        }

        const messageId: number | undefined = data?.result?.message_id;
        const remoteUrl = messageId ? this.buildTelegramPostUrl(chatId, messageId) : undefined;
        console.log(`[TelegramDirect] ✅ Text posted to Telegram! Message ID: ${messageId}`);
        return {
          platform: this.id,
          platformName: this.name,
          status: 'SUCCESS',
          remotePostId: messageId ? String(messageId) : undefined,
          remoteUrl
        };
      } catch (err: any) {
        console.error(`[TelegramDirect] ❌ Text post unexpected error:`, err?.message);
        return {
          platform: this.id,
          platformName: this.name,
          status: 'FAILED',
          error: err?.message || 'Failed to publish text to Telegram'
        };
      }
    }

    if (!fs.existsSync(payload.mediaPath)) {
      return {
        platform: this.id,
        platformName: this.name,
        status: 'FAILED',
        error: 'Uploaded media file could not be found on server.'
      };
    }

    try {
      const fileBuffer = fs.readFileSync(payload.mediaPath);
      const effectiveFilename = payload.filename || (payload.mediaType === 'video' ? 'video.mp4' : 'photo.jpg');
      const mimeType = this.resolveMimeType(effectiveFilename, payload.mediaType);
      const blob = new Blob([fileBuffer], { type: mimeType });

      const caption = (payload.description || '').trim();
      const maxCaptionLen = 1024;
      const photoCaption = caption.length > maxCaptionLen ? caption.slice(0, maxCaptionLen) : caption;
      const overflowText = caption.length > maxCaptionLen ? caption.slice(maxCaptionLen).trim() : '';

      const endpoint = payload.mediaType === 'video' ? 'sendVideo' : 'sendPhoto';
      const fieldName = payload.mediaType === 'video' ? 'video' : 'photo';

      const form = new FormData();
      form.append('chat_id', chatId);
      form.append(fieldName, blob, effectiveFilename);
      if (photoCaption) {
        form.append('caption', photoCaption);
      }

      const apiUrl = `https://api.telegram.org/bot${token}/${endpoint}`;
      console.log(`[TelegramDirect] 📤 Sending ${payload.mediaType} to Telegram chat "${chatId}"...`);

      const response = await fetch(apiUrl, {
        method: 'POST',
        body: form
      });

      const data: any = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) {
        const errMsg = data?.description || `Telegram API error (HTTP ${response.status})`;
        console.error(`[TelegramDirect] ❌ Failed: ${errMsg}`);
        return {
          platform: this.id,
          platformName: this.name,
          status: 'FAILED',
          error: errMsg
        };
      }

      const messageId: number | undefined = data?.result?.message_id;

      // If description exceeded Telegram's 1024-char media caption limit, send remainder as follow-up
      if (overflowText) {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: overflowText,
            ...(messageId ? { reply_to_message_id: messageId } : {})
          })
        }).catch(() => {});
      }

      const remoteUrl = messageId ? this.buildTelegramPostUrl(chatId, messageId) : undefined;
      console.log(`[TelegramDirect] ✅ Posted to Telegram! Message ID: ${messageId}`);

      return {
        platform: this.id,
        platformName: this.name,
        status: 'SUCCESS',
        remotePostId: messageId ? String(messageId) : undefined,
        remoteUrl
      };
    } catch (err: any) {
      console.error(`[TelegramDirect] ❌ Unexpected error:`, err?.message);
      return {
        platform: this.id,
        platformName: this.name,
        status: 'FAILED',
        error: err?.message || 'Failed to publish to Telegram'
      };
    }
  }
}
