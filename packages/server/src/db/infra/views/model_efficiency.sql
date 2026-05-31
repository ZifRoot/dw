CREATE OR REPLACE VIEW model_efficiency
AS WITH session_sizes AS (
         SELECT message_fragments.session_id,
            sum(message_fragments.size) AS total_size
           FROM message_fragments
          GROUP BY message_fragments.session_id
        ), model_processed AS (
         SELECT e.model_name,
            e.session_id,
            e.processing_time_ms,
            ss.total_size
           FROM embeddings e
             JOIN session_sizes ss ON e.session_id = ss.session_id
          WHERE ss.total_size > 0
        )
 SELECT model_processed.model_name,
    avg(model_processed.processing_time_ms / model_processed.total_size::double precision) AS avg_ms_per_byte,
    percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (model_processed.processing_time_ms / model_processed.total_size::double precision)) AS median_ms_per_byte,
    count(*) AS sample_count
   FROM model_processed
  GROUP BY model_processed.model_name;