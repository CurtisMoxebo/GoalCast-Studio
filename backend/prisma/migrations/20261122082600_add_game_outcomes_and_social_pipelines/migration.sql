-- AlterTable
ALTER TABLE `game_predictions` ADD COLUMN `evaluatedAt` DATETIME(3) NULL,
    ADD COLUMN `realOutcome` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    ADD COLUMN `realOutcomeDetails` TEXT NULL,
    ADD COLUMN `realScore` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `prediction_groups` ADD COLUMN `groupOutcome` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    ADD COLUMN `scheduledPostTime` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `social_post_pipelines` (
    `id` VARCHAR(191) NOT NULL,
    `groupId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `scheduledFor` DATETIME(3) NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `logs` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `social_post_items` (
    `id` VARCHAR(191) NOT NULL,
    `pipelineId` VARCHAR(191) NOT NULL,
    `platform` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `remotePostId` TEXT NULL,
    `remoteUrl` TEXT NULL,
    `error` TEXT NULL,
    `logs` TEXT NULL,
    `attemptedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `social_post_pipelines` ADD CONSTRAINT `social_post_pipelines_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `prediction_groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `social_post_items` ADD CONSTRAINT `social_post_items_pipelineId_fkey` FOREIGN KEY (`pipelineId`) REFERENCES `social_post_pipelines`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
