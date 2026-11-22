-- AlterTable
ALTER TABLE `prediction_groups` DROP COLUMN IF EXISTS `isHit`;

-- AlterTable
ALTER TABLE `prediction_selections` DROP COLUMN IF EXISTS `isHit`;

-- AlterTable
ALTER TABLE `game_predictions` DROP COLUMN IF EXISTS `realScore`,
    DROP COLUMN IF EXISTS `realOutcomeDetails`,
    DROP COLUMN IF EXISTS `evaluatedAt`;
