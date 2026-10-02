-- AlterTable
ALTER TABLE `announcements` ADD COLUMN `emailed_at` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `notify_school_records` BOOLEAN NOT NULL DEFAULT true;

-- Announcements that were already published before email existed count as
-- "already emailed", so students are not sent old news.
UPDATE `announcements` SET `emailed_at` = CURRENT_TIMESTAMP(3) WHERE `status` = 'PUBLISHED';
