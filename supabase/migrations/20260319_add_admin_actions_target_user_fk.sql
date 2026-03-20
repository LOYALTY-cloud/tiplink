-- Link admin_actions.target_user → profiles.user_id so we can join target user info
ALTER TABLE admin_actions
ADD CONSTRAINT admin_actions_target_user_fkey
FOREIGN KEY (target_user) REFERENCES profiles(user_id)
ON DELETE SET NULL;
