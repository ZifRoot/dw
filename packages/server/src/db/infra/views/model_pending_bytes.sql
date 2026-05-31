CREATE OR REPLACE VIEW model_pending_bytes AS
SELECT
    dm.model_name,
    COALESCE(SUM(sts.total_bytes), 0) AS pending_bytes
FROM distinct_models dm
CROSS JOIN session_total_size sts
WHERE NOT EXISTS (
    SELECT 1 FROM embeddings e
    WHERE e.session_id = sts.session_id AND e.model_name = dm.model_name
)
GROUP BY dm.model_name;