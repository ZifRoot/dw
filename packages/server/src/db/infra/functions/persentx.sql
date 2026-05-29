CREATE FUNCTION persentx()
RETURNS real AS $$
  select
	sum(m.count)/ sum(m.all)
from
	progressx m;
$$ LANGUAGE sql;