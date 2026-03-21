import { eq, and, sql } from "drizzle-orm";
import { db_drizzle } from "./drizzle/drizzle-db";
import { chatSessionsTable, chatMessagesTable, filesTable, messageFilesTable, messageFragmentsTable, userTable } from "./drizzle/drizzle-schema";
import { ChatSessions } from "./models/ChatSessions";
import { ChatSessionsCreate } from "./models/ChatSessionsCreate";
import { MessageFile } from "./models/MessageFile";
import { MessageFileCreate } from "./models/MessageFileCreate";
import { ChatMessage } from "./models/ChatMessage";
import { ChatMessageCreate } from "./models/ChatMessageCreate";
import { MessageFragmentCreate } from "./models/MessageFragmentCreate";
import { MessageFragment } from "./models/MessageFragment";
import { IRepository } from "./IRepository";
import { FragmentType, MessagesBizData, Role } from "./resp";
import { User } from "./models/User";
import { UserCreate } from "./models/UserCreate";
import { PgTransaction } from "drizzle-orm/pg-core";

// DrizzleRepository.ts (дополнения)

import { embeddingsTable } from "./drizzle/drizzle-schema";
import { Embedding } from "./models/Embedding";
import { EmbeddingCreate } from "./models/EmbeddingCreate";

type PgTx = PgTransaction<any, any, any>;

export class DrizzleRepository implements IRepository {
  constructor(private client: typeof db_drizzle) {}

  // ========== Файлы для конкретного сообщения ==========
  async findAllFiles(sessionId: string, messageId: number): Promise<MessageFile[]> {
    return this.getFilesForMessage(sessionId, messageId);
  }

  // ========== Фрагменты ==========
  async findAllFragments(sessionId: string, messageId: number): Promise<MessageFragment[]> {
    const items = await this.client
      .select()
      .from(messageFragmentsTable)
      .where(and(eq(messageFragmentsTable.sessionId, sessionId), eq(messageFragmentsTable.messageId, messageId)))
      .orderBy(messageFragmentsTable.fragmentOrder);

    return items.map(
      (item) =>
        new MessageFragment({
          elapsed_secs: item.elapsedSecs,
          stage_id: item.stageId,
          content: item.content,
          messageId: item.messageId,
          references: item.references,
          sessionId: item.sessionId,
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
      })
      .from(messageFragmentsTable)
      .where(and(eq(messageFragmentsTable.sessionId, sessionId), eq(messageFragmentsTable.messageId, messageId)))
      .orderBy(messageFragmentsTable.fragmentOrder);

    return items.map(
      (item) =>
        new MessageFragment({
          content: "",
          messageId: item.messageId,
          sessionId: item.sessionId,
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
          elapsed_secs: item.elapsedSecs,
          stage_id: item.stageId,
          content: item.content,
          messageId: item.messageId,
          references: item.references,
          sessionId: item.sessionId,
          type: item.type as FragmentType,
          id: item.fragmentOrder,
        })
      : null;
  }

  // ========== Массовые операции с фрагментами ==========
  async createManyFragments(data: MessageFragmentCreate[], tx?: PgTx): Promise<number> {
    if (data.length === 0) return 0;

    const fragments = data.map((d) => new MessageFragment(d));
    const values = fragments.map((f) => ({
      sessionId: f.sessionId,
      messageId: f.messageId,
      fragmentOrder: f.fragmentOrder,
      type: f.type,
      content: f.content,
      elapsedSecs: f.elapsedSecs,
      references: f.references,
      stageId: f.stageId,
    }));

    const execute = async (db: PgTx) => {
      const result = await db
        .insert(messageFragmentsTable)
        .values(values)
        .onConflictDoUpdate({
          target: [messageFragmentsTable.sessionId, messageFragmentsTable.messageId, messageFragmentsTable.fragmentOrder],
          set: {
            type: sql`excluded.type`,
            content: sql`excluded.content`,
            elapsedSecs: sql`excluded.elapsed_secs`,
            references: sql`excluded.references`,
            stageId: sql`excluded.stage_id`,
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
        .values({
          sessionId: fragment.sessionId,
          messageId: fragment.messageId,
          fragmentOrder: fragment.fragmentOrder,
          type: fragment.type,
          content: fragment.content,
          elapsedSecs: fragment.elapsedSecs,
          references: fragment.references,
          stageId: fragment.stageId,
        })
        .onConflictDoUpdate({
          target: [messageFragmentsTable.sessionId, messageFragmentsTable.messageId, messageFragmentsTable.fragmentOrder],
          set: {
            type: sql`excluded.type`,
            content: sql`excluded.content`,
            elapsedSecs: sql`excluded.elapsed_secs`,
            references: sql`excluded.references`,
            stageId: sql`excluded.stage_id`,
          },
        })
        .returning();

      return new MessageFragment({
        content: result.content,
        id: result.fragmentOrder,
        messageId: result.messageId,
        sessionId: result.sessionId,
        type: result.type as FragmentType,
        elapsed_secs: result.elapsedSecs,
        references: result.references,
        stage_id: result.stageId,
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
      .where(and(eq(messageFilesTable.sessionId, sessionId), eq(messageFilesTable.messageId, messageId)));

    return items.map(
      ({ file }) =>
        new MessageFile({
          sessionId,
          messageId,
          error_code: file.errorCode,
          file_name: file.fileName,
          file_size: file.fileSize,
          id: file.id,
          inserted_at: file.insertedAt,
          previewable: file.previewable,
          status: file.status,
          token_usage: file.tokenUsage,
          updated_at: file.updatedAt,
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
    const values = sessions.map((s) => ({ ...s }));

    const execute = async (db: PgTx) => {
      const result = await db
        .insert(chatSessionsTable)
        .values(values)
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
      sessionId: link.sessionId,
      messageId: link.messageId,
      error_code: file.errorCode,
      file_name: file.fileName,
      file_size: file.fileSize,
      id: file.id,
      inserted_at: file.insertedAt,
      previewable: file.previewable,
      status: file.status,
      token_usage: file.tokenUsage,
      updated_at: file.updatedAt,
    });
  }

  // ========== Массовые операции с файлами ==========
  async createManyFiles(data: MessageFileCreate[], tx?: PgTx): Promise<number> {
    if (data.length === 0) return 0;

    const messageFiles = data.map((d) => new MessageFile(d));
    const fileDbValues = messageFiles
      .map((mf) => ({
        id: mf.id,
        status: mf.status,
        fileName: mf.fileName,
        previewable: mf.previewable,
        fileSize: mf.fileSize,
        tokenUsage: mf.tokenUsage,
        errorCode: mf.errorCode,
        insertedAt: mf.insertedAt,
        updatedAt: mf.updatedAt,
      }))
      .uniqueBy((u) => u.id);
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
              fileName: sql`excluded.file_name`,
              previewable: sql`excluded.previewable`,
              fileSize: sql`excluded.file_size`,
              tokenUsage: sql`excluded.token_usage`,
              errorCode: sql`excluded.error_code`,
              insertedAt: sql`excluded.inserted_at`,
              updatedAt: sql`excluded.updated_at`,
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
        .values({
          id: messageFile.id,
          status: messageFile.status,
          fileName: messageFile.fileName,
          previewable: messageFile.previewable,
          fileSize: messageFile.fileSize,
          tokenUsage: messageFile.tokenUsage,
          errorCode: messageFile.errorCode,
          insertedAt: messageFile.insertedAt,
          updatedAt: messageFile.updatedAt,
        })
        .onConflictDoUpdate({
          target: filesTable.id,
          set: {
            status: sql`excluded.status`,
            fileName: sql`excluded.file_name`,
            previewable: sql`excluded.previewable`,
            fileSize: sql`excluded.file_size`,
            tokenUsage: sql`excluded.token_usage`,
            errorCode: sql`excluded.error_code`,
            insertedAt: sql`excluded.inserted_at`,
            updatedAt: sql`excluded.updated_at`,
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
        error_code: result.errorCode,
        file_name: result.fileName,
        file_size: result.fileSize,
        inserted_at: result.insertedAt,
        token_usage: result.tokenUsage,
        updated_at: result.updatedAt,
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
            id: frag.id,
          }) as MessageFragmentCreate,
      ),
    );

    const execute = async (db: PgTx) => {
      // Вставка сообщений
      if (chatMessages.length > 0) {
        const messageValues = chatMessages.map((m) => ({
          sessionId: m.sessionId,
          messageId: m.messageId,
          parentMessageId: m.parentMessageId,
          model: m.model,
          role: m.role,
          thinkingEnabled: m.thinkingEnabled,
          banEdit: m.banEdit,
          banRegenerate: m.banRegenerate,
          status: m.status,
          accumulatedTokenUsage: m.accumulatedTokenUsage,
          feedback: m.feedback,
          insertedAt: m.insertedAt,
          searchEnabled: m.searchEnabled,
          hasPendingFragment: m.hasPendingFragment,
          autoContinue: m.autoContinue,
        }));

        await db
          .insert(chatMessagesTable)
          .values(messageValues)
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
        .values({
          sessionId: message.sessionId,
          messageId: message.messageId,
          parentMessageId: message.parentMessageId,
          model: message.model,
          role: message.role,
          thinkingEnabled: message.thinkingEnabled,
          banEdit: message.banEdit,
          banRegenerate: message.banRegenerate,
          status: message.status,
          accumulatedTokenUsage: message.accumulatedTokenUsage,
          feedback: message.feedback,
          insertedAt: message.insertedAt,
          searchEnabled: message.searchEnabled,
          hasPendingFragment: message.hasPendingFragment,
          autoContinue: message.autoContinue,
        })
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
        accumulated_token_usage: insertedMessage.accumulatedTokenUsage,
        auto_continue: insertedMessage.autoContinue,
        ban_edit: insertedMessage.banEdit,
        ban_regenerate: insertedMessage.banRegenerate,
        feedback: insertedMessage.feedback,
        files: [],
        fragments: [],
        has_pending_fragment: insertedMessage.hasPendingFragment,
        inserted_at: insertedMessage.insertedAt,
        message_id: insertedMessage.messageId,
        model: insertedMessage.model!,
        parent_id: insertedMessage.parentMessageId,
        role: insertedMessage.role as Role,
        search_enabled: insertedMessage.searchEnabled,
        sessionId: insertedMessage.sessionId,
        status: insertedMessage.status,
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

  // внутри класса DrizzleRepository:

  // ========== Embeddings ==========
  async findEmbeddingsBySession(sessionId: string, tx?: PgTransaction<any, any, any>): Promise<Embedding[]> {
    const db = tx || this.client;
    const items = await db.select().from(embeddingsTable).where(eq(embeddingsTable.sessionId, sessionId));
    return items.map((item) => new Embedding(item));
  }

  async findEmbeddingBySessionAndModel(sessionId: string, modelName: string, tx?: PgTransaction<any, any, any>): Promise<Embedding | null> {
    const db = tx || this.client;
    const [item] = await db
      .select()
      .from(embeddingsTable)
      .where(and(eq(embeddingsTable.sessionId, sessionId), eq(embeddingsTable.model_name, modelName)))
      .limit(1);
    return item ? new Embedding(item) : null;
  }

  async createManyEmbeddings(sessionId: string, data: EmbeddingCreate[], tx?: PgTransaction<any, any, any>): Promise<number> {
    if (data.length === 0) return 0;

    const embeddings = data.map((d) => new Embedding({ ...d, sessionId }));

    const execute = async (db: typeof db_drizzle | PgTransaction<any, any, any>) => {
      const result = await db
        .insert(embeddingsTable)
        .values(embeddings)
        .onConflictDoUpdate({
          target: [embeddingsTable.sessionId, embeddingsTable.model_name], // если такой эмбеддинг уже есть – обновляем
          set: {
            dimension: sql`excluded.dimension`,
            processing_time_ms: sql`excluded.processing_time_ms`,
            createdAt: sql`excluded.created_at`,
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

  async createEmbedding(sessionId: string, data: EmbeddingCreate, tx?: PgTransaction<any, any, any>): Promise<Embedding> {
    const execute = async (db: typeof db_drizzle | PgTransaction<any, any, any>) => {
      const embedding = new Embedding({ ...data, sessionId });
      const [result] = await db
        .insert(embeddingsTable)
        .values(embedding)
        .onConflictDoUpdate({
          target: [embeddingsTable.sessionId, embeddingsTable.model_name],
          set: {
            dimension: sql`excluded.dimension`,
            processing_time_ms: sql`excluded.processing_time_ms`,
            createdAt: sql`excluded.created_at`,
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
