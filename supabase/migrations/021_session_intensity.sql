alter table sessions add column intensity text
  check (intensity in ('boring', 'sunshine', 'hard', 'really_hard', 'to_the_max'));
