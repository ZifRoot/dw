CREATE OR REPLACE VIEW model_median_speed AS
SELECT
    model_name,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY bytes_per_ms) AS median_bytes_per_ms
FROM session_throughput
WHERE bytes_per_ms IS NOT NULL
GROUP BY model_name;