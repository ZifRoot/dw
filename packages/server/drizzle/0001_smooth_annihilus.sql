CREATE VIEW "public"."distinct_models" AS (select distinct "model_name" from "embeddings");--> statement-breakpoint
CREATE VIEW "public"."session_total_size" AS (
  SELECT 
    session_id, 
    sum(size) AS total_bytes
  FROM message_fragments
  WHERE type = 'RESPONSE'
  GROUP BY session_id
);