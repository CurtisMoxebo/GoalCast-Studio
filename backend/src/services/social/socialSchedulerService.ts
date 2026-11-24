import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class SocialSchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private isChecking: boolean = false;

  /**
   * Calculates exact milliseconds remaining until the next 15-minute clock boundary (:00, :15, :30, :45)
   */
  public getMsUntilNext15MinQuarter(now: Date = new Date()): number {
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const ms = now.getMilliseconds();
    const currentQuarter = Math.floor(minutes / 15) * 15;
    const nextQuarter = currentQuarter + 15;
    const diffMinutes = nextQuarter - minutes;
    const delay = (diffMinutes * 60 - seconds) * 1000 - ms;
    return delay <= 0 ? 15 * 60 * 1000 : delay;
  }

  /**
   * Checks the database for any scheduled Instagram Reels that have reached their target time
   * and executes media_publish to release them live on Instagram.
   */
  public async checkAndPublishDuePosts(): Promise<number> {
    if (this.isChecking) return 0;
    this.isChecking = true;

    try {
      const now = new Date();
      // Query items that are staged (SUCCESS), not yet published live (remoteUrl is null or includes 'scheduled_'),
      // not CANCELLED, and where the pipeline scheduledFor timestamp has arrived (<= now)
      const dueItems = await prisma.socialPostItem.findMany({
        where: {
          platform: 'instagram_reels',
          status: 'SUCCESS',
          OR: [
            { remoteUrl: null },
            { remoteUrl: { contains: 'scheduled_' } }
          ],
          remotePostId: { not: null },
          pipeline: {
            status: { not: 'CANCELLED' },
            scheduledFor: {
              not: null,
              lte: now
            }
          }
        },
        include: {
          pipeline: true
        }
      });

      if (dueItems.length === 0) {
        return 0;
      }

      console.log(`[SocialScheduler] ⏰ Detected ${dueItems.length} due scheduled Instagram post(s). Initiating release...`);

      const igUserId = process.env.INSTAGRAM_ACCOUNT_ID;
      const pageToken = process.env.FB_PAGE_ACCESS_TOKEN;

      let publishedCount = 0;
      for (const item of dueItems) {
        const containerId = item.remotePostId!;
        console.log(`[SocialScheduler] Publishing container ${containerId} for pipeline ${item.pipelineId}...`);

        if (!igUserId || !pageToken) {
          console.warn(`[SocialScheduler] ⚠️ Missing INSTAGRAM_ACCOUNT_ID or FB_PAGE_ACCESS_TOKEN in environment. Skipping publish.`);
          continue;
        }

        try {
          const pubRes = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media_publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              creation_id: containerId,
              access_token: pageToken
            })
          });

          if (pubRes.ok) {
            const pubData = (await pubRes.json()) as any;
            console.log(`[SocialScheduler] ✅ Scheduled Reel successfully published live! Media ID: ${pubData.id}`);

            // Fetch live permalink
            let livePermalink: string | undefined;
            try {
              const permRes = await fetch(`https://graph.facebook.com/v21.0/${pubData.id}?fields=permalink&access_token=${pageToken}`);
              if (permRes.ok) {
                const permJson = (await permRes.json()) as any;
                livePermalink = permJson.permalink;
                console.log(`[SocialScheduler] 🔗 Live Reel Permalink: ${livePermalink}`);
              }
            } catch (_) {}

            const finalUrl = livePermalink || `https://www.instagram.com/reel/${pubData.id}/`;

            await prisma.socialPostItem.update({
              where: { id: item.id },
              data: {
                remotePostId: pubData.id,
                remoteUrl: finalUrl,
                completedAt: new Date()
              }
            });

            await prisma.socialPostPipeline.update({
              where: { id: item.pipelineId },
              data: {
                status: 'COMPLETED',
                completedAt: new Date()
              }
            });

            publishedCount++;
          } else {
            const pubErr = await pubRes.text();
            console.error(`[SocialScheduler] ❌ Publish failed for container ${containerId} (${pubRes.status}): ${pubErr}`);

            // If error is container expired (>24h) or does not exist, mark as failed in DB
            if (pubErr.includes('expired') || pubErr.includes('does not exist') || pubRes.status >= 400) {
              await prisma.socialPostItem.update({
                where: { id: item.id },
                data: {
                  status: 'FAILED',
                  error: `Instagram media_publish failed: ${pubErr}`
                }
              });
            }
          }
        } catch (postErr: any) {
          console.error(`[SocialScheduler] ❌ Execution error for container ${containerId}:`, postErr?.message);
        }
      }

      return publishedCount;
    } catch (err: any) {
      console.error(`[SocialScheduler] Error during scheduled check:`, err?.message);
      return 0;
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Starts the 15-minute aligned scheduler (:00, :15, :30, :45).
   */
  public start(): void {
    if (this.timer) return;

    console.log(`[SocialScheduler] 🕒 Initializing 15-minute aligned background scheduler (:00, :15, :30, :45)...`);

    // Check once immediately on boot to handle any posts that became due while offline
    this.checkAndPublishDuePosts().catch(() => {});

    // Schedule next run exactly on the next 15-minute mark (:00, :15, :30, :45)
    this.scheduleNextTick();
  }

  private scheduleNextTick(): void {
    const delayMs = this.getMsUntilNext15MinQuarter();
    const nextTickDate = new Date(Date.now() + delayMs);
    const timeStr = nextTickDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    console.log(`[SocialScheduler] ⏳ Next 15-minute check scheduled for ${timeStr} (~${(delayMs / 1000 / 60).toFixed(1)} mins from now).`);

    this.timer = setTimeout(async () => {
      try {
        console.log(`[SocialScheduler] ⏰ 15-minute clock mark reached (:00, :15, :30, :45). Verifying due scheduled posts...`);
        await this.checkAndPublishDuePosts();
      } finally {
        this.scheduleNextTick();
      }
    }, delayMs);

    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  /**
   * Stops the background scheduler
   */
  public stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      console.log(`[SocialScheduler] 🛑 Stopped background scheduler.`);
    }
  }
}

export const socialSchedulerService = new SocialSchedulerService();
