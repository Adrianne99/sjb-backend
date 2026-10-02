-- AlterTable
ALTER TABLE `announcements` ADD COLUMN `image_data` MEDIUMBLOB NULL,
    ADD COLUMN `image_type` VARCHAR(30) NULL,
    ADD COLUMN `image_updated_at` DATETIME(3) NULL;
