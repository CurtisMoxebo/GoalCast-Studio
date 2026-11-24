const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function checkMetaContainer(containerId, token) {
  if (!containerId || !token) return null;
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${containerId}?fields=id,status,status_code&access_token=${token}`);
    if (res.ok) {
      return await res.json();
    } else {
      return { error: await res.text() };
    }
  } catch (e) {
    return { error: e.message };
  }
}

async function main() {
  const token = process.env.FB_PAGE_ACCESS_TOKEN;

  const pipelines = await prisma.socialPostPipeline.findMany({
    where: {
      items: {
        some: {
          platform: 'instagram_reels'
        }
      }
    },
    include: {
      group: {
        include: {
          games: true
        }
      },
      items: {
        where: { platform: 'instagram_reels' }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  const results = [];
  for (const p of pipelines) {
    const item = p.items[0];
    let metaStatus = null;
    if (item && item.remotePostId) {
      metaStatus = await checkMetaContainer(item.remotePostId, token);
    }

    results.push({
      pipelineId: p.id,
      groupId: p.groupId,
      groupTitle: p.group?.title,
      matchDate: p.group?.date,
      totalGames: p.group?.games?.length || 0,
      scheduledFor: p.scheduledFor ? p.scheduledFor.toISOString() : 'Instant',
      pipelineStatus: p.status,
      createdAt: p.createdAt.toISOString(),
      instagram: {
        itemId: item?.id,
        status: item?.status,
        remotePostId: item?.remotePostId,
        remoteUrl: item?.remoteUrl,
        error: item?.error,
        metaLiveStatus: metaStatus
      }
    });
  }

  console.log(JSON.stringify(results, null, 2));
}

main().finally(() => prisma.$disconnect());
