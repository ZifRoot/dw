CREATE OR REPLACE VIEW distinct_models
AS SELECT DISTINCT embeddings.model_name
   FROM embeddings;