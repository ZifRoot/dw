CREATE VIEW "public"."model_avg_speed" AS (
    SELECT session_throughput.model_name,
           CASE
               WHEN sum(session_throughput.processing_time_ms) > 0::double precision 
               THEN sum(session_throughput.total_bytes)::double precision / sum(session_throughput.processing_time_ms)
               ELSE NULL::double precision
           END AS avg_bytes_per_ms
    FROM session_throughput
    GROUP BY session_throughput.model_name
  );--> statement-breakpoint
CREATE VIEW "public"."model_median_speed" AS (
    SELECT session_throughput.model_name,
           percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY session_throughput.bytes_per_ms) AS median_bytes_per_ms
    FROM session_throughput
    WHERE session_throughput.bytes_per_ms IS NOT NULL
    GROUP BY session_throughput.model_name
  );