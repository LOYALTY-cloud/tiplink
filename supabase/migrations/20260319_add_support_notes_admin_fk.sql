-- Link support_notes.admin_id → profiles.user_id so we can join admin info
-- admin_id stores auth UUIDs (same as profiles.user_id), NOT profiles.id
ALTER TABLE support_notes
ADD CONSTRAINT support_notes_admin_id_fkey
FOREIGN KEY (admin_id) REFERENCES profiles(user_id);
