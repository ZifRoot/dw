CREATE VIEW "public"."model_processed_stats" AS (
    SELECT e.model_name,
           sum(sts.total_bytes) AS processed_bytes,
           sum(e.processing_time_ms) AS total_time_ms,
           s.avg_bytes_per_ms,
           s.median_bytes_per_ms,
           s.min_bytes_per_ms AS speed_bytes_per_ms
    FROM embeddings e
    JOIN session_total_size sts ON e.session_id = sts.session_id
    LEFT JOIN model_speeds s ON e.model_name::text = s.model_name::text
    GROUP BY e.model_name, s.avg_bytes_per_ms, s.median_bytes_per_ms, s.min_bytes_per_ms
  );