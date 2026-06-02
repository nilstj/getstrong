alter table problems add column grade_value_font text;
alter table problems add column grade_value_vscale text;

-- Backfill font problems
update problems set grade_value_font = grade_value where grade_system = 'font';

-- Backfill v_scale problems
update problems set grade_value_vscale = grade_value where grade_system = 'v_scale';

-- Derive v_scale equivalent for font problems
update problems p
set grade_value_vscale = gm.v_scale
from grade_mappings gm
where p.grade_system = 'font'
  and p.grade_value = gm.font_equivalent
  and p.grade_value_vscale is null;

-- Derive font equivalent for v_scale problems
update problems p
set grade_value_font = gm.font_equivalent
from grade_mappings gm
where p.grade_system = 'v_scale'
  and p.grade_value = gm.v_scale
  and p.grade_value_font is null;
