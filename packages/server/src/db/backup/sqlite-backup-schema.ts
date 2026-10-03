export const SQLITE_BACKUP_VERSION = 1;

export type BackupColumnType =
  | "uuid" | "text" | "boolean" | "integer" | "real" | "timestamp" | "json" | "bytea" | "embedding";

export interface BackupColumn {
  name: string;
  sqliteType: "TEXT" | "INTEGER" | "REAL" | "BLOB";
  type: BackupColumnType;
  notNull?: boolean;
}

export interface BackupTable {
  name: string;
  columns: BackupColumn[];
  primaryKey: string[];
  foreignKeys: Array<{
    columns: string[];
    references: { table: string; columns: string[] };
    onDelete?: "cascade" | "no action";
  }>;
  indexes: Array<{ name: string; columns: string[] }>;
}

export const BACKUP_TABLES: BackupTable[] = [
  { name: "user", columns: [
    {name:"id",sqliteType:"TEXT",type:"uuid",notNull:true},{name:"name",sqliteType:"TEXT",type:"text",notNull:true},{name:"credentials",sqliteType:"TEXT",type:"json"}
  ], primaryKey:["id"], foreignKeys:[], indexes:[] },
  { name:"chat_sessions", columns:[
    {name:"id",sqliteType:"TEXT",type:"uuid",notNull:true},{name:"title",sqliteType:"TEXT",type:"text",notNull:true},{name:"title_type",sqliteType:"TEXT",type:"text",notNull:true},{name:"pinned",sqliteType:"INTEGER",type:"boolean",notNull:true},{name:"updated_at",sqliteType:"TEXT",type:"timestamp",notNull:true},{name:"seq_id",sqliteType:"INTEGER",type:"integer"},{name:"agent",sqliteType:"TEXT",type:"text"},{name:"version",sqliteType:"INTEGER",type:"integer"},{name:"current_message_id",sqliteType:"INTEGER",type:"integer"},{name:"inserted_at",sqliteType:"TEXT",type:"timestamp"},{name:"user_id",sqliteType:"TEXT",type:"uuid"}
  ], primaryKey:["id"], foreignKeys:[{columns:["user_id"],references:{table:"user",columns:["id"]}}], indexes:[] },
  { name:"chat_messages", columns:[
    {name:"session_id",sqliteType:"TEXT",type:"uuid",notNull:true},{name:"message_id",sqliteType:"INTEGER",type:"integer",notNull:true},{name:"parent_message_id",sqliteType:"INTEGER",type:"integer"},{name:"model",sqliteType:"TEXT",type:"text"},{name:"role",sqliteType:"TEXT",type:"text",notNull:true},{name:"thinking_enabled",sqliteType:"INTEGER",type:"boolean",notNull:true},{name:"ban_edit",sqliteType:"INTEGER",type:"boolean",notNull:true},{name:"ban_regenerate",sqliteType:"INTEGER",type:"boolean",notNull:true},{name:"status",sqliteType:"TEXT",type:"text",notNull:true},{name:"accumulated_token_usage",sqliteType:"INTEGER",type:"integer",notNull:true},{name:"feedback",sqliteType:"TEXT",type:"json"},{name:"inserted_at",sqliteType:"TEXT",type:"timestamp",notNull:true},{name:"search_enabled",sqliteType:"INTEGER",type:"boolean",notNull:true},{name:"has_pending_fragment",sqliteType:"INTEGER",type:"boolean",notNull:true},{name:"auto_continue",sqliteType:"INTEGER",type:"boolean",notNull:true}
  ], primaryKey:["session_id","message_id"], foreignKeys:[{columns:["session_id"],references:{table:"chat_sessions",columns:["id"]}},{columns:["session_id","parent_message_id"],references:{table:"chat_messages",columns:["session_id","message_id"]}}], indexes:[{name:"chat_messages_parent_idx",columns:["session_id","parent_message_id"]},{name:"chat_messages_session_id_idx",columns:["session_id"]}] },
  { name:"files", columns:[
    {name:"id",sqliteType:"TEXT",type:"uuid",notNull:true},{name:"status",sqliteType:"TEXT",type:"text",notNull:true},{name:"file_name",sqliteType:"TEXT",type:"text",notNull:true},{name:"previewable",sqliteType:"INTEGER",type:"boolean",notNull:true},{name:"file_size",sqliteType:"INTEGER",type:"integer",notNull:true},{name:"token_usage",sqliteType:"INTEGER",type:"integer",notNull:true},{name:"error_code",sqliteType:"INTEGER",type:"integer"},{name:"inserted_at",sqliteType:"TEXT",type:"timestamp",notNull:true},{name:"updated_at",sqliteType:"TEXT",type:"timestamp",notNull:true},{name:"content",sqliteType:"BLOB",type:"bytea"}
  ], primaryKey:["id"], foreignKeys:[], indexes:[] },
  { name:"message_files", columns:[
    {name:"session_id",sqliteType:"TEXT",type:"uuid",notNull:true},{name:"message_id",sqliteType:"INTEGER",type:"integer",notNull:true},{name:"file_id",sqliteType:"TEXT",type:"uuid",notNull:true}
  ], primaryKey:["session_id","message_id","file_id"], foreignKeys:[{columns:["session_id"],references:{table:"chat_sessions",columns:["id"]}},{columns:["file_id"],references:{table:"files",columns:["id"]}},{columns:["session_id","message_id"],references:{table:"chat_messages",columns:["session_id","message_id"]}}], indexes:[{name:"message_files_message_idx",columns:["session_id","message_id"]},{name:"message_files_file_idx",columns:["file_id"]}] },
  { name:"message_fragments", columns:[
    {name:"session_id",sqliteType:"TEXT",type:"uuid",notNull:true},{name:"message_id",sqliteType:"INTEGER",type:"integer",notNull:true},{name:"fragment_order",sqliteType:"INTEGER",type:"integer",notNull:true},{name:"type",sqliteType:"TEXT",type:"text",notNull:true},{name:"content",sqliteType:"TEXT",type:"text",notNull:true},{name:"elapsed_secs",sqliteType:"REAL",type:"real"},{name:"references",sqliteType:"TEXT",type:"json"},{name:"stage_id",sqliteType:"INTEGER",type:"integer"},{name:"size",sqliteType:"INTEGER",type:"integer",notNull:true}
  ], primaryKey:["session_id","message_id","fragment_order"], foreignKeys:[{columns:["session_id","message_id"],references:{table:"chat_messages",columns:["session_id","message_id"]}}], indexes:[{name:"message_fragments_message_idx",columns:["session_id","message_id"]}] },
  { name:"embeddings", columns:[
    {name:"session_id",sqliteType:"TEXT",type:"uuid",notNull:true},{name:"model_name",sqliteType:"TEXT",type:"text",notNull:true},{name:"created_at",sqliteType:"TEXT",type:"timestamp",notNull:true},{name:"dimension",sqliteType:"INTEGER",type:"integer",notNull:true},{name:"processing_time_ms",sqliteType:"REAL",type:"real",notNull:true},{name:"embedding_vector",sqliteType:"TEXT",type:"embedding"}
  ], primaryKey:["session_id","model_name","created_at"], foreignKeys:[{columns:["session_id"],references:{table:"chat_sessions",columns:["id"]},onDelete:"cascade"}], indexes:[] }
];

export const BACKUP_TABLE_MAP = new Map(BACKUP_TABLES.map((table) => [table.name, table]));
export const BACKUP_TABLE_ORDER = BACKUP_TABLES.map((table) => table.name);
