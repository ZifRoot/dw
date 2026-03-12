CREATE TABLE "chat_messages" (
	"session_id" uuid NOT NULL,
	"message_id" integer NOT NULL,
	"parent_message_id" integer,
	"model" text,
	"role" text NOT NULL,
	"thinking_enabled" boolean NOT NULL,
	"ban_edit" boolean NOT NULL,
	"ban_regenerate" boolean NOT NULL,
	"status" text NOT NULL,
	"accumulated_token_usage" integer NOT NULL,
	"feedback" jsonb,
	"inserted_at" timestamp NOT NULL,
	"search_enabled" boolean NOT NULL,
	"has_pending_fragment" boolean NOT NULL,
	"auto_continue" boolean NOT NULL,
	CONSTRAINT "chat_messages_session_id_message_id_pk" PRIMARY KEY("session_id","message_id")
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"title_type" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp NOT NULL,
	"seq_id" integer,
	"agent" text,
	"version" integer,
	"current_message_id" integer,
	"inserted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text NOT NULL,
	"file_name" text NOT NULL,
	"previewable" boolean NOT NULL,
	"file_size" integer NOT NULL,
	"token_usage" integer NOT NULL,
	"error_code" integer,
	"inserted_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_files" (
	"session_id" uuid NOT NULL,
	"message_id" integer NOT NULL,
	"file_id" uuid NOT NULL,
	CONSTRAINT "message_files_session_id_message_id_file_id_pk" PRIMARY KEY("session_id","message_id","file_id")
);
--> statement-breakpoint
CREATE TABLE "message_fragments" (
	"session_id" uuid NOT NULL,
	"message_id" integer NOT NULL,
	"fragment_order" integer NOT NULL,
	"type" text NOT NULL,
	"content" text NOT NULL,
	"elapsed_secs" double precision,
	"references" jsonb,
	"stage_id" integer,
	CONSTRAINT "message_fragments_session_id_message_id_fragment_order_pk" PRIMARY KEY("session_id","message_id","fragment_order")
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_parent_message_id_chat_messages_session_id_message_id_fk" FOREIGN KEY ("session_id","parent_message_id") REFERENCES "public"."chat_messages"("session_id","message_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_files" ADD CONSTRAINT "message_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_files" ADD CONSTRAINT "message_files_session_id_message_id_chat_messages_session_id_message_id_fk" FOREIGN KEY ("session_id","message_id") REFERENCES "public"."chat_messages"("session_id","message_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_fragments" ADD CONSTRAINT "message_fragments_session_id_message_id_chat_messages_session_id_message_id_fk" FOREIGN KEY ("session_id","message_id") REFERENCES "public"."chat_messages"("session_id","message_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_parent_idx" ON "chat_messages" USING btree ("session_id","parent_message_id");--> statement-breakpoint
CREATE INDEX "chat_messages_session_id_idx" ON "chat_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "message_files_message_idx" ON "message_files" USING btree ("session_id","message_id");--> statement-breakpoint
CREATE INDEX "message_files_file_idx" ON "message_files" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "message_fragments_message_idx" ON "message_fragments" USING btree ("session_id","message_id");