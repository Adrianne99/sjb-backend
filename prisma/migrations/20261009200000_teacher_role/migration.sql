-- TEACHER role: an instructor can get a login (instructors.user_id) to see their own classes and encode draft grades.
-- AlterTable
ALTER TABLE `instructors` ADD COLUMN `user_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `roles` MODIFY `name` ENUM('ADMIN', 'STAFF', 'CASHIER', 'REGISTRAR', 'TEACHER', 'STUDENT') NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `instructors_user_id_key` ON `instructors`(`user_id`);

-- AddForeignKey
ALTER TABLE `instructors` ADD CONSTRAINT `instructors_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


-- The role is part of the system itself, so every database gets it.
INSERT IGNORE INTO `roles` (`name`, `description`) VALUES ('TEACHER', 'Teacher: own classes, rosters and draft grades');
