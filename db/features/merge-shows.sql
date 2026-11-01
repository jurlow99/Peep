-- Resolve duplicate series: merge one show into another. Episodes move across
-- (same file already there → dropped; same slot, different file → appended to
-- that season), blank fields on the kept show are filled from the removed one,
-- My List / ratings / creator ownership / reports / ad tags / hand-picked rows
-- are re-pointed, then the removed show is deleted. Admin only.
-- Applied to dev (cuwdyedmmnpklufduaho) by hand on 2026-11-01.
create or replace function public.merge_shows(p_keep bigint, p_remove bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  gone public.shows%rowtype;
  ep record;
  next_no integer;
  moved integer := 0;
  dropped integer := 0;
  renumbered integer := 0;
begin
  if peep_private.is_admin() is not true then raise exception 'Admin access required'; end if;
  if p_keep is null or p_remove is null or p_keep = p_remove then raise exception 'Pick two different series'; end if;
  perform 1 from public.shows where id = p_keep for update;
  if not found then raise exception 'Series to keep not found'; end if;
  select * into gone from public.shows where id = p_remove for update;
  if not found then raise exception 'Series to remove not found'; end if;

  for ep in select * from public.episodes where show_id = p_remove order by season, episode_number, id loop
    if (ep.url is not null and exists (select 1 from public.episodes k where k.show_id = p_keep and k.url = ep.url))
       or exists (select 1 from public.episodes k where k.show_id = p_keep and k.season is not distinct from ep.season and k.episode_number = ep.episode_number
                  and lower(regexp_replace(trim(coalesce(k.title, '')), '\s+', ' ', 'g')) = lower(regexp_replace(trim(coalesce(ep.title, '')), '\s+', ' ', 'g'))) then
      delete from public.episodes where id = ep.id;             -- same video, or the same episode uploaded twice
      dropped := dropped + 1;
    elsif exists (select 1 from public.episodes k where k.show_id = p_keep and k.season is not distinct from ep.season and k.episode_number = ep.episode_number) then
      select coalesce(max(episode_number), 0) + 1 into next_no from public.episodes where show_id = p_keep and season is not distinct from ep.season;
      update public.episodes set show_id = p_keep, episode_number = next_no where id = ep.id;
      renumbered := renumbered + 1;
    else
      update public.episodes set show_id = p_keep where id = ep.id;
      moved := moved + 1;
    end if;
  end loop;

  update public.shows k set
    poster      = coalesce(nullif(trim(k.poster), ''), gone.poster),
    thumbnail   = coalesce(nullif(trim(k.thumbnail), ''), gone.thumbnail),
    description = coalesce(nullif(trim(k.description), ''), gone.description),
    category    = coalesce(nullif(trim(k.category), ''), gone.category),
    tags        = coalesce(nullif(trim(k.tags), ''), gone.tags),
    rating      = coalesce(nullif(trim(k.rating), ''), gone.rating),
    year        = coalesce(k.year, gone.year),
    trailer_url = coalesce(nullif(trim(k.trailer_url), ''), gone.trailer_url),
    views       = coalesce(k.views, 0) + coalesce(gone.views, 0),
    featured    = coalesce(k.featured, false) or coalesce(gone.featured, false)
  where k.id = p_keep;

  -- Per-user rows are unique per (user, content): drop the ones that would collide, re-point the rest.
  delete from public.user_list r where r.content_id = p_remove::text and r.content_type in ('show', 'series')
    and exists (select 1 from public.user_list k where k.user_id = r.user_id and k.content_type = r.content_type and k.content_id = p_keep::text);
  update public.user_list set content_id = p_keep::text where content_id = p_remove::text and content_type in ('show', 'series');
  delete from public.ratings r where r.content_id = p_remove::text and r.content_type in ('show', 'series')
    and exists (select 1 from public.ratings k where k.user_id = r.user_id and k.content_type = r.content_type and k.content_id = p_keep::text);
  update public.ratings set content_id = p_keep::text where content_id = p_remove::text and content_type in ('show', 'series');
  delete from public.content_creators r where r.content_id = p_remove::text and r.content_type in ('show', 'series')
    and exists (select 1 from public.content_creators k where k.creator_id = r.creator_id and k.content_type = r.content_type and k.content_id = p_keep::text);
  update public.content_creators set content_id = p_keep::text where content_id = p_remove::text and content_type in ('show', 'series');
  update public.content_reports set content_id = p_keep::text where content_id = p_remove::text and content_type in ('show', 'series');
  update public.vast_tags set content_id = p_keep::text where content_id = p_remove::text and scope in ('show', 'series');

  -- Hand-picked rows store [{id,type}] as JSON text; swap the id, keep order, drop a resulting repeat.
  begin
    update public.carousels c set filter_value = (
      select coalesce(jsonb_agg(x order by ord), '[]'::jsonb)::text
      from (
        select x, min(ord) as ord
        from (
          select case when t.e->>'id' = p_remove::text and t.e->>'type' in ('show', 'series')
                      then jsonb_set(t.e, '{id}', to_jsonb(p_keep::text)) else t.e end as x, t.ord
          from jsonb_array_elements(c.filter_value::jsonb) with ordinality as t(e, ord)
        ) s group by x
      ) d)
    where c.type = 'handpicked' and c.filter_value like '%' || p_remove::text || '%';
  exception when others then
    null; -- a malformed hand-picked row must not block the merge
  end;

  delete from public.shows where id = p_remove;
  return jsonb_build_object('kept', p_keep, 'removed', p_remove, 'moved', moved, 'dropped', dropped, 'renumbered', renumbered);
end $$;
revoke all on function public.merge_shows(bigint, bigint) from public, anon;
grant execute on function public.merge_shows(bigint, bigint) to authenticated;
