-- Announcement categories (shown as a tag on the website). Existing announcements become GENERAL.
-- AlterTable
ALTER TABLE `announcements` ADD COLUMN `category` ENUM('GENERAL', 'ACADEMIC', 'EVENT', 'ANNOUNCEMENT') NOT NULL DEFAULT 'GENERAL';

