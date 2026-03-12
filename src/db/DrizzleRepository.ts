import { eq, and, sql } from "drizzle-orm";
import { db_drizzle } from "./drizzle/drizzle-db";
import { chatSessionsTable, chatMessagesTable, filesTable, messageFilesTable, messageFragmentsTable } from "./drizzle/drizzle-schema";
import { ChatSessions } from "./models/ChatSessions";
import { ChatSessionsCreate } from "./models/ChatSessionsCreate";
import { MessageFile } from "./models/MessageFile";
import { MessageFileCreate } from "./models/MessageFileCreate";
import { ChatMessage } from "./models/ChatMessage";
import { ChatMessageCreate } from "./models/ChatMessageCreate";
import { MessageFragmentCreate } from "./models/MessageFragmentCreate";
import { MessageFragment } from "./models/MessageFragment";
import { IRepository } from "./IRepository";
import { FragmentType, Role } from "./resp";

export class DrizzleRepository implements IRepository {
  constructor(private client: typeof db_drizzle) {}
  /**
   * Получить все файлы (без привязки к сообщениям)
   */
  async findAllFiles(): Promise<MessageFile[]> {
    const items = await this.client.select().from(filesTable);
    return items.map(
      (item) =>
        new MessageFile({
          messageId: null!,
          sessionId: null!,
          error_code: item.errorCode,
          file_name: item.fileName,
          file_size: item.fileSize,
          id: item.id,
          inserted_at: item.insertedAt?.getTime() ?? null,
          previewable: item.previewable,
          status: item.status,
          token_usage: item.tokenUsage,
          updated_at: item.updatedAt?.getTime() ?? null,
        }),
    );
  }

  // ========== Фрагменты (отдельно) ==========
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
  /**
   * Прикрепить файл к сообщению
   * @param sessionId - идентификатор сессии
   * @param messageId - идентификатор сообщения
   * @param fileId - идентификатор файла
   */
  async addFileToMessage(sessionId: string, messageId: number, fileId: string): Promise<void> {
    await this.client
      .insert(messageFilesTable)
      .values({
        sessionId,
        messageId,
        fileId,
      })
      .onConflictDoNothing(); // если уже существует, игнорируем
  }
  /**
   * Открепить файл от сообщения
   * @param sessionId - идентификатор сессии
   * @param messageId - идентификатор сообщения
   * @param fileId - идентификатор файла
   */
  async removeFileFromMessage(sessionId: string, messageId: number, fileId: string): Promise<void> {
    await this.client
      .delete(messageFilesTable)
      .where(and(eq(messageFilesTable.sessionId, sessionId), eq(messageFilesTable.messageId, messageId), eq(messageFilesTable.fileId, fileId)));
  }

  /**
   * Получить все файлы, прикреплённые к сообщению
   * @param sessionId - идентификатор сессии
   * @param messageId - идентификатор сообщения
   */
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
          messageId: messageId,
          sessionId: sessionId,
          error_code: file.errorCode,
          file_name: file.fileName,
          file_size: file.fileSize,
          id: file.id,
          inserted_at: file.insertedAt?.getTime() ?? null,
          previewable: file.previewable,
          status: file.status,
          token_usage: file.tokenUsage,
          updated_at: file.updatedAt?.getTime() ?? null,
        }),
    );
  }
  // ========== Сессии ==========
  async findAllSessions(): Promise<ChatSessions[]> {
    const items = await this.client.select().from(chatSessionsTable);
    return items.map(
      (item) =>
        new ChatSessions({
          agent: item.agent,
          current_message_id: item.current_message_id,
          id: item.id,
          inserted_at: item.inserted_at?.getTime() ?? null,
          pinned: item.pinned,
          seq_id: item.seq_id,
          title: item.title,
          title_type: item.title_type,
          updated_at: item.updated_at?.getTime() ?? null,
          version: item.version,
        }),
    );
  }

  async findSessionById(id: string): Promise<ChatSessions | null> {
    const [item] = await this.client.select().from(chatSessionsTable).where(eq(chatSessionsTable.id, id));
    return item
      ? new ChatSessions({
          agent: item.agent,
          current_message_id: item.current_message_id,
          id: item.id,
          inserted_at: item.inserted_at?.getTime() ?? null,
          pinned: item.pinned,
          seq_id: item.seq_id,
          title: item.title,
          title_type: item.title_type,
          updated_at: item.updated_at?.getTime() ?? null,
          version: item.version,
        })
      : null;
  }

  async createSession(data: ChatSessionsCreate): Promise<ChatSessions> {
    const values = new ChatSessions(data);
    const [result] = await this.client
      .insert(chatSessionsTable)
      .values(values)
      .onConflictDoUpdate({
        target: chatSessionsTable.id,
        set: {
          title: sql`excluded.title`,
          title_type: sql`excluded.title_type`,
          pinned: sql`excluded.pinned`,
          updated_at: sql`excluded.updated_at`,
          // дополнительные поля для полной версии (опциональны)          
          seq_id: sql`excluded.seq_id`,          
          agent: sql`excluded.agent`,
          version: sql`excluded.version`,
          current_message_id: sql`excluded.current_message_id`,
          inserted_at: sql`excluded.inserted_at`,
        },
      })
      .returning();
    return new ChatSessions({
      id: result.id,
      title: result.title,
      agent: result.agent,
      current_message_id: result.current_message_id,
      inserted_at: result.inserted_at?.getTime() ?? null,
      pinned: result.pinned,
      seq_id: result.seq_id,
      title_type: result.title_type,
      updated_at: result.updated_at?.getTime() ?? null,
      version: result.version,
    });
  }

  async createManySessions(data: ChatSessionsCreate[]): Promise<number> {
    if (data.length === 0) return 0;
    const values = data.map((ch) => new ChatSessions(ch));
    const result = await this.client
      .insert(chatSessionsTable)
      .values(values)
      .onConflictDoUpdate({
        target: chatSessionsTable.id,
        set: {
          title: sql`excluded.title`,
          title_type: sql`excluded.title_type`,
          pinned: sql`excluded.pinned`,
          updated_at: sql`excluded.updated_at`,
          // дополнительные поля для полной версии (опциональны)          
          seq_id: sql`excluded.inserted_at`,          
          agent: sql`excluded.agent`,
          version: sql`excluded.version`,
          current_message_id: sql`excluded.current_message_id`,
          inserted_at: sql`excluded.inserted_at`,
        },
      });
    return result.rowCount ?? 0;
  }

  // ========== Файлы ==========
  async findFileById(id: string): Promise<MessageFile | null> {
    const [item] = await this.client.select().from(filesTable).where(eq(filesTable.id, id));
    return item
      ? new MessageFile({
          messageId: 0,
          sessionId: null!,
          error_code: item.errorCode,
          file_name: item.fileName,
          file_size: item.fileSize,
          id: item.id,
          inserted_at: item.insertedAt?.getTime() ?? null,
          previewable: item.previewable,
          status: item.status,
          token_usage: item.tokenUsage,
          updated_at: item.updatedAt?.getTime() ?? null,
        })
      : null;
  }

  async createFile(data: MessageFileCreate): Promise<MessageFile> {
    const values = new MessageFile(data);
    const [result] = await this.client
      .insert(filesTable)
      .values(values)
      .onConflictDoUpdate({
        target: filesTable.id,
        set: {
          status: sql`excluded.status`,
          fileName: sql`excluded.file_name`, // было file_name
          previewable: sql`excluded.previewable`,
          fileSize: sql`excluded.file_size`, // было file_size
          tokenUsage: sql`excluded.token_usage`, // было token_usage
          errorCode: sql`excluded.error_code`, // было error_code
          insertedAt: sql`excluded.inserted_at`, // было inserted_at
          updatedAt: sql`excluded.updated_at`, // было updated_at
        },
      })
      .returning();
    return new MessageFile({
      messageId: data.messageId,
      sessionId: data.sessionId,
      error_code: result.errorCode,
      file_name: result.fileName,
      file_size: result.fileSize,
      id: result.id,
      inserted_at: result.insertedAt?.getTime() ?? null,
      previewable: result.previewable,
      status: result.status,
      token_usage: result.tokenUsage,
      updated_at: result.updatedAt?.getTime() ?? null,
    });
  }

  async createManyFiles(data: MessageFileCreate[]): Promise<number> {
    if (data.length === 0) return 0;
    const values = data.map((f) => new MessageFile(f));
    const result = await this.client
      .insert(filesTable)
      .values(values)
      .onConflictDoUpdate({
        target: filesTable.id,
        set: {
          status: sql`excluded.status`,
          fileName: sql`excluded.file_name`, // было file_name
          previewable: sql`excluded.previewable`,
          fileSize: sql`excluded.file_size`, // было file_size
          tokenUsage: sql`excluded.token_usage`, // было token_usage
          errorCode: sql`excluded.error_code`, // было error_code
          insertedAt: sql`excluded.inserted_at`, // было inserted_at
          updatedAt: sql`excluded.updated_at`, // было updated_at
        },
      });
    return result.rowCount ?? 0;
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
          files: [],
          fragments: [],
          has_pending_fragment: item.hasPendingFragment,
          inserted_at: item.insertedAt?.getTime() ?? null,
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
          inserted_at: item.insertedAt?.getTime() ?? null,
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
      // 1. Сообщение
      const message = new ChatMessage({ ...data, sessionId });
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

      // 2. Файлы (создаём при необходимости и связываем)
      for (const fileData of files) {
        let file = await tx
          .select()
          .from(filesTable)
          .where(eq(filesTable.id, fileData.id))
          .limit(1)
          .then((rows) => rows[0]);

        if (!file) {
          const newFile = new MessageFile({ ...fileData, sessionId: sessionId, messageId: message.messageId });
          [file] = await tx.insert(filesTable).values(newFile).returning();
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
        const fragmentInserts = fragments.map((frag, index) => {
          const fragCreate: MessageFragmentCreate = {
            ...frag,
            sessionId: message.sessionId,
            messageId: message.messageId,
            id: index,
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
        inserted_at: insertedMessage.insertedAt?.getTime() ?? null,
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

  /**
   * Массовое сохранение сообщений одной сессии.
   * @param sessionId - идентификатор сессии
   * @param messages - массив данных сообщений (без sessionId)
   */
  async createManyMessages(sessionId: string, messages: ChatMessageCreate[]): Promise<number> {
    if (messages.length === 0) return 0;

    // Вспомогательная функция для сбора уникальных файлов
    const collectUniqueFiles = (msgs: ChatMessageCreate[]): Map<string, MessageFileCreate> => {
      const filesMap = new Map<string, MessageFileCreate>();
      for (const msg of msgs) {
        if (msg.files) {
          for (const file of msg.files) {
            filesMap.set(file.id, file as MessageFileCreate);
          }
        }
      }
      return filesMap;
    };

    // Собираем уникальные файлы
    const filesMap = collectUniqueFiles(messages);
    const filesList = Array.from(filesMap.values());

    // Создаём объекты ChatMessage с добавленным sessionId
    const chatMessages = messages.map((msg) => new ChatMessage({ ...msg, sessionId }));

    // Собираем связи message-files
    const messageFiles = messages
      .map((msg) =>
        msg.files.map(
          (file) =>
            new MessageFile({
              ...file,
              sessionId,
              messageId: msg.message_id,
            }),
        ),
      )
      .flatMap((a) => a);

    // Собираем фрагменты
    const fragments = messages
      .map((msg) =>
        msg.fragments.map(
          (frag) =>
            new MessageFragment({
              ...frag,
              sessionId,
              messageId: msg.message_id,
              id: frag.id,
            }),
        ),
      )
      .flatMap((a) => a);

    // Выполняем всё в одной транзакции
    return await this.client.transaction(async (tx) => {
      // 1. Upsert файлов
      if (filesList.length > 0) {
        const fileValues = filesList.map((f) => new MessageFile(f));
        await tx
          .insert(filesTable)
          .values(fileValues)
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

      const messageFileValues = messageFiles.map((f) => ({
        sessionId: f.sessionId,
        messageId: f.messageId,
        fileId: f.id,
      }));

      // 3. Upsert связей message-files
      if (messageFiles.length > 0) {
        await tx
          .insert(messageFilesTable)
          .values(messageFileValues)
          .onConflictDoNothing({
            target: [messageFilesTable.sessionId, messageFilesTable.messageId, messageFilesTable.fileId],
          });
      }

      // 4. Upsert фрагментов
      if (fragments.length > 0) {
        await tx
          .insert(messageFragmentsTable)
          .values(fragments)
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
}
