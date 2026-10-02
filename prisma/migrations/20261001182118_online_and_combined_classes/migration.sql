-- DropForeignKey
ALTER TABLE `class_schedules` DROP FOREIGN KEY `class_schedules_room_id_fkey`;

-- DropIndex
DROP INDEX `class_schedules_room_id_fkey` ON `class_schedules`;

-- AlterTable
ALTER TABLE `class_schedules` ADD COLUMN `mode` ENUM('FACE_TO_FACE', 'ONLINE') NOT NULL DEFAULT 'FACE_TO_FACE',
    MODIFY `room_id` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `class_schedules` ADD CONSTRAINT `class_schedules_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
