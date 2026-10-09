-- Two more office roles: CASHIER (payments only) and REGISTRAR (enrollment only).
-- STAFF keeps every staff permission; ADMIN stays the superadministrator.
-- AlterTable
ALTER TABLE `roles` MODIFY `name` ENUM('ADMIN', 'STAFF', 'CASHIER', 'REGISTRAR', 'STUDENT') NOT NULL;


-- The roles are part of the system itself (like the first three), so every database gets them.
INSERT IGNORE INTO `roles` (`name`, `description`) VALUES
  ('CASHIER', 'Cashier: records payments'),
  ('REGISTRAR', 'Registrar: student records and enrollment');
