-- CreateTable
CREATE TABLE `requirement_types` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(30) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `description` VARCHAR(500) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `requirement_types_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `student_requirements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `student_id` INTEGER NOT NULL,
    `requirement_type_id` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'SUBMITTED', 'VERIFIED') NOT NULL DEFAULT 'PENDING',
    `submitted_date` DATE NULL,
    `remarks` VARCHAR(255) NULL,
    `updated_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `student_requirements_requirement_type_id_status_idx`(`requirement_type_id`, `status`),
    UNIQUE INDEX `student_requirements_student_id_requirement_type_id_key`(`student_id`, `requirement_type_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `enrollment_subjects` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `enrollment_id` INTEGER NOT NULL,
    `section_id` INTEGER NOT NULL,
    `subject_id` INTEGER NOT NULL,
    `created_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `enrollment_subjects_section_id_subject_id_idx`(`section_id`, `subject_id`),
    UNIQUE INDEX `enrollment_subjects_enrollment_id_subject_id_key`(`enrollment_id`, `subject_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `student_requirements` ADD CONSTRAINT `student_requirements_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_requirements` ADD CONSTRAINT `student_requirements_requirement_type_id_fkey` FOREIGN KEY (`requirement_type_id`) REFERENCES `requirement_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_requirements` ADD CONSTRAINT `student_requirements_updated_by_id_fkey` FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollment_subjects` ADD CONSTRAINT `enrollment_subjects_enrollment_id_fkey` FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollment_subjects` ADD CONSTRAINT `enrollment_subjects_section_id_fkey` FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollment_subjects` ADD CONSTRAINT `enrollment_subjects_subject_id_fkey` FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollment_subjects` ADD CONSTRAINT `enrollment_subjects_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- The school's admission requirements (part of the system, not demo data).
-- Admins can rename, reorder or deactivate them in Settings -> Requirements.
INSERT IGNORE INTO `requirement_types` (`code`, `name`, `description`, `sort_order`, `is_active`, `updated_at`) VALUES
  ('FORM_137', 'Form 137 (Permanent Record)', 'The learner''s permanent academic record from the previous school.', 1, true, CURRENT_TIMESTAMP(3)),
  ('DIPLOMA', 'Diploma', 'Diploma or certificate of completion from the previous level.', 2, true, CURRENT_TIMESTAMP(3)),
  ('FORM_138', 'Report Card (Form 138)', 'The latest report card showing final grades.', 3, true, CURRENT_TIMESTAMP(3)),
  ('GOOD_MORAL', 'Certificate of Good Moral Character', 'Issued by the previous school.', 4, true, CURRENT_TIMESTAMP(3));
