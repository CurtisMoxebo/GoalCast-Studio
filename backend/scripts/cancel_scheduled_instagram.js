const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function deleteMetaContainer(containerId, token) {
  if (!containerId || !token) return null;
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${containerId}?access_token=${token}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    return data;
  } catch (e) {
    return { error: e.message };
  }
}

async function cancelAllScheduled() {
  const token = process.env.FB_PAGE_ACCESS_TOKEN;

  // Find all scheduled or staged Instagram post items
  const scheduledItems = await prisma.socialPostItem.findMany({
    where: {
      platform: 'instagram_reels',
      status: {
        in: ['SUCCESS', 'IN_PROGRESS', 'PENDING']
      },
      // Items that have a remote container ID but have not been published with a real URL yet, or have a scheduled_ placeholder
      OR: [
        { remoteUrl: null },
        { remoteUrl: { contains: 'scheduled_' } }
      ]
    },
    include: {
      pipeline: true
    }
  });

  console.log(`Found ${scheduledItems.length} scheduled Instagram items to cancel.`);

  const results = [];
  for (const item of scheduledItems) {
    let deleteResult = null;
    if (item.remotePostId) {
      deleteResult = await deleteMetaContainer(item.remotePostId, token);
    }

    // Update item status in database
    await prisma.socialPostItem.update({
      where: { id: item.id },
      data: {
        status: 'CANCELLED',
        error: 'Post schedule cancelled by user'
      }
    });

    // Update pipeline status if all items cancelled
    await prisma.socialPostPipeline.update({
      where: { id: item.pipelineId },
      data: {
        status: 'CANCELLED'
      }
    });

    results.push({
      itemId: item.id,
      containerId: item.remotePostId,
      pipelineId: item.pipelineId,
      scheduledFor: item.pipeline.scheduledFor,
      metaDeleteResponse: deleteResult,
      status: 'CANCELLED'
    });
  }

  console.log(JSON.stringify(results, null, 2));
}

cancelAllScheduled().finally(() => prisma.$disconnect());
