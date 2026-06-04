CREATE VIEW "public"."model_efficiency" AS (
    WITH session_sizes AS (
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
    GROUP BY model_processed.model_name
  );--> statement-breakpoint
CREATE VIEW "public"."model_pending_bytes" AS (
    SELECT dm.model_name,
           COALESCE(( SELECT sum(sts.total_bytes) AS sum
                      FROM session_total_size sts
                      WHERE NOT (EXISTS ( SELECT 1
                                          FROM embeddings e
                                          WHERE e.session_id = sts.session_id 
                                            AND e.model_name::text = dm.model_name::text))), 0::numeric) AS pending_bytes
    FROM distinct_models dm
  );--> statement-breakpoint
CREATE VIEW "public"."progressx" AS (
    SELECT m.model_name,
           m.count,
           m."all",
           m."all" - m.count AS l
    FROM ( SELECT e.model_name,
                  count(e.session_id) AS count,
                  ( SELECT count(cs.id) AS count
                    FROM chat_sessions cs ) AS "all"
           FROM embeddings e
           GROUP BY e.model_name ) m
  );--> statement-breakpoint
CREATE VIEW "public"."session_speed" AS (
  SELECT 
    e.model_name,
    e.session_id,
    sts.total_bytes,
    e.processing_time_ms,
    CASE 
      WHEN e.processing_time_ms > 0 
      THEN sts.total_bytes::double precision / e.processing_time_ms 
      ELSE NULL 
    END AS speed_bytes_per_ms
  FROM embeddings e
  JOIN session_total_size sts ON e.session_id = sts.session_id
);--> statement-breakpoint
CREATE VIEW "public"."session_throughput" AS (
  SELECT 
    e.model_name,
    e.session_id,
    sts.total_bytes,
    e.processing_time_ms,
    CASE 
      WHEN e.processing_time_ms > 0 
      THEN sts.total_bytes::double precision / e.processing_time_ms 
      ELSE NULL 
    END AS bytes_per_ms
  FROM embeddings e
  JOIN session_total_size sts ON e.session_id = sts.session_id
);--> statement-breakpoint
CREATE VIEW "public"."sessions_outdating_embeddings" AS (select "chat_sessions"."id", "chat_sessions"."title", "embeddings"."model_name" from "chat_sessions" inner join "embeddings" on "chat_sessions"."id" = "embeddings"."session_id" where "chat_sessions"."updated_at" > "embeddings"."created_at");--> statement-breakpoint
CREATE VIEW "public"."speedx" AS (
    WITH session_size AS (
         SELECT cs.id,
                COALESCE(fs.sum_frag, 0::bigint) + COALESCE(fls.sum_file, 0::bigint) AS size
         FROM chat_sessions cs
         LEFT JOIN ( SELECT message_fragments.session_id,
                            sum(message_fragments.size) AS sum_frag
                     FROM message_fragments
                     GROUP BY message_fragments.session_id ) fs ON cs.id = fs.session_id
         LEFT JOIN ( SELECT mf.session_id,
                            sum(f.file_size) AS sum_file
                     FROM message_files mf
                     JOIN files f ON mf.file_id = f.id
                     GROUP BY mf.session_id ) fls ON cs.id = fls.session_id
    )
    SELECT e.model_name,
           sum(ss.size) AS total_data_size,
           sum(e.processing_time_ms) AS total_time_ms,
           sum(ss.size)::double precision / NULLIF(sum(e.processing_time_ms), 0::double precision) AS speed_size_per_ms,
           sum(ss.size)::double precision / NULLIF(sum(e.processing_time_ms), 0::double precision) * 1000::double precision AS speed_size_per_sec
    FROM embeddings e
    JOIN session_size ss ON e.session_id = ss.id
    GROUP BY e.model_name
    ORDER BY (sum(ss.size)::double precision / NULLIF(sum(e.processing_time_ms), 0::double precision)) DESC
  );