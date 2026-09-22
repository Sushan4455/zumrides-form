-- Insert existing Google Sheets data into Supabase tasks table
INSERT INTO tasks (created_at, task_type, cycle_id, battery_id, condition, issue, parts_checked, staff_name, station_name, odometer)
VALUES
  ('2026-09-22 14:00:00+00', 'Routine Checkup', '89',  '', 'good', '', '', 'Kabir',  'N/A', ''),
  ('2026-09-22 14:00:00+00', 'Routine Checkup', '241', '', 'good', '', '', 'Kabir',  'N/A', ''),
  ('2026-09-22 14:00:00+00', 'Routine Checkup', '55',  '', 'good', '', '', 'Kabir',  'N/A', ''),
  ('2026-09-22 14:00:00+00', 'Routine Checkup', '169', '', 'good', '', '', 'Kabir',  'N/A', ''),
  ('2026-09-22 14:00:00+00', 'Routine Checkup', '101', '', 'good', '', '', 'Kabir',  'N/A', ''),
  ('2026-09-22 14:00:00+00', 'Routine Checkup', '237', '', 'good', '', '', 'Surya',  'N/A', ''),
  ('2026-09-22 14:00:00+00', 'Routine Checkup', '131', '', 'good', '', '', 'Surya',  'N/A', ''),
  ('2026-09-22 14:00:00+00', 'Routine Checkup', '15',  '', 'good', '', '', 'Surya',  'N/A', ''),
  ('2026-09-22 14:00:00+00', 'Routine Checkup', '234', '', 'good', '', '', 'Surya',  'N/A', ''),
  ('2026-09-22 14:00:00+00', 'Routine Checkup', '100', '', 'good', '', '', 'Surya',  'N/A', ''),
  ('2026-09-22 14:00:00+00', 'Routine Checkup', '90',  '', 'good', '', '', 'Laxman', 'N/A', ''),
  ('2026-09-22 14:00:00+00', 'Routine Checkup', '33',  '', 'good', '', '', 'Laxman', 'N/A', ''),
  ('2026-09-22 14:00:00+00', 'Routine Checkup', '120', '', 'good', '', '', 'Anish',  'N/A', ''),
  ('2026-09-22 14:00:00+00', 'Routine Checkup', '167', '', 'good', '', '', 'Anish',  'N/A', '');
