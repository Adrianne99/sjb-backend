-- Teacher tools: staff contact number (My Account), grade submissions for review, attendance.
-- AlterTable
ALTER TABLE `staff_profiles` ADD COLUMN `contact_number` VARCHAR(30) NULL;

-- CreateTable
CREATE TABLE `grade_submissions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `semester_id` INTEGER NOT NULL,
    `section_id` INTEGER NOT NULL,
    `subject_id` INTEGER NOT NULL,
    `instructor_id` INTEGER NULL,
    `status` ENUM('SUBMITTED', 'RETURNED', 'PUBLISHED') NOT NULL DEFAULT 'SUBMITTED',
    `submitted_by_id` INTEGER NOT NULL,
    `submitted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reviewed_by_id` INTEGER NULL,
    `reviewed_at` DATETIME(3) NULL,
    `note` VARCHAR(500) NULL,

    INDEX `grade_submissions_status_idx`(`status`),
    UNIQUE INDEX `grade_submissions_semester_id_section_id_subject_id_key`(`semester_id`, `section_id`, `subject_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance_records` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `enrollment_id` INTEGER NOT NULL,
    `subject_id` INTEGER NOT NULL,
    `section_id` INTEGER NOT NULL,
    `date` DATE NOT NULL,
    `status` ENUM('PRESENT', 'LATE', 'ABSENT', 'EXCUSED') NOT NULL,
    `recorded_by_id` INTEGER NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `attendance_records_section_id_subject_id_date_idx`(`section_id`, `subject_id`, `date`),
    UNIQUE INDEX `attendance_records_enrollment_id_subject_id_date_key`(`enrollment_id`, `subject_id`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `grade_submissions` ADD CONSTRAINT `grade_submissions_semester_id_fkey` FOREIGN KEY (`semester_id`) REFERENCES `semesters`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `grade_submissions` ADD CONSTRAINT `grade_submissions_section_id_fkey` FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `grade_submissions` ADD CONSTRAINT `grade_submissions_subject_id_fkey` FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `grade_submissions` ADD CONSTRAINT `grade_submissions_instructor_id_fkey` FOREIGN KEY (`instructor_id`) REFERENCES `instructors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `grade_submissions` ADD CONSTRAINT `grade_submissions_submitted_by_id_fkey` FOREIGN KEY (`submitted_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `grade_submissions` ADD CONSTRAINT `grade_submissions_reviewed_by_id_fkey` FOREIGN KEY (`reviewed_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_records` ADD CONSTRAINT `attendance_records_enrollment_id_fkey` FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_records` ADD CONSTRAINT `attendance_records_subject_id_fkey` FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_records` ADD CONSTRAINT `attendance_records_section_id_fkey` FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_records` ADD CONSTRAINT `attendance_records_recorded_by_id_fkey` FOREIGN KEY (`recorded_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

