ALTER TABLE "message_fragments" DROP CONSTRAINT "message_fragments_session_id_chat_sessions_id_fk";
--> statement-breakpoint
DROP INDEX "embeddings_session_idx";--> statement-breakpoint
ALTER TABLE "embeddings" ALTER COLUMN "model_name" SET DATA TYPE varchar(50);--> statement-breakpoint
ALTER TABLE "embeddings" ALTER COLUMN "processing_time_ms" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "message_fragments" ADD CONSTRAINT "message_fragments_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embeddings" DROP COLUMN "id";