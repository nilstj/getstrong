-- A variation can carry its own grade: eliminating a hold can make the same
-- boulder harder or softer than the original, and a climber wants to know which
-- before they pull on.
--
-- Free text, exactly like gym_problems.community_grade -- stored in whichever
-- scale the setter prefers (profiles.grade_preference), so a consumer may only
-- compare two grades within one scale. No check constraint: the grade
-- vocabularies live in src/utils/grades.ts and a constraint here would have to be
-- kept in step with them by hand.
--
-- ORDER: apply after 074, 075 and 076. See 076's header for why 074 must never be
-- re-run after 076.

alter table challenges add column if not exists grade text;
