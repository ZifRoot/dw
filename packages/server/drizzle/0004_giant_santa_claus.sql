CREATE VIEW "public"."model_speeds" AS (
    SELECT COALESCE(avg.model_name, med.model_name) AS model_name,
           avg.avg_bytes_per_ms,
           med.median_bytes_per_ms,
           LEAST(COALESCE(avg.avg_bytes_per_ms, med.median_bytes_per_ms), COALESCE(med.median_bytes_per_ms, avg.avg_bytes_per_ms)) AS min_bytes_per_ms
    FROM model_avg_speed avg
    FULL JOIN model_median_speed med ON avg.model_name::text = med.model_name::text
  );