-- The three roles are part of the system itself (not demo data), so every
-- database — including production — gets them automatically.
INSERT IGNORE INTO `roles` (`name`, `description`) VALUES
  ('ADMIN', 'Full system access'),
  ('STAFF', 'Registrar, accounting and academic staff'),
  ('STUDENT', 'Student portal access');
