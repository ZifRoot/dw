CREATE OR REPLACE VIEW embedding_efficiency
AS WITH session_sizes AS (
         SELECT mf.session_id,
            sum(mf.size) AS total_size
           FROM message_fragments mf
          GROUP BY mf.session_id
        ), processed_sessions AS (
         SELECT e.session_id,
            e.processing_time_ms,
            ss.total_size
           FROM embeddings e
             JOIN session_sizes ss ON e.session_id = ss.session_id
          WHERE ss.total_size > 0
        )
 SELECT avg(processed_sessions.processing_time_ms / processed_sessions.total_size::double precision) AS avg_ms_per_byte,
    percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (processed_sessions.processing_time_ms / processed_sessions.total_size::double precision)) AS median_ms_per_byte
   FROM processed_sessions;
