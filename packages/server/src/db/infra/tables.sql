-- files определение

-- Drop table

-- DROP TABLE files;

CREATE TABLE files (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	status text NOT NULL,
	file_name text NOT NULL,
	previewable bool NOT NULL,
	file_size int4 NOT NULL,
	token_usage int4 NOT NULL,
	error_code int4 NULL,
	inserted_at timestamp NOT NULL,
	updated_at timestamp NOT NULL,
	"content" bytea NULL,
	CONSTRAINT files_pkey PRIMARY KEY (id)
);


-- "user" определение

-- Drop table

-- DROP TABLE "user";

CREATE TABLE "user" (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	credentials jsonb NULL,
	CONSTRAINT user_pkey PRIMARY KEY (id)
);


-- chat_sessions определение

-- Drop table

-- DROP TABLE chat_sessions;

CREATE TABLE chat_sessions (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	title text NOT NULL,
	title_type text NOT NULL,
	pinned bool DEFAULT false NOT NULL,
	updated_at timestamp NOT NULL,
	seq_id int4 NULL,
	agent text NULL,
	"version" int4 NULL,
	current_message_id int4 NULL,
	inserted_at timestamp NULL,
	user_id uuid NULL,
	CONSTRAINT chat_sessions_pkey PRIMARY KEY (id),
	CONSTRAINT chat_sessions_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES "user"(id)
);


-- embeddings определение

-- Drop table

-- DROP TABLE embeddings;

CREATE TABLE embeddings (
	session_id uuid NOT NULL,
	model_name varchar(80) NOT NULL,
	dimension int4 NOT NULL,
	processing_time_ms float4 NOT NULL,
	embedding_vector jsonb NULL,
	created_at timestamp DEFAULT now() NOT NULL,
	CONSTRAINT embeddings_session_id_model_name_created_at_pk PRIMARY KEY (session_id, model_name, created_at),
	CONSTRAINT embeddings_session_id_chat_sessions_id_fk FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);


-- chat_messages определение

-- Drop table

-- DROP TABLE chat_messages;

CREATE TABLE chat_messages (
	session_id uuid NOT NULL,
	message_id int4 NOT NULL,
	parent_message_id int4 NULL,
	model text NULL,
	"role" text NOT NULL,
	thinking_enabled bool NOT NULL,
	ban_edit bool NOT NULL,
	ban_regenerate bool NOT NULL,
	status text NOT NULL,
	accumulated_token_usage int4 NOT NULL,
	feedback jsonb NULL,
	inserted_at timestamp NOT NULL,
	search_enabled bool NOT NULL,
	has_pending_fragment bool NOT NULL,
	auto_continue bool NOT NULL,
	CONSTRAINT chat_messages_session_id_message_id_pk PRIMARY KEY (session_id, message_id),
	CONSTRAINT chat_messages_session_id_chat_sessions_id_fk FOREIGN KEY (session_id) REFERENCES chat_sessions(id),
	CONSTRAINT chat_messages_session_id_parent_message_id_chat_messages_sessio FOREIGN KEY (session_id,parent_message_id) REFERENCES chat_messages(session_id,message_id)
);
CREATE INDEX chat_messages_parent_idx ON chat_messages USING btree (session_id, parent_message_id);
CREATE INDEX chat_messages_session_id_idx ON chat_messages USING btree (session_id);


-- message_files определение

-- Drop table

-- DROP TABLE message_files;

CREATE TABLE message_files (
	session_id uuid NOT NULL,
	message_id int4 NOT NULL,
	file_id uuid NOT NULL,
	CONSTRAINT message_files_session_id_message_id_file_id_pk PRIMARY KEY (session_id, message_id, file_id),
	CONSTRAINT message_files_file_id_files_id_fk FOREIGN KEY (file_id) REFERENCES files(id),
	CONSTRAINT message_files_session_id_chat_sessions_id_fk FOREIGN KEY (session_id) REFERENCES chat_sessions(id),
	CONSTRAINT message_files_session_id_message_id_chat_messages_session_id_me FOREIGN KEY (session_id,message_id) REFERENCES chat_messages(session_id,message_id)
);
CREATE INDEX message_files_file_idx ON message_files USING btree (file_id);
CREATE INDEX message_files_message_idx ON message_files USING btree (session_id, message_id);


-- message_fragments определение

-- Drop table

-- DROP TABLE message_fragments;

CREATE TABLE message_fragments (
	session_id uuid NOT NULL,
	message_id int4 NOT NULL,
	fragment_order int4 NOT NULL,
	"type" text NOT NULL,
	"content" text NOT NULL,
	elapsed_secs float8 NULL,
	"references" jsonb NULL,
	stage_id int4 NULL,
	"size" int4 NOT NULL,
	CONSTRAINT message_fragments_session_id_message_id_fragment_order_pk PRIMARY KEY (session_id, message_id, fragment_order),
	CONSTRAINT message_fragments_session_id_chat_sessions_id_fk FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
	CONSTRAINT message_fragments_session_id_message_id_chat_messages_session_i FOREIGN KEY (session_id,message_id) REFERENCES chat_messages(session_id,message_id)
);
CREATE INDEX message_fragments_message_idx ON message_fragments USING btree (session_id, message_id);