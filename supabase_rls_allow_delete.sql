-- Run this in the Supabase SQL Editor to allow deleting and updating records from the Admin Dashboard

-- Tasks table
CREATE POLICY "Allow all deletes on tasks" ON tasks FOR DELETE USING (true);
CREATE POLICY "Allow all updates on tasks" ON tasks FOR UPDATE USING (true);

-- Maintenance table
CREATE POLICY "Allow all deletes on maintenance" ON maintenance FOR DELETE USING (true);
CREATE POLICY "Allow all updates on maintenance" ON maintenance FOR UPDATE USING (true);

-- Assignments table
CREATE POLICY "Allow all deletes on assignments" ON assignments FOR DELETE USING (true);
CREATE POLICY "Allow all updates on assignments" ON assignments FOR UPDATE USING (true);
