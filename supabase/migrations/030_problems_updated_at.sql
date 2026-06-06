alter table problems add column updated_at timestamptz not null default now();

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger problems_updated_at
  before update on problems
  for each row execute procedure set_updated_at();
