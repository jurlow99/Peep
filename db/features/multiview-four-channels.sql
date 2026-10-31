alter table public.multiview_packages
 add column third_channel_id bigint references public.channels(id),
 add column fourth_channel_id bigint references public.channels(id),
 add constraint complete_four_channel_package check (
 (third_channel_id is null and fourth_channel_id is null) or
 (third_channel_id is not null and fourth_channel_id is not null
 and third_channel_id <> fourth_channel_id
 and third_channel_id not in (left_channel_id,right_channel_id)
 and fourth_channel_id not in (left_channel_id,right_channel_id)));
create index multiview_packages_third_channel_idx on public.multiview_packages(third_channel_id);
create index multiview_packages_fourth_channel_idx on public.multiview_packages(fourth_channel_id);
