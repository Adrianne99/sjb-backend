-- AlterTable
ALTER TABLE `enrollments` ADD COLUMN `fee_breakdown` JSON NULL,
    ADD COLUMN `payment_plan` ENUM('INSTALLMENT', 'EARLY_BIRD', 'CASH', 'SHS_NO_VOUCHER', 'SHS_VOUCHER') NULL;

-- CreateTable
CREATE TABLE `fee_schedules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `program_id` INTEGER NOT NULL,
    `year_level` INTEGER NOT NULL,
    `units` INTEGER NOT NULL DEFAULT 0,
    `rate_per_unit` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `misc_fee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `down_payment` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `prelim_payment` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `midterm_payment` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `early_bird_discount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `cash_discount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `annual_tuition` DECIMAL(12, 2) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fee_schedules_program_id_year_level_key`(`program_id`, `year_level`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `fee_schedules` ADD CONSTRAINT `fee_schedules_program_id_fkey` FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
