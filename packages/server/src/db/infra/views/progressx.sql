CREATE OR REPLACE VIEW progressx AS
select
	m.*,
	m.all - m.count as l
from
	(
	select
		model_name ,
		count(e.session_id) as count,
		(
		select
			count(cs.id)
		from
			chat_sessions cs ) as all
	from
		embeddings e
	group by
		model_name ) m	
	
	
CREATE FUNCTION persentx()
RETURNS real AS $$
  select
	sum(m.count)/ sum(m.all)
from
	progressx m;
$$ LANGUAGE sql;