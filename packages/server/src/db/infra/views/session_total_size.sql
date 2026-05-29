CREATE OR REPLACE VIEW session_total_size
AS SELECT message_fragments.session_id,
    sum(message_fragments.size) AS total_bytes
   FROM message_fragments
  GROUP BY message_fragments.session_id;