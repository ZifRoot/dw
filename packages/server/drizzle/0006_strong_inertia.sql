CREATE VIEW "public"."model_remaining_time" AS (
    SELECT pb.model_name,
           pb.pending_bytes,
           ps.processed_bytes,
           ps.total_time_ms,
           ps.speed_bytes_per_ms,
           ps.avg_bytes_per_ms,
           ps.median_bytes_per_ms,
           CASE
               WHEN ps.speed_bytes_per_ms IS NOT NULL AND ps.speed_bytes_per_ms > 0::double precision 
               THEN pb.pending_bytes::double precision / ps.speed_bytes_per_ms
               ELSE NULL::double precision
           END AS remaining_time_ms,
           CASE
               WHEN ps.speed_bytes_per_ms IS NOT NULL AND ps.speed_bytes_per_ms > 0::double precision 
               THEN ( SELECT format('%s days %s hours %s minutes %s seconds %s ms'::text, 
                                     (t.ms / 86400000)::text, 
                                     (t.ms % 86400000::bigint / 3600000)::text, 
                                     (t.ms % 3600000::bigint / 60000)::text, 
                                     (t.ms % 60000::bigint / 1000)::text, 
                                     (t.ms % 1000::bigint)::text) AS format
                      FROM ( SELECT (pb.pending_bytes::double precision / ps.speed_bytes_per_ms)::bigint AS ms) t)
               ELSE NULL::text
           END AS remaining_time_human
    FROM model_pending_bytes pb
    LEFT JOIN model_processed_stats ps ON pb.model_name::text = ps.model_name::text
  );