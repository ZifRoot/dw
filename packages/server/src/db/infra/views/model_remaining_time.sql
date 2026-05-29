CREATE OR REPLACE VIEW model_remaining_time AS
SELECT
    pb.model_name,
    pb.pending_bytes,
    ps.processed_bytes,
    ps.total_time_ms,
    ps.speed_bytes_per_ms,   -- минимальная (консервативная) скорость
    ps.avg_bytes_per_ms,
    ps.median_bytes_per_ms,
    CASE 
        WHEN ps.speed_bytes_per_ms IS NOT NULL AND ps.speed_bytes_per_ms > 0 
        THEN pb.pending_bytes / ps.speed_bytes_per_ms
        ELSE NULL
    END AS remaining_time_ms,
    CASE 
        WHEN ps.speed_bytes_per_ms IS NOT NULL AND ps.speed_bytes_per_ms > 0 
        THEN pb.pending_bytes / ps.speed_bytes_per_ms / 1000.0
        ELSE NULL
    END AS remaining_time_sec
FROM model_pending_bytes pb
LEFT JOIN model_processed_stats ps ON pb.model_name = ps.model_name;