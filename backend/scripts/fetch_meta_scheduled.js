const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function run() {
  const token = process.env.FB_PAGE_ACCESS_TOKEN;
  const pageId = process.env.FB_PAGE_ID;
  const igUserId = process.env.INSTAGRAM_ACCOUNT_ID;

  console.log(`\n======================================================`);
  console.log(`[Meta Query] Page ID: ${pageId}, IG User ID: ${igUserId}`);
  console.log(`======================================================\n`);

  const report = {
    facebook: {
      pageId,
      scheduledPosts: [],
      scheduledVideos: [],
      error: null
    },
    instagram: {
      igUserId,
      stagedContainers: [],
      error: null
    }
  };

  // 1. Check Facebook Page Scheduled Posts
  if (pageId && token) {
    try {
      console.log(`Querying Facebook Page scheduled posts: GET /${pageId}/scheduled_posts...`);
      const fbSchedRes = await fetch(`https://graph.facebook.com/v21.0/${pageId}/scheduled_posts?fields=id,message,scheduled_publish_time,created_time,status&access_token=${token}`);
      const fbSchedData = await fbSchedRes.json();
      if (fbSchedRes.ok) {
        report.facebook.scheduledPosts = fbSchedData.data || [];
      } else {
        report.facebook.scheduledPostsError = fbSchedData;
      }
    } catch (e) {
      report.facebook.scheduledPostsError = e.message;
    }

    try {
      console.log(`Querying Facebook Page unpublished/scheduled video reels: GET /${pageId}/video_reels...`);
      const fbVidRes = await fetch(`https://graph.facebook.com/v21.0/${pageId}/video_reels?fields=id,video_status,status,scheduled_publish_time,updated_time&access_token=${token}`);
      const fbVidData = await fbVidRes.json();
      if (fbVidRes.ok) {
        report.facebook.scheduledVideos = (fbVidData.data || []).filter(v => v.scheduled_publish_time || v.video_status !== 'ready');
      } else {
        report.facebook.scheduledVideosError = fbVidData;
      }
    } catch (e) {
      report.facebook.scheduledVideosError = e.message;
    }
  }

  // 2. Check all Instagram Containers known in database
  if (token) {
    const igItems = await prisma.socialPostItem.findMany({
      where: {
        platform: 'instagram_reels',
        remotePostId: { not: null }
      },
      include: {
        pipeline: true
      },
      orderBy: { createdAt: 'desc' }
    });

    console.log(`Checking ${igItems.length} Instagram container IDs directly on Meta Graph API...`);
    for (const item of igItems) {
      try {
        const metaRes = await fetch(`https://graph.facebook.com/v21.0/${item.remotePostId}?fields=id,status,status_code&access_token=${token}`);
        const metaData = await metaRes.json();
        report.instagram.stagedContainers.push({
          containerId: item.remotePostId,
          pipelineId: item.pipelineId,
          dbStatus: item.status,
          scheduledFor: item.pipeline?.scheduledFor,
          metaGraphStatus: metaData
        });
      } catch (err) {
        report.instagram.stagedContainers.push({
          containerId: item.remotePostId,
          error: err.message
        });
      }
    }
  }

  console.log(JSON.stringify(report, null, 2));
}

run().finally(() => prisma.$disconnect());
