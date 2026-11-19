-- CreateTable
CREATE TABLE `prediction_groups` (
    `id` VARCHAR(191) NOT NULL,
    `status` ENUM('PREVIEW', 'ACCEPTED', 'CANCELLED') NOT NULL DEFAULT 'PREVIEW',
    `targetDate` DATETIME(3) NOT NULL,
    `description` TEXT NOT NULL,
    `backgroundVideo` VARCHAR(191) NOT NULL DEFAULT 'background_video_1.mp4',
    `backgroundAudio` VARCHAR(191) NOT NULL DEFAULT 'background_track_1.mp3',
    `voiceActor` VARCHAR(191) NOT NULL DEFAULT 'hearth',
    `thumbnailTimestamp` DOUBLE NOT NULL DEFAULT 3.0,
    `isHit` BOOLEAN NULL,
    `validationNotes` TEXT NULL,
    `validationCheckedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `game_predictions` (
    `id` VARCHAR(191) NOT NULL,
    `groupId` VARCHAR(191) NOT NULL,
    `homeTeam` VARCHAR(191) NOT NULL,
    `homeTeamLogo` TEXT NULL,
    `awayTeam` VARCHAR(191) NOT NULL,
    `awayTeamLogo` TEXT NULL,
    `competition` VARCHAR(191) NOT NULL,
    `competitionLogo` TEXT NULL,
    `kickoffTime` DATETIME(3) NOT NULL,
    `orderIndex` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prediction_selections` (
    `id` VARCHAR(191) NOT NULL,
    `gamePredictionId` VARCHAR(191) NOT NULL,
    `category` ENUM('RESULT', 'GOALS', 'CORNERS') NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `spokenText` VARCHAR(191) NOT NULL,
    `isHit` BOOLEAN NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `game_predictions` ADD CONSTRAINT `game_predictions_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `prediction_groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prediction_selections` ADD CONSTRAINT `prediction_selections_gamePredictionId_fkey` FOREIGN KEY (`gamePredictionId`) REFERENCES `game_predictions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
