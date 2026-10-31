-- Atomic per-channel XMLTV updates. Existing table RLS remains in force.
alter table public.epg_channel_sources add column if not exists refresh_error text;
create or replace function public.save_channel_guide(
 p_channel_id bigint,p_entries jsonb,p_source_name text,p_source_url text,
 p_xmltv_channel_id text,p_xml_content text default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_start timestamptz; v_end timestamptz; v_count integer;
begin
 if current_user <> 'service_role' and not peep_private.is_admin() then raise exception 'Admin access required'; end if;
 if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) not between 1 and 20000 then raise exception 'Guide must contain 1–20000 programs'; end if;
 if nullif(btrim(p_xmltv_channel_id),'') is null then raise exception 'Choose an XMLTV channel'; end if;
 if p_source_url is not null and p_source_url !~* '^https?://' then raise exception 'Use an HTTP(S) feed URL'; end if;
 perform 1 from public.channels where id=p_channel_id for update;
 if not found then raise exception 'Channel not found'; end if;
 if exists(select 1 from jsonb_to_recordset(p_entries) as e(title text,start_time timestamptz,end_time timestamptz)
   where nullif(btrim(e.title),'') is null or e.start_time is null or e.end_time is null or e.end_time<=e.start_time) then raise exception 'Invalid program title or times'; end if;
 select min(e.start_time),max(e.end_time),count(*) into v_start,v_end,v_count
 from jsonb_to_recordset(p_entries) as e(start_time timestamptz,end_time timestamptz);
 delete from public.epg_entries where channel_id=p_channel_id and start_time<v_end and end_time>v_start;
 insert into public.epg_entries(channel_id,title,description,thumbnail,start_time,end_time)
 select p_channel_id,btrim(e.title),e.description,e.thumbnail,e.start_time,e.end_time
 from jsonb_to_recordset(p_entries) as e(title text,description text,thumbnail text,start_time timestamptz,end_time timestamptz);
 insert into public.epg_channel_sources(channel_id,source_name,source_url,xmltv_channel_id,imported_at,program_count,xml_content,refresh_error)
 values(p_channel_id,left(p_source_name,250),p_source_url,p_xmltv_channel_id,now(),v_count,p_xml_content,null)
 on conflict(channel_id) do update set source_name=excluded.source_name,source_url=excluded.source_url,
 xmltv_channel_id=excluded.xmltv_channel_id,imported_at=excluded.imported_at,program_count=excluded.program_count,xml_content=excluded.xml_content,refresh_error=null;
 return jsonb_build_object('program_count',v_count,'coverage_end',v_end);
end $$;
revoke all on function public.save_channel_guide(bigint,jsonb,text,text,text,text) from public,anon;
grant execute on function public.save_channel_guide(bigint,jsonb,text,text,text,text) to authenticated,service_role;
