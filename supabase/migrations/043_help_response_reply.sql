-- Asker can reply to a helper's beta response (e.g. "tried this, still stuck on X").
-- The existing "asker marks response helpful" UPDATE policy already allows the asker
-- to update any column on a help_response, so no new policy is needed.

alter table help_responses add column if not exists reply text;
