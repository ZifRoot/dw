CREATE OR REPLACE VIEW public.speedx
AS
with session_size as (
select
	cs.id,
	coalesce(fs.sum_frag, 0) + coalesce(fls.sum_file, 0) as size
from
	chat_sessions cs
left join (
	select
		session_id,
		SUM(size) as sum_frag
	from
		message_fragments
	group by
		session_id
    ) fs on
	cs.id = fs.session_id
left join (
	select
		mf.session_id,
		SUM(f.file_size) as sum_file
	from
		message_files mf
	join files f on
		mf.file_id = f.id
	group by
		mf.session_id
    ) fls on
	cs.id = fls.session_id
)
