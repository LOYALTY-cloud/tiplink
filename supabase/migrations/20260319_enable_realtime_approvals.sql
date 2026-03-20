-- Enable Supabase Realtime on refund approval tables
-- so the admin approvals dashboard gets instant updates.

ALTER PUBLICATION supabase_realtime ADD TABLE refund_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE refund_approval_votes;
ALTER PUBLICATION supabase_realtime ADD TABLE admin_actions;
ALTER PUBLICATION supabase_realtime ADD TABLE risk_alerts;
