-- ============================================
-- Migration 008: Seed Schedule Definitions
-- ============================================
-- Schedule rules:
--   Katan, Noar: Saturdays only
--   Pre-SOM: Mondays + Saturdays
--   SOM: Wednesdays + Saturdays
-- Season: mid-September 2025 → mid-May 2026

-- Katan — Saturday (day_of_week = 6)
INSERT INTO schedules (group_id, name, day_of_week, start_time, duration_minutes, effective_from, effective_until)
SELECT g.id, 'Saturday Program', 6, '09:00', 120, '2025-09-13', '2026-05-16'
FROM groups g WHERE g.slug = 'katan';

-- Noar — Saturday (day_of_week = 6)
INSERT INTO schedules (group_id, name, day_of_week, start_time, duration_minutes, effective_from, effective_until)
SELECT g.id, 'Saturday Program', 6, '09:00', 120, '2025-09-13', '2026-05-16'
FROM groups g WHERE g.slug = 'noar';

-- Pre-SOM — Monday (day_of_week = 1)
INSERT INTO schedules (group_id, name, day_of_week, start_time, duration_minutes, effective_from, effective_until)
SELECT g.id, 'Monday Meeting', 1, '17:00', 120, '2025-09-15', '2026-05-11'
FROM groups g WHERE g.slug = 'pre-som';

-- Pre-SOM — Saturday (day_of_week = 6)
INSERT INTO schedules (group_id, name, day_of_week, start_time, duration_minutes, effective_from, effective_until)
SELECT g.id, 'Saturday Program', 6, '09:00', 120, '2025-09-13', '2026-05-16'
FROM groups g WHERE g.slug = 'pre-som';

-- SOM — Wednesday (day_of_week = 3)
INSERT INTO schedules (group_id, name, day_of_week, start_time, duration_minutes, effective_from, effective_until)
SELECT g.id, 'Wednesday Meeting', 3, '17:00', 120, '2025-09-17', '2026-05-13'
FROM groups g WHERE g.slug = 'som';

-- SOM — Saturday (day_of_week = 6)
INSERT INTO schedules (group_id, name, day_of_week, start_time, duration_minutes, effective_from, effective_until)
SELECT g.id, 'Saturday Program', 6, '09:00', 120, '2025-09-13', '2026-05-16'
FROM groups g WHERE g.slug = 'som';
