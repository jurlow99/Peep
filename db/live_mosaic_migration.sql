-- Living Mosaic: admin-controlled tile prominence for the Live TV channel wall.
-- Additive and safe to run once in the Supabase SQL editor.
-- (If you see an RLS warning, click "Run without RLS".)

alter table public.channels
  add column if not exists tile_size text not null default 'normal',   -- 'normal' | 'large' | 'spotlight'
  add column if not exists is_live_hero boolean not null default false; -- featured hero tile on Live TV

-- Keep tile_size to known values.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'channels_tile_size_check') then
    alter table public.channels
      add constraint channels_tile_size_check
      check (tile_size in ('normal', 'large', 'spotlight'));
  end if;
end $$;
