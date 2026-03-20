-- Link admin_actions.admin_id → profiles.user_id so we can join admin info
-- admin_id stores auth UUIDs (same as profiles.user_id)
ALTER TABLE admin_actions
ADD CONSTRAINT admin_actions_admin_id_fkey
FOREIGN KEY (admin_id) REFERENCES profiles(user_id);
