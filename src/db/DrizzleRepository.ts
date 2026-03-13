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

export class DrizzleRepository implements IRepository {
  constructor(private client: typeof db_drizzle) {}

  // ========== Файлы для конкретного сообщения (соответствует сигнатуре IRepository) ==========
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
  /**
   * Найти фрагмент по составному ключу (sessionId, messageId, fragmentOrder)
   */
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

  /**
   * Создать или обновить один фрагмент
   */
  async createFragment(data: MessageFragmentCreate): Promise<MessageFragment> {
    const fragment = new MessageFragment(data);
    const [result] = await this.client
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
  }

  /**
   * Массовое создание/обновление фрагментов
   */
  async createManyFragments(data: MessageFragmentCreate[]): Promise<number> {
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

    const result = await this.client
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
  }

  // ========== Связи файлов с сообщениями ==========
  async addFileToMessage(sessionId: string, messageId: number, fileId: string): Promise<void> {
    await this.client
      .insert(messageFilesTable)
      .values({
        sessionId,
        messageId,
        fileId,
      })
      .onConflictDoNothing();
  }

  async removeFileFromMessage(sessionId: string, messageId: number, fileId: string): Promise<void> {
    await this.client
      .delete(messageFilesTable)
      .where(and(eq(messageFilesTable.sessionId, sessionId), eq(messageFilesTable.messageId, messageId), eq(messageFilesTable.fileId, fileId)));
  }

  async getFilesForMessage(sessionId: string, messageId: number): Promise<MessageFile[]> {
    const items = await this.client
      .select({
        file: filesTable,
      })
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
          inserted_at: file.insertedAt, // Date → конструктор примет
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

  async createSession(data: ChatSessionsCreate): Promise<ChatSessions> {
    const session = new ChatSessions(data);
    const [result] = await this.client
      .insert(chatSessionsTable)
      .values(session) // session содержит все поля в camelCase, даты уже Date
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
  }

  async createManySessions(data: ChatSessionsCreate[]): Promise<number> {
    if (data.length === 0) return 0;
    const sessions = data.map((ch) => new ChatSessions(ch));
    const result = await this.client
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
  }

  // ========== Файлы (создание и поиск) ==========
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

  async createFile(data: MessageFileCreate): Promise<MessageFile> {
    const messageFile = new MessageFile(data); // единая точка преобразования

    return await this.client.transaction(async (tx) => {
      // 1. Вставка/обновление в filesTable
      const [result] = await tx
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

      // 2. Вставка связи в messageFilesTable (если есть контекст)
      if (messageFile.sessionId && messageFile.messageId) {
        await tx
          .insert(messageFilesTable)
          .values({
            sessionId: messageFile.sessionId,
            messageId: messageFile.messageId,
            fileId: messageFile.id,
          })
          .onConflictDoNothing();
      }

      // Возвращаем MessageFile с актуальными данными
      return new MessageFile({
        ...data,
        error_code: result.errorCode,
        file_name: result.fileName,
        file_size: result.fileSize,
        id: result.id,
        inserted_at: result.insertedAt,
        previewable: result.previewable,
        status: result.status,
        token_usage: result.tokenUsage,
        updated_at: result.updatedAt,
      });
    });
  }

  async createManyFiles(data: MessageFileCreate[], tx?: PgTransaction<any, any, any>): Promise<number> {
    if (data.length === 0) return 0;

    const messageFiles = data.map((d) => new MessageFile(d));
    const fileDbValues = messageFiles.map((mf) => ({
      id: mf.id,
      status: mf.status,
      fileName: mf.fileName,
      previewable: mf.previewable,
      fileSize: mf.fileSize,
      tokenUsage: mf.tokenUsage,
      errorCode: mf.errorCode,
      insertedAt: mf.insertedAt,
      updatedAt: mf.updatedAt,
    }));
    const linkValues = messageFiles
      .filter((mf) => mf.sessionId && mf.messageId)
      .map((mf) => ({
        sessionId: mf.sessionId,
        messageId: mf.messageId,
        fileId: mf.id,
      }));

    // Функция, выполняющая операции с БД
    const execute = async (db: typeof db_drizzle | PgTransaction<any, any, any>) => {
      // 1. Массовая вставка/обновление файлов
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

      // 2. Массовая вставка связей
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
      // Используем переданную транзакцию
      await execute(tx);
      return data.length;
    } else {
      // Создаём собственную транзакцию
      return await this.client.transaction(async (newTx) => {
        await execute(newTx);
        return data.length;
      });
    }
  }

  // ========== Сообщения ==========
  async findAllMessages(sessionId: string): Promise<ChatMessage[]> {
    const items = await this.client.select().from(chatMessagesTable).where(eq(chatMessagesTable.sessionId, sessionId));
    return items.map(
      (item) =>
        new ChatMessage({
          accumulated_token_usage: item.accumulatedTokenUsage,
          auto_continue: item.autoContinue,
          ban_edit: item.banEdit,
          ban_regenerate: item.banRegenerate,
          feedback: item.feedback,
          files: [], // можно до загрузить, но для простоты оставляем пустым
          fragments: [],
          has_pending_fragment: item.hasPendingFragment,
          inserted_at: item.insertedAt,
          message_id: item.messageId,
          model: item.model!,
          parent_id: item.parentMessageId,
          role: item.role as Role,
          search_enabled: item.searchEnabled,
          sessionId: item.sessionId,
          status: item.status,
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
          accumulated_token_usage: item.accumulatedTokenUsage,
          auto_continue: item.autoContinue,
          ban_edit: item.banEdit,
          ban_regenerate: item.banRegenerate,
          feedback: item.feedback,
          files: [],
          fragments: [],
          has_pending_fragment: item.hasPendingFragment,
          inserted_at: item.insertedAt,
          message_id: item.messageId,
          model: item.model!,
          parent_id: item.parentMessageId,
          role: item.role as Role,
          search_enabled: item.searchEnabled,
          sessionId: item.sessionId,
          status: item.status,
          thinking_enabled: item.thinkingEnabled,
        })
      : null;
  }

  async createMessage(data: ChatMessageCreate): Promise<ChatMessage> {
    const { sessionId, files = [], fragments, ...rest } = data;

    return await this.client.transaction(async (tx) => {
      const message = new ChatMessage({ ...data, sessionId });

      // 1. Сообщение
      const [insertedMessage] = await tx
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

      // 2. Файлы
      for (const fileData of files) {
        let file = await tx
          .select()
          .from(filesTable)
          .where(eq(filesTable.id, fileData.id))
          .limit(1)
          .then((rows) => rows[0]);

        if (!file) {
          const newMessageFile = new MessageFile({
            ...fileData,
            sessionId,
            messageId: message.messageId,
          });
          const newFileData = {
            id: newMessageFile.id,
            status: newMessageFile.status,
            fileName: newMessageFile.fileName,
            previewable: newMessageFile.previewable,
            fileSize: newMessageFile.fileSize,
            tokenUsage: newMessageFile.tokenUsage,
            errorCode: newMessageFile.errorCode,
            insertedAt: newMessageFile.insertedAt,
            updatedAt: newMessageFile.updatedAt,
          };
          [file] = await tx.insert(filesTable).values(newFileData).returning();
        }

        await tx
          .insert(messageFilesTable)
          .values({
            sessionId: message.sessionId,
            messageId: message.messageId,
            fileId: file.id,
          })
          .onConflictDoNothing();
      }

      // 3. Фрагменты
      if (fragments && fragments.length > 0) {
        const fragmentInserts = fragments.map((frag) => {
          const fragCreate: MessageFragmentCreate = {
            ...frag,
            sessionId: message.sessionId,
            messageId: message.messageId,
            id: frag.id,
          };
          const fragment = new MessageFragment(fragCreate);
          return {
            sessionId: fragment.sessionId,
            messageId: fragment.messageId,
            fragmentOrder: fragment.fragmentOrder,
            type: fragment.type,
            content: fragment.content,
            elapsedSecs: fragment.elapsedSecs,
            references: fragment.references,
            stageId: fragment.stageId,
          };
        });

        await tx
          .insert(messageFragmentsTable)
          .values(fragmentInserts)
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
    });
  }

  async createManyMessages(sessionId: string, messages: ChatMessageCreate[]): Promise<number> {
    if (messages.length === 0) return 0;

    const chatMessages = messages.map((msg) => new ChatMessage({ ...msg, sessionId }));

    const messageFiles = messages.flatMap((msg) => msg.files.map((file) => ({ ...file, sessionId, messageId: msg.message_id }) as MessageFileCreate));
    const fragments = messages.flatMap((msg) =>
      msg.fragments.map(
        (frag) =>
          new MessageFragment({
            ...frag,
            sessionId,
            messageId: msg.message_id,
            id: frag.id,
          }),
      ),
    );

    return await this.client.transaction(async (tx) => {
      // 2. Upsert сообщений
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

        await tx
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

      await this.createManyFiles(messageFiles, tx);

      // 4. Upsert фрагментов
      if (fragments.length > 0) {
        const fragmentValues = fragments.map((f) => ({
          sessionId: f.sessionId,
          messageId: f.messageId,
          fragmentOrder: f.fragmentOrder,
          type: f.type,
          content: f.content,
          elapsedSecs: f.elapsedSecs,
          references: f.references,
          stageId: f.stageId,
        }));

        await tx
          .insert(messageFragmentsTable)
          .values(fragmentValues)
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
      }

      return messages.length;
    });
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

  async createUser(data: UserCreate): Promise<User> {
    // Если id не передан, БД сгенерирует сама (defaultRandom)
    const user = new User(data);

    const [result] = await this.client
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
  }

  async createManyUsers(data: UserCreate[]): Promise<number> {
    if (data.length === 0) return 0;

    const users = data.map((d) => new User({ ...d, id: d.id ?? crypto.randomUUID() }));

    const result = await this.client
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
  }

  async deleteUser(id: string): Promise<boolean> {
    const [deleted] = await this.client.delete(userTable).where(eq(userTable.id, id)).returning({ id: userTable.id });
    return !!deleted;
  }

  async createMessagesBizData(user_id: string, data: MessagesBizData): Promise<void> {
    const { chat_session, chat_messages } = data;

    // Сохраняем сессию (полная версия)
    const sessionData: ChatSessionsCreate = { ...chat_session, user_id };
    await this.createSession(sessionData);

    // Сохраняем сообщения (sessionId передаётся отдельно)
    await this.createManyMessages(
      chat_session.id,
      chat_messages.map((m) => ({ ...m, sessionId: chat_session.id })),
    );
  }
}
