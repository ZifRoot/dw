CREATE OR REPLACE VIEW session_throughput AS
SELECT
    e.model_name,
    e.session_id,
    sts.total_bytes,
    e.processing_time_ms,
    CASE 
        WHEN e.processing_time_ms > 0 
        THEN sts.total_bytes::float / e.processing_time_ms
        ELSE NULL
    END AS bytes_per_ms
FROM embeddings e
JOIN session_total_size sts ON e.session_id = sts.session_id;