-- CreateTable
CREATE TABLE `applications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `reference_number` VARCHAR(20) NOT NULL,
    `status` ENUM('SUBMITTED', 'CONVERTED', 'REJECTED') NOT NULL DEFAULT 'SUBMITTED',
    `first_name` VARCHAR(100) NOT NULL,
    `middle_name` VARCHAR(100) NULL,
    `last_name` VARCHAR(100) NOT NULL,
    `suffix` VARCHAR(20) NULL,
    `date_of_birth` DATE NOT NULL,
    `sex` ENUM('MALE', 'FEMALE') NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `contact_number` VARCHAR(30) NOT NULL,
    `address_line` VARCHAR(255) NULL,
    `barangay` VARCHAR(100) NULL,
    `city` VARCHAR(100) NULL,
    `province` VARCHAR(100) NULL,
    `zip_code` VARCHAR(10) NULL,
    `guardian_name` VARCHAR(150) NULL,
    `guardian_relationship` VARCHAR(50) NULL,
    `guardian_contact_number` VARCHAR(30) NULL,
    `program_id` INTEGER NOT NULL,
    `year_level` INTEGER NOT NULL,
    `applicant_type` ENUM('NEW', 'TRANSFEREE', 'RETURNING') NOT NULL,
    `previous_school` VARCHAR(200) NULL,
    `privacy_consent_at` DATETIME(3) NOT NULL,
    `ip_address` VARCHAR(45) NULL,
    `remarks` VARCHAR(500) NULL,
    `reviewed_by_id` INTEGER NULL,
    `reviewed_at` DATETIME(3) NULL,
    `student_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `applications_reference_number_key`(`reference_number`),
    UNIQUE INDEX `applications_student_id_key`(`student_id`),
    INDEX `applications_status_created_at_idx`(`status`, `created_at`),
    INDEX `applications_last_name_first_name_idx`(`last_name`, `first_name`),
    INDEX `applications_email_idx`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `applications` ADD CONSTRAINT `applications_program_id_fkey` FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `applications` ADD CONSTRAINT `applications_reviewed_by_id_fkey` FOREIGN KEY (`reviewed_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `applications` ADD CONSTRAINT `applications_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
