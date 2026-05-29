-- distinct_models исходный текст

CREATE OR REPLACE VIEW distinct_models
AS SELECT DISTINCT embeddings.model_name
   FROM embeddings;


-- model_efficiency исходный текст

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


-- model_median_speed исходный текст

CREATE OR REPLACE VIEW model_median_speed
AS SELECT session_speed.model_name,
    percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY session_speed.speed_bytes_per_ms) AS median_speed_bytes_per_ms
   FROM session_speed
  WHERE session_speed.speed_bytes_per_ms IS NOT NULL
  GROUP BY session_speed.model_name;


-- model_pending_bytes исходный текст

CREATE OR REPLACE VIEW model_pending_bytes
AS SELECT dm.model_name,
    COALESCE(sum(sts.total_bytes), 0::numeric) AS pending_bytes
   FROM distinct_models dm
     CROSS JOIN session_total_size sts
  WHERE NOT (EXISTS ( SELECT 1
           FROM embeddings e
          WHERE e.session_id = sts.session_id AND e.model_name::text = dm.model_name::text))
  GROUP BY dm.model_name;


-- model_processed_stats исходный текст

CREATE OR REPLACE VIEW model_processed_stats
AS SELECT e.model_name,
    sum(sts.total_bytes) AS processed_bytes,
    sum(e.processing_time_ms) AS total_time_ms,
        CASE
            WHEN sum(e.processing_time_ms) > 0::double precision THEN sum(sts.total_bytes)::double precision / sum(e.processing_time_ms)
            ELSE NULL::double precision
        END AS avg_speed_bytes_per_ms,
    ms.median_speed_bytes_per_ms,
    ms.median_speed_bytes_per_ms AS speed_bytes_per_ms
   FROM embeddings e
     JOIN session_total_size sts ON e.session_id = sts.session_id
     JOIN model_median_speed ms ON e.model_name::text = ms.model_name::text
  GROUP BY e.model_name, ms.median_speed_bytes_per_ms;


-- model_remaining_time исходный текст

CREATE OR REPLACE VIEW model_remaining_time
AS SELECT pb.model_name,
    pb.pending_bytes,
    ps.processed_bytes,
    ps.total_time_ms,
    ps.speed_bytes_per_ms,
    ps.avg_speed_bytes_per_ms,
    ps.median_speed_bytes_per_ms,
        CASE
            WHEN ps.speed_bytes_per_ms IS NOT NULL AND ps.speed_bytes_per_ms > 0::double precision THEN pb.pending_bytes::double precision / ps.speed_bytes_per_ms
            ELSE NULL::double precision
        END AS remaining_time_ms,
        CASE
            WHEN ps.speed_bytes_per_ms IS NOT NULL AND ps.speed_bytes_per_ms > 0::double precision THEN pb.pending_bytes::double precision / ps.speed_bytes_per_ms / 1000.0::double precision
            ELSE NULL::double precision
        END AS remaining_time_sec
   FROM model_pending_bytes pb
     LEFT JOIN model_processed_stats ps ON pb.model_name::text = ps.model_name::text;


-- progressx исходный текст

CREATE OR REPLACE VIEW progressx
AS SELECT m.model_name,
    m.count,
    m."all",
    m."all" - m.count AS l
   FROM ( SELECT e.model_name,
            count(e.session_id) AS count,
            ( SELECT count(cs.id) AS count
                   FROM chat_sessions cs) AS "all"
           FROM embeddings e
          GROUP BY e.model_name) m;


-- session_speed исходный текст

CREATE OR REPLACE VIEW session_speed
AS SELECT e.model_name,
    e.session_id,
    sts.total_bytes,
    e.processing_time_ms,
        CASE
            WHEN e.processing_time_ms > 0::double precision THEN sts.total_bytes::double precision / e.processing_time_ms
            ELSE NULL::double precision
        END AS speed_bytes_per_ms
   FROM embeddings e
     JOIN session_total_size sts ON e.session_id = sts.session_id;


-- session_total_size исходный текст

CREATE OR REPLACE VIEW session_total_size
AS SELECT message_fragments.session_id,
    sum(message_fragments.size) AS total_bytes
   FROM message_fragments
  GROUP BY message_fragments.session_id;


-- speedx исходный текст

CREATE OR REPLACE VIEW speedx
AS WITH session_size AS (
         SELECT cs.id,
            COALESCE(fs.sum_frag, 0::bigint) + COALESCE(fls.sum_file, 0::bigint) AS size
           FROM chat_sessions cs
             LEFT JOIN ( SELECT message_fragments.session_id,
                    sum(message_fragments.size) AS sum_frag
                   FROM message_fragments
                  GROUP BY message_fragments.session_id) fs ON cs.id = fs.session_id
             LEFT JOIN ( SELECT mf.session_id,
                    sum(f.file_size) AS sum_file
                   FROM message_files mf
                     JOIN files f ON mf.file_id = f.id
                  GROUP BY mf.session_id) fls ON cs.id = fls.session_id
        )
 SELECT e.model_name,
    sum(ss.size) AS total_data_size,
    sum(e.processing_time_ms) AS total_time_ms,
    sum(ss.size)::double precision / NULLIF(sum(e.processing_time_ms), 0::double precision) AS speed_size_per_ms,
    sum(ss.size)::double precision / NULLIF(sum(e.processing_time_ms), 0::double precision) * 1000::double precision AS speed_size_per_sec
   FROM embeddings e
     JOIN session_size ss ON e.session_id = ss.id
  GROUP BY e.model_name
  ORDER BY (sum(ss.size)::double precision / NULLIF(sum(e.processing_time_ms), 0::double precision)) DESC;