import { eq, and, sql, desc, SQL, lt, gt } from "drizzle-orm";
import { db_drizzle } from "./drizzle/drizzle-db";
import {
  chatSessionsTable,
  chatMessagesTable,
  filesTable,
  messageFilesTable,
  messageFragmentsTable,
  userTable,
  embeddingsTable,
} from "./drizzle/drizzle-schema";
import { IRepository } from "./IRepository";
import { FragmentType, MessagesBizData, Role } from "./resp";
import { PgTransaction } from "drizzle-orm/pg-core";
import {
  ChatMessage,
  ChatMessageCreate,
  ChatSessions,
  ChatSessionsCreate,
  Embedding,
  EmbeddingCreate,
  MessageFile,
  MessageFileCreate,
  MessageFragment,
  MessageFragmentCreate,
  User,
  UserCreate,
} from "./models";
import { Log } from "@utils/logger";
import "@utils/array-extensions";

type PgTx = PgTransaction<any, any, any>;

export class DrizzleRepository implements IRepository {
  constructor(private client: typeof db_drizzle) {}
  async findAllFiles(): Promise<MessageFile[]> {
    const items = await this.client.select().from(filesTable).orderBy(messageFilesTable.messageId);
    return items.map(
      (file) =>
        new MessageFile({
          ...file,
          sessionId: null!,
          messageId: null!,
        }),
    );
  }

  // ========== Файлы для конкретного сообщения ==========
  async findAllFilesByMessage(sessionId: string, messageId: number): Promise<MessageFile[]> {
    return this.getFilesForMessage(sessionId, messageId);
  }

  // ========== Фрагменты ==========
  async findAllFragments(sessionId: string, messageId?: number): Promise<MessageFragment[]> {
    let s: SQL<unknown> = eq(messageFragmentsTable.sessionId, sessionId);
    if (messageId != null) {
      s = and(s, eq(messageFragmentsTable.messageId, messageId))!;
    }

    const items = await this.client.select().from(messageFragmentsTable).where(s).orderBy(messageFragmentsTable.fragmentOrder);

    return items.map(
      (item) =>
        new MessageFragment({
          ...item,
          type: item.type as FragmentType,
          id: item.fragmentOrder,
        }),
    );
  }

  async findAllFragmentsShrort(sessionId: string, messageId: number): Promise<MessageFragment[]> {
    const items = await this.client
      .select({
        sessionId: messageFragmentsTable.sessionId,
        messageId: messageFragmentsTable.messageId,
        fragmentOrder: messageFragmentsTable.fragmentOrder,
        type: messageFragmentsTable.type,
        size: messageFragmentsTable.size,
      })
      .from(messageFragmentsTable)
      .where(and(eq(messageFragmentsTable.sessionId, sessionId), eq(messageFragmentsTable.messageId, messageId)))
      .orderBy(messageFragmentsTable.fragmentOrder);

    return items.map(
      (item) =>
        new MessageFragment({
          ...item,
          content: "",
          type: item.type as FragmentType,
          id: item.fragmentOrder,
        }),
    );
  }

  async findFragmentById(sessionId: string, messageId: number, fragmentOrder: number): Promise<MessageFragment | null> {
    const [item] = await this.client
      .select()
      .from(messageFragmentsTable)
      .where(
        and(
          eq(messageFragmentsTable.sessionId, sessionId),
          eq(messageFragmentsTable.messageId, messageId),
          eq(messageFragmentsTable.fragmentOrder, fragmentOrder),
        ),
      );
    return item
      ? new MessageFragment({
          ...item,
          type: item.type as FragmentType,
          id: item.fragmentOrder,
        })
      : null;
  }

  // ========== Массовые операции с фрагментами ==========
  async createManyFragments(data: MessageFragmentCreate[], tx?: PgTx): Promise<number> {
    if (data.length === 0) return 0;

    const fragments = data.map((d) => new MessageFragment(d));

    const execute = async (db: PgTx) => {
      const result = await db
        .insert(messageFragmentsTable)
        .values(fragments)
        .onConflictDoUpdate({
          target: [messageFragmentsTable.sessionId, messageFragmentsTable.messageId, messageFragmentsTable.fragmentOrder],
          set: {
            type: sql`excluded.type`,
            content: sql`excluded.content`,
            elapsed_secs: sql`excluded.elapsed_secs`,
            references: sql`excluded.references`,
            stage_id: sql`excluded.stage_id`,
            size: sql`excluded.size`,
          },
        });
      return result.rowCount ?? 0;
    };

    if (tx) {
      return await execute(tx);
    } else {
      return await this.client.transaction(async (newTx) => execute(newTx));
    }
  }

  // ========== Одиночные операции с фрагментами (через массовые) ==========
  async createFragment(data: MessageFragmentCreate, tx?: PgTx): Promise<MessageFragment> {
    const execute = async (db: PgTx) => {
      // Вставляем один фрагмент и возвращаем его
      const fragment = new MessageFragment(data);
      const [result] = await db
        .insert(messageFragmentsTable)
        .values(fragment)
        .onConflictDoUpdate({
          target: [messageFragmentsTable.sessionId, messageFragmentsTable.messageId, messageFragmentsTable.fragmentOrder],
          set: {
            type: sql`excluded.type`,
            content: sql`excluded.content`,
            elapsed_secs: sql`excluded.elapsed_secs`,
            references: sql`excluded.references`,
            stage_id: sql`excluded.stage_id`,
            size: sql`excluded.size`,
          },
        })
        .returning();

      return new MessageFragment({
        ...result,
        id: result.fragmentOrder,
        type: result.type as FragmentType,
      });
    };

    if (tx) {
      return await execute(tx);
    } else {
      return await this.client.transaction(async (newTx) => execute(newTx));
    }
  }

  // ========== Связи файлов с сообщениями ==========
  async addFileToMessage(sessionId: string, messageId: number, fileId: string): Promise<void> {
    await this.client.insert(messageFilesTable).values({ sessionId, messageId, fileId }).onConflictDoNothing();
  }

  async removeFileFromMessage(sessionId: string, messageId: number, fileId: string): Promise<void> {
    await this.client
      .delete(messageFilesTable)
      .where(and(eq(messageFilesTable.sessionId, sessionId), eq(messageFilesTable.messageId, messageId), eq(messageFilesTable.fileId, fileId)));
  }

  async getFilesForMessage(sessionId: string, messageId: number): Promise<MessageFile[]> {
    const items = await this.client
      .select({ file: filesTable })
      .from(messageFilesTable)
      .innerJoin(filesTable, eq(messageFilesTable.fileId, filesTable.id))
      .where(and(eq(messageFilesTable.sessionId, sessionId), eq(messageFilesTable.messageId, messageId)))
      .orderBy(messageFilesTable.messageId);
    return items.map(
      ({ file }) =>
        new MessageFile({
          ...file,
          sessionId,
          messageId,
        }),
    );
  }

  // ========== Сессии ==========
  async findAllSessions(userId: string): Promise<ChatSessions[]> {
    const items = await this.client.select().from(chatSessionsTable).where(eq(chatSessionsTable.user_id, userId));
    return items.map((item) => new ChatSessions({ ...item }));
  }

  async findSessionById(id: string): Promise<ChatSessions | null> {
    const [item] = await this.client.select().from(chatSessionsTable).where(eq(chatSessionsTable.id, id));
    return item ? new ChatSessions({ ...item }) : null;
  }

  // ========== Массовые операции с сессиями ==========
  async createManySessions(data: ChatSessionsCreate[], tx?: PgTx): Promise<number> {
    if (data.length === 0) return 0;

    const sessions = data.map((ch) => new ChatSessions(ch));

    const execute = async (db: PgTx) => {
      const result = await db
        .insert(chatSessionsTable)
        .values(sessions)
        .onConflictDoUpdate({
          target: chatSessionsTable.id,
          set: {
            title: sql`excluded.title`,
            title_type: sql`excluded.title_type`,
            pinned: sql`excluded.pinned`,
            updated_at: sql`excluded.updated_at`,
            seq_id: sql`excluded.seq_id`,
            agent: sql`excluded.agent`,
            version: sql`excluded.version`,
            current_message_id: sql`excluded.current_message_id`,
            inserted_at: sql`excluded.inserted_at`,
            user_id: sql`excluded.user_id`,
          },
        });
      return result.rowCount ?? 0;
    };

    if (tx) {
      return await execute(tx);
    } else {
      return await this.client.transaction(async (newTx) => execute(newTx));
    }
  }

  async createSession(data: ChatSessionsCreate, tx?: PgTx): Promise<ChatSessions> {
    const execute = async (db: PgTx) => {
      const session = new ChatSessions(data);
      const [result] = await db
        .insert(chatSessionsTable)
        .values({ ...session })
        .onConflictDoUpdate({
          target: chatSessionsTable.id,
          set: {
            title: sql`excluded.title`,
            title_type: sql`excluded.title_type`,
            pinned: sql`excluded.pinned`,
            updated_at: sql`excluded.updated_at`,
            seq_id: sql`excluded.seq_id`,
            agent: sql`excluded.agent`,
            version: sql`excluded.version`,
            current_message_id: sql`excluded.current_message_id`,
            inserted_at: sql`excluded.inserted_at`,
            user_id: sql`excluded.user_id`,
          },
        })
        .returning();
      return new ChatSessions({ ...result });
    };

    if (tx) {
      return await execute(tx);
    } else {
      return await this.client.transaction(async (newTx) => execute(newTx));
    }
  }

  // ========== Файлы ==========
  async findFileById(id: string): Promise<MessageFile | null> {
    const result = await this.client
      .select({
        file: filesTable,
        link: messageFilesTable,
      })
      .from(filesTable)
      .innerJoin(messageFilesTable, eq(filesTable.id, messageFilesTable.fileId))
      .where(eq(filesTable.id, id))
      .limit(1);

    if (result.length === 0) return null;

    const { file, link } = result[0];
    return new MessageFile({
      ...link,
      ...file,
    });
  }

  // ========== Массовые операции с файлами ==========
  async createManyFiles(data: MessageFileCreate[], tx?: PgTx): Promise<number> {
    if (data.length === 0) return 0;

    const messageFiles = data.map((d) => new MessageFile(d));
    const fileDbValues = messageFiles.uniqueBy((u) => u.id);
    const linkValues = messageFiles
      .filter((mf) => mf.sessionId && mf.messageId)
      .map((mf) => ({
        sessionId: mf.sessionId,
        messageId: mf.messageId,
        fileId: mf.id,
      }))
      .uniqueBy((a) => `${a.sessionId}=${a.messageId}=${a.fileId}`);

    const execute = async (db: PgTx) => {
      if (fileDbValues.length > 0) {
        await db
          .insert(filesTable)
          .values(fileDbValues)
          .onConflictDoUpdate({
            target: filesTable.id,
            set: {
              status: sql`excluded.status`,
              file_name: sql`excluded.file_name`,
              previewable: sql`excluded.previewable`,
              file_size: sql`excluded.file_size`,
              token_usage: sql`excluded.token_usage`,
              error_code: sql`excluded.error_code`,
              inserted_at: sql`excluded.inserted_at`,
              updated_at: sql`excluded.updated_at`,
              content: sql`excluded.content`,
            },
          });
      }

      if (linkValues.length > 0) {
        await db
          .insert(messageFilesTable)
          .values(linkValues)
          .onConflictDoNothing({
            target: [messageFilesTable.sessionId, messageFilesTable.messageId, messageFilesTable.fileId],
          });
      }
    };

    if (tx) {
      await execute(tx);
      return data.length;
    } else {
      return await this.client.transaction(async (newTx) => {
        await execute(newTx);
        return data.length;
      });
    }
  }

  async createFile(data: MessageFileCreate, tx?: PgTx): Promise<MessageFile> {
    const execute = async (db: PgTx) => {
      // Вставка одного файла с returning
      const messageFile = new MessageFile(data);
      const [result] = await db
        .insert(filesTable)
        .values({ ...messageFile })
        .onConflictDoUpdate({
          target: filesTable.id,
          set: {
            status: sql`excluded.status`,
            file_name: sql`excluded.file_name`,
            previewable: sql`excluded.previewable`,
            file_size: sql`excluded.file_size`,
            token_usage: sql`excluded.token_usage`,
            error_code: sql`excluded.error_code`,
            inserted_at: sql`excluded.inserted_at`,
            updated_at: sql`excluded.updated_at`,
            content: sql`excluded.content`,
          },
        })
        .returning();

      // Создание связи, если есть контекст
      if (messageFile.sessionId && messageFile.messageId) {
        await db
          .insert(messageFilesTable)
          .values({
            sessionId: messageFile.sessionId,
            messageId: messageFile.messageId,
            fileId: messageFile.id,
          })
          .onConflictDoNothing();
      }

      return new MessageFile({
        ...data,
        ...result,
      });
    };

    if (tx) {
      return await execute(tx);
    } else {
      return await this.client.transaction(async (newTx) => execute(newTx));
    }
  }

  // ========== Сообщения ==========
  async findAllMessages(sessionId: string): Promise<ChatMessage[]> {
    const items = await this.client.select().from(chatMessagesTable).where(eq(chatMessagesTable.sessionId, sessionId));
    return items.map(
      (item) =>
        new ChatMessage({
          ...item,
          accumulated_token_usage: item.accumulatedTokenUsage,
          auto_continue: item.autoContinue,
          ban_edit: item.banEdit,
          ban_regenerate: item.banRegenerate,

          files: [], // можно до загрузить, но для простоты оставляем пустым
          fragments: [],
          has_pending_fragment: item.hasPendingFragment,
          inserted_at: item.insertedAt,
          message_id: item.messageId,
          model: item.model!,
          parent_id: item.parentMessageId,
          role: item.role as Role,
          search_enabled: item.searchEnabled,
          thinking_enabled: item.thinkingEnabled,
        }),
    );
  }

  async findMessageById(sessionId: string, messageId: number): Promise<ChatMessage | null> {
    const [item] = await this.client
      .select()
      .from(chatMessagesTable)
      .where(and(eq(chatMessagesTable.sessionId, sessionId), eq(chatMessagesTable.messageId, messageId)));
    return item
      ? new ChatMessage({
          ...item,
          accumulated_token_usage: item.accumulatedTokenUsage,
          auto_continue: item.autoContinue,
          ban_edit: item.banEdit,
          ban_regenerate: item.banRegenerate,
          files: [], // можно до загрузить, но для простоты оставляем пустым
          fragments: [],
          has_pending_fragment: item.hasPendingFragment,
          inserted_at: item.insertedAt,
          message_id: item.messageId,
          model: item.model!,
          parent_id: item.parentMessageId,
          role: item.role as Role,
          search_enabled: item.searchEnabled,
          thinking_enabled: item.thinkingEnabled,
        })
      : null;
  }

  // ========== Массовые операции с сообщениями ==========
  async createManyMessages(sessionId: string, messages: ChatMessageCreate[], tx?: PgTx): Promise<number> {
    if (messages.length === 0) return 0;

    const chatMessages = messages.map((msg) => new ChatMessage({ ...msg, sessionId }));

    const messageFiles = messages.flatMap((msg) => msg.files.map((file) => ({ ...file, sessionId, messageId: msg.message_id }) as MessageFileCreate));
    const fragments = messages.flatMap((msg) =>
      msg.fragments.map(
        (frag) =>
          ({
            ...frag,
            sessionId,
            messageId: msg.message_id,
          }) as MessageFragmentCreate,
      ),
    );

    const execute = async (db: PgTx) => {
      // Вставка сообщений
      if (chatMessages.length > 0) {
        await db
          .insert(chatMessagesTable)
          .values(chatMessages)
          .onConflictDoUpdate({
            target: [chatMessagesTable.sessionId, chatMessagesTable.messageId],
            set: {
              parentMessageId: sql`excluded.parent_message_id`,
              model: sql`excluded.model`,
              role: sql`excluded.role`,
              thinkingEnabled: sql`excluded.thinking_enabled`,
              banEdit: sql`excluded.ban_edit`,
              banRegenerate: sql`excluded.ban_regenerate`,
              status: sql`excluded.status`,
              accumulatedTokenUsage: sql`excluded.accumulated_token_usage`,
              feedback: sql`excluded.feedback`,
              insertedAt: sql`excluded.inserted_at`,
              searchEnabled: sql`excluded.search_enabled`,
              hasPendingFragment: sql`excluded.has_pending_fragment`,
              autoContinue: sql`excluded.auto_continue`,
            },
          });
      }

      // Вставка файлов и связей
      await this.createManyFiles(messageFiles, db);

      // Вставка фрагментов
      await this.createManyFragments(fragments, db);
    };

    if (tx) {
      await execute(tx);
      return messages.length;
    } else {
      return await this.client.transaction(async (newTx) => {
        await execute(newTx);
        return messages.length;
      });
    }
  }

  async createMessage(data: ChatMessageCreate, tx?: PgTx): Promise<ChatMessage> {
    const { sessionId, files = [], fragments = [] } = data;

    const execute = async (db: PgTx) => {
      // Создаём само сообщение
      const message = new ChatMessage({ ...data, sessionId });
      const [insertedMessage] = await db
        .insert(chatMessagesTable)
        .values(message)
        .onConflictDoUpdate({
          target: [chatMessagesTable.sessionId, chatMessagesTable.messageId],
          set: {
            parentMessageId: sql`excluded.parent_message_id`,
            model: sql`excluded.model`,
            role: sql`excluded.role`,
            thinkingEnabled: sql`excluded.thinking_enabled`,
            banEdit: sql`excluded.ban_edit`,
            banRegenerate: sql`excluded.ban_regenerate`,
            status: sql`excluded.status`,
            accumulatedTokenUsage: sql`excluded.accumulated_token_usage`,
            feedback: sql`excluded.feedback`,
            insertedAt: sql`excluded.inserted_at`,
            searchEnabled: sql`excluded.search_enabled`,
            hasPendingFragment: sql`excluded.has_pending_fragment`,
            autoContinue: sql`excluded.auto_continue`,
          },
        })
        .returning();

      // Сохраняем файлы и связи (используем массовый метод)
      if (files.length > 0) {
        const fileCreates = files.map((file) => ({ ...file, sessionId, messageId: message.messageId }));
        await this.createManyFiles(fileCreates, db);
      }

      // Сохраняем фрагменты
      if (fragments.length > 0) {
        const fragmentCreates = fragments.map((frag) => ({
          ...frag,
          sessionId,
          messageId: message.messageId,
          id: frag.id,
        }));
        await this.createManyFragments(fragmentCreates, db);
      }

      return new ChatMessage({
        ...insertedMessage,
        files: [],
        fragments: [],
        ban_edit: insertedMessage.banEdit,
        ban_regenerate: insertedMessage.banRegenerate,
        auto_continue: insertedMessage.autoContinue,
        accumulated_token_usage: insertedMessage.accumulatedTokenUsage,
        has_pending_fragment: insertedMessage.hasPendingFragment,
        inserted_at: insertedMessage.insertedAt,
        message_id: insertedMessage.messageId,
        model: insertedMessage.model!,
        parent_id: insertedMessage.parentMessageId,
        role: insertedMessage.role as Role,
        search_enabled: insertedMessage.searchEnabled,
        thinking_enabled: insertedMessage.thinkingEnabled,
      });
    };

    if (tx) {
      return await execute(tx);
    } else {
      return await this.client.transaction(async (newTx) => execute(newTx));
    }
  }

  // ========== Users ==========
  async findAllUsers(): Promise<User[]> {
    const items = await this.client.select().from(userTable);
    return items.map((item) => new User({ ...item }));
  }

  async findUserById(id: string): Promise<User | null> {
    const [item] = await this.client.select().from(userTable).where(eq(userTable.id, id));
    return item ? new User({ ...item }) : null;
  }

  // ========== Массовые операции с пользователями ==========
  async createManyUsers(data: UserCreate[], tx?: PgTx): Promise<number> {
    if (data.length === 0) return 0;

    const users = data.map((d) => new User({ ...d, id: d.id ?? crypto.randomUUID() }));

    const execute = async (db: PgTx) => {
      const result = await db
        .insert(userTable)
        .values(users.map((u) => ({ ...u })))
        .onConflictDoUpdate({
          target: userTable.id,
          set: {
            name: sql`excluded.name`,
            credentials: sql`excluded.credentials`,
          },
        });
      return result.rowCount ?? 0;
    };

    if (tx) {
      return await execute(tx);
    } else {
      return await this.client.transaction(async (newTx) => execute(newTx));
    }
  }

  async createUser(data: UserCreate, tx?: PgTx): Promise<User> {
    const execute = async (db: PgTx) => {
      const user = new User(data);
      const [result] = await db
        .insert(userTable)
        .values({ ...user })
        .onConflictDoUpdate({
          target: userTable.id,
          set: {
            name: sql`excluded.name`,
            credentials: sql`excluded.credentials`,
          },
        })
        .returning();
      return new User({ ...result });
    };

    if (tx) {
      return await execute(tx);
    } else {
      return await this.client.transaction(async (newTx) => execute(newTx));
    }
  }

  async deleteUser(id: string): Promise<boolean> {
    const [deleted] = await this.client.delete(userTable).where(eq(userTable.id, id)).returning({ id: userTable.id });
    return !!deleted;
  }

  // ========== Интеграционный метод для MessagesBizData ==========
  async createMessagesBizData(user_id: string, data: MessagesBizData, tx?: PgTx): Promise<void> {
    const { chat_session, chat_messages } = data;

    const sessionData: ChatSessionsCreate = {
      ...chat_session,
      user_id,
    };

    const execute = async (db: PgTx) => {
      await this.createSession(sessionData, db);
      await this.createManyMessages(
        chat_session.id,
        chat_messages.map((m) => ({ ...m, sessionId: chat_session.id })),
        db,
      );
    };

    if (tx) {
      await execute(tx);
    } else {
      await this.client.transaction(async (newTx) => {
        await execute(newTx);
      });
    }
  }

  // ========== Embeddings ==========
  async findEmbeddingsBySession(sessionId: string, tx?: PgTransaction<any, any, any>): Promise<Embedding[]> {
    const db = tx || this.client;
    const items = await db.select().from(embeddingsTable).where(eq(embeddingsTable.sessionId, sessionId)).orderBy(desc(embeddingsTable.createdAt)); // по желанию

    return items.map((item) => new Embedding({ ...item }));
  }

  async findEmbeddingsByDate(createdAt: Date, modelname?: string, tx?: PgTransaction<any, any, any>): Promise<Embedding[]> {
    const db = tx || this.client;
    const items = await db
      .select({
        sessionId: embeddingsTable.sessionId,
        model_name: embeddingsTable.model_name,
        createdAt: embeddingsTable.createdAt,
        processing_time_ms: embeddingsTable.processing_time_ms,
      })
      .from(embeddingsTable)
      .where(gt(embeddingsTable.createdAt, createdAt))
      .orderBy(desc(embeddingsTable.createdAt)); // по желанию
    return items.map((item) => new Embedding({ ...item }));
  }

  async findEmbeddingBySessionAndModel(sessionId: string, modelName: string, tx?: PgTransaction<any, any, any>): Promise<Embedding | null> {
    const db = tx || this.client;
    const [item] = await db
      .select()
      .from(embeddingsTable)
      .where(and(eq(embeddingsTable.sessionId, sessionId), eq(embeddingsTable.model_name, modelName)))
      .orderBy(desc(embeddingsTable.createdAt))
      .limit(1);

    if (!item) return null;

    return new Embedding({ ...item });
  }

  async createManyEmbeddings(sessionId: string, data: EmbeddingCreate[], tx?: PgTransaction<any, any, any>): Promise<number> {
    if (data.length === 0) return 0;

    const embeddings = data.map((d) => new Embedding({ ...d, sessionId }));

    const execute = async (db: typeof db_drizzle | PgTransaction<any, any, any>) => {
      const result = await db
        .insert(embeddingsTable)
        .values(embeddings)
        .onConflictDoUpdate({
          target: [embeddingsTable.sessionId, embeddingsTable.model_name, embeddingsTable.createdAt],
          set: {
            dimension: sql`excluded.dimension`,
            processing_time_ms: sql`excluded.processing_time_ms`,
            embedding: sql`excluded.embedding_vector`,
          },
        });
      return result.rowCount ?? 0;
    };

    if (tx) {
      return await execute(tx);
    } else {
      return await this.client.transaction(async (newTx) => execute(newTx));
    }
  }

  @Log
  async createEmbedding(sessionId: string, data: EmbeddingCreate, tx?: PgTransaction<any, any, any>): Promise<Embedding> {
    const execute = async (db: typeof db_drizzle | PgTransaction<any, any, any>) => {
      const embedding = new Embedding({
        ...data,
        sessionId,
      });

      const [result] = await db
        .insert(embeddingsTable)
        .values(embedding)
        .onConflictDoUpdate({
          target: [embeddingsTable.sessionId, embeddingsTable.model_name, embeddingsTable.createdAt],
          set: {
            dimension: sql`excluded.dimension`,
            processing_time_ms: sql`excluded.processing_time_ms`,
            embedding: sql`excluded.embedding_vector`,
          },
        })
        .returning();

      return new Embedding(result);
    };

    if (tx) {
      return await execute(tx);
    } else {
      return await this.client.transaction(async (newTx) => execute(newTx));
    }
  }

  // ========== Дополнительный метод для получения всех сессий ==========
  async findAllSessionsAll(): Promise<ChatSessions[]> {
    const items = await this.client.select().from(chatSessionsTable);
    return items.map((item) => new ChatSessions({ ...item }));
  }
}
