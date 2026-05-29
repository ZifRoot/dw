CREATE OR REPLACE VIEW model_avg_speed AS
SELECT
    model_name,
    CASE 
        WHEN SUM(processing_time_ms) > 0 
        THEN SUM(total_bytes)::float / SUM(processing_time_ms)
        ELSE NULL
    END AS avg_bytes_per_ms
FROM session_throughput
GROUP BY model_name;