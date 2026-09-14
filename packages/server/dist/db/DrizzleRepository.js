"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrizzleRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const drizzle_schema_1 = require("./drizzle/drizzle-schema");
const pg_core_1 = require("drizzle-orm/pg-core");
const models_1 = require("./models");
const logger_1 = require("../shared/utils/logger");
require("../shared/utils/array-extensions");
class DrizzleRepository {
    constructor(client) {
        this.client = client;
    }
    async findAllFiles() {
        const items = await this.client.select().from(drizzle_schema_1.filesTable).orderBy(drizzle_schema_1.messageFilesTable.messageId);
        return items.map((file) => new models_1.MessageFile({
            ...file,
            sessionId: null,
            messageId: null,
        }));
    }
    async findAllFilesByMessage(sessionId, messageId) {
        return this.getFilesForMessage(sessionId, messageId);
    }
    async findAllFragments(sessionId, messageId) {
        let s = (0, drizzle_orm_1.eq)(drizzle_schema_1.messageFragmentsTable.sessionId, sessionId);
        if (messageId != null) {
            s = (0, drizzle_orm_1.and)(s, (0, drizzle_orm_1.eq)(drizzle_schema_1.messageFragmentsTable.messageId, messageId));
        }
        const items = await this.client.select().from(drizzle_schema_1.messageFragmentsTable).where(s).orderBy(drizzle_schema_1.messageFragmentsTable.fragmentOrder);
        return items.map((item) => new models_1.MessageFragment({
            ...item,
            type: item.type,
            id: item.fragmentOrder,
        }));
    }
    async findAllFragmentsShrort(sessionId, messageId) {
        const items = await this.client
            .select({
            sessionId: drizzle_schema_1.messageFragmentsTable.sessionId,
            messageId: drizzle_schema_1.messageFragmentsTable.messageId,
            fragmentOrder: drizzle_schema_1.messageFragmentsTable.fragmentOrder,
            type: drizzle_schema_1.messageFragmentsTable.type,
            size: drizzle_schema_1.messageFragmentsTable.size,
        })
            .from(drizzle_schema_1.messageFragmentsTable)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(drizzle_schema_1.messageFragmentsTable.sessionId, sessionId), (0, drizzle_orm_1.eq)(drizzle_schema_1.messageFragmentsTable.messageId, messageId)))
            .orderBy(drizzle_schema_1.messageFragmentsTable.fragmentOrder);
        return items.map((item) => new models_1.MessageFragment({
            ...item,
            content: "",
            type: item.type,
            id: item.fragmentOrder,
        }));
    }
    async findFragmentById(sessionId, messageId, fragmentOrder) {
        const [item] = await this.client
            .select()
            .from(drizzle_schema_1.messageFragmentsTable)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(drizzle_schema_1.messageFragmentsTable.sessionId, sessionId), (0, drizzle_orm_1.eq)(drizzle_schema_1.messageFragmentsTable.messageId, messageId), (0, drizzle_orm_1.eq)(drizzle_schema_1.messageFragmentsTable.fragmentOrder, fragmentOrder)));
        return item
            ? new models_1.MessageFragment({
                ...item,
                type: item.type,
                id: item.fragmentOrder,
            })
            : null;
    }
    async createManyFragments(data, tx) {
        if (data.length === 0)
            return 0;
        const fragments = data.map((d) => new models_1.MessageFragment(d));
        const execute = async (db) => {
            const result = await db
                .insert(drizzle_schema_1.messageFragmentsTable)
                .values(fragments)
                .onConflictDoUpdate({
                target: [drizzle_schema_1.messageFragmentsTable.sessionId, drizzle_schema_1.messageFragmentsTable.messageId, drizzle_schema_1.messageFragmentsTable.fragmentOrder],
                set: {
                    type: (0, drizzle_orm_1.sql) `excluded.type`,
                    content: (0, drizzle_orm_1.sql) `excluded.content`,
                    elapsed_secs: (0, drizzle_orm_1.sql) `excluded.elapsed_secs`,
                    references: (0, drizzle_orm_1.sql) `excluded.references`,
                    stage_id: (0, drizzle_orm_1.sql) `excluded.stage_id`,
                    size: (0, drizzle_orm_1.sql) `excluded.size`,
                },
            });
            return result.rowCount ?? 0;
        };
        if (tx) {
            return await execute(tx);
        }
        else {
            return await this.client.transaction(async (newTx) => execute(newTx));
        }
    }
    async createFragment(data, tx) {
        const execute = async (db) => {
            const fragment = new models_1.MessageFragment(data);
            const [result] = await db
                .insert(drizzle_schema_1.messageFragmentsTable)
                .values(fragment)
                .onConflictDoUpdate({
                target: [drizzle_schema_1.messageFragmentsTable.sessionId, drizzle_schema_1.messageFragmentsTable.messageId, drizzle_schema_1.messageFragmentsTable.fragmentOrder],
                set: {
                    type: (0, drizzle_orm_1.sql) `excluded.type`,
                    content: (0, drizzle_orm_1.sql) `excluded.content`,
                    elapsed_secs: (0, drizzle_orm_1.sql) `excluded.elapsed_secs`,
                    references: (0, drizzle_orm_1.sql) `excluded.references`,
                    stage_id: (0, drizzle_orm_1.sql) `excluded.stage_id`,
                    size: (0, drizzle_orm_1.sql) `excluded.size`,
                },
            })
                .returning();
            return new models_1.MessageFragment({
                ...result,
                id: result.fragmentOrder,
                type: result.type,
            });
        };
        if (tx) {
            return await execute(tx);
        }
        else {
            return await this.client.transaction(async (newTx) => execute(newTx));
        }
    }
    async addFileToMessage(sessionId, messageId, fileId) {
        await this.client.insert(drizzle_schema_1.messageFilesTable).values({ sessionId, messageId, fileId }).onConflictDoNothing();
    }
    async removeFileFromMessage(sessionId, messageId, fileId) {
        await this.client
            .delete(drizzle_schema_1.messageFilesTable)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(drizzle_schema_1.messageFilesTable.sessionId, sessionId), (0, drizzle_orm_1.eq)(drizzle_schema_1.messageFilesTable.messageId, messageId), (0, drizzle_orm_1.eq)(drizzle_schema_1.messageFilesTable.fileId, fileId)));
    }
    async getFilesForMessage(sessionId, messageId) {
        const items = await this.client
            .select({ file: drizzle_schema_1.filesTable })
            .from(drizzle_schema_1.messageFilesTable)
            .innerJoin(drizzle_schema_1.filesTable, (0, drizzle_orm_1.eq)(drizzle_schema_1.messageFilesTable.fileId, drizzle_schema_1.filesTable.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(drizzle_schema_1.messageFilesTable.sessionId, sessionId), (0, drizzle_orm_1.eq)(drizzle_schema_1.messageFilesTable.messageId, messageId)))
            .orderBy(drizzle_schema_1.messageFilesTable.messageId);
        return items.map(({ file }) => new models_1.MessageFile({
            ...file,
            sessionId,
            messageId,
        }));
    }
    async findAllFilesNullContent(sessionId) {
        const items = await this.client
            .select({ file: drizzle_schema_1.filesTable, mf: drizzle_schema_1.messageFilesTable })
            .from(drizzle_schema_1.messageFilesTable)
            .innerJoin(drizzle_schema_1.filesTable, (0, drizzle_orm_1.eq)(drizzle_schema_1.messageFilesTable.fileId, drizzle_schema_1.filesTable.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(drizzle_schema_1.messageFilesTable.sessionId, sessionId), (0, drizzle_orm_1.isNull)(drizzle_schema_1.filesTable.content)))
            .orderBy(drizzle_schema_1.messageFilesTable.messageId);
        return items.map(({ file, mf }) => new models_1.MessageFile({
            ...file,
            sessionId: mf.sessionId,
            messageId: mf.messageId,
        }));
    }
    async findAllSessions(userId) {
        const items = await this.client.select().from(drizzle_schema_1.chatSessionsTable).where((0, drizzle_orm_1.eq)(drizzle_schema_1.chatSessionsTable.user_id, userId));
        return items.map((item) => new models_1.ChatSessions({ ...item }));
    }
    async findSessionById(id) {
        const [item] = await this.client.select().from(drizzle_schema_1.chatSessionsTable).where((0, drizzle_orm_1.eq)(drizzle_schema_1.chatSessionsTable.id, id));
        return item ? new models_1.ChatSessions({ ...item }) : null;
    }
    async createManySessions(data, tx) {
        if (data.length === 0)
            return 0;
        const sessions = data.map((ch) => new models_1.ChatSessions(ch));
        const execute = async (db) => {
            const result = await db
                .insert(drizzle_schema_1.chatSessionsTable)
                .values(sessions)
                .onConflictDoUpdate({
                target: drizzle_schema_1.chatSessionsTable.id,
                set: {
                    title: (0, drizzle_orm_1.sql) `excluded.title`,
                    title_type: (0, drizzle_orm_1.sql) `excluded.title_type`,
                    pinned: (0, drizzle_orm_1.sql) `excluded.pinned`,
                    updated_at: (0, drizzle_orm_1.sql) `excluded.updated_at`,
                    seq_id: (0, drizzle_orm_1.sql) `excluded.seq_id`,
                    agent: (0, drizzle_orm_1.sql) `excluded.agent`,
                    version: (0, drizzle_orm_1.sql) `excluded.version`,
                    current_message_id: (0, drizzle_orm_1.sql) `excluded.current_message_id`,
                    inserted_at: (0, drizzle_orm_1.sql) `excluded.inserted_at`,
                    user_id: (0, drizzle_orm_1.sql) `excluded.user_id`,
                },
            });
            return result.rowCount ?? 0;
        };
        if (tx) {
            return await execute(tx);
        }
        else {
            return await this.client.transaction(async (newTx) => execute(newTx));
        }
    }
    async createSession(data, tx) {
        const execute = async (db) => {
            const session = new models_1.ChatSessions(data);
            const [result] = await db
                .insert(drizzle_schema_1.chatSessionsTable)
                .values({ ...session })
                .onConflictDoUpdate({
                target: drizzle_schema_1.chatSessionsTable.id,
                set: {
                    title: (0, drizzle_orm_1.sql) `excluded.title`,
                    title_type: (0, drizzle_orm_1.sql) `excluded.title_type`,
                    pinned: (0, drizzle_orm_1.sql) `excluded.pinned`,
                    updated_at: (0, drizzle_orm_1.sql) `excluded.updated_at`,
                    seq_id: (0, drizzle_orm_1.sql) `excluded.seq_id`,
                    agent: (0, drizzle_orm_1.sql) `excluded.agent`,
                    version: (0, drizzle_orm_1.sql) `excluded.version`,
                    current_message_id: (0, drizzle_orm_1.sql) `excluded.current_message_id`,
                    inserted_at: (0, drizzle_orm_1.sql) `excluded.inserted_at`,
                    user_id: (0, drizzle_orm_1.sql) `excluded.user_id`,
                },
            })
                .returning();
            return new models_1.ChatSessions({ ...result });
        };
        if (tx) {
            return await execute(tx);
        }
        else {
            return await this.client.transaction(async (newTx) => execute(newTx));
        }
    }
    async findFileById(id) {
        const result = await this.client
            .select({
            file: drizzle_schema_1.filesTable,
            link: drizzle_schema_1.messageFilesTable,
        })
            .from(drizzle_schema_1.filesTable)
            .innerJoin(drizzle_schema_1.messageFilesTable, (0, drizzle_orm_1.eq)(drizzle_schema_1.filesTable.id, drizzle_schema_1.messageFilesTable.fileId))
            .where((0, drizzle_orm_1.eq)(drizzle_schema_1.filesTable.id, id))
            .limit(1);
        if (result.length === 0)
            return null;
        const { file, link } = result[0];
        return new models_1.MessageFile({
            ...link,
            ...file,
        });
    }
    async createManyFiles(data, tx) {
        if (data.length === 0)
            return 0;
        const messageFiles = data.map((d) => new models_1.MessageFile(d));
        const fileDbValues = messageFiles.uniqueBy((u) => u.id);
        const linkValues = messageFiles
            .filter((mf) => mf.sessionId && mf.messageId)
            .map((mf) => ({
            sessionId: mf.sessionId,
            messageId: mf.messageId,
            fileId: mf.id,
        }))
            .uniqueBy((a) => `${a.sessionId}=${a.messageId}=${a.fileId}`);
        const execute = async (db) => {
            if (fileDbValues.length > 0) {
                await db
                    .insert(drizzle_schema_1.filesTable)
                    .values(fileDbValues)
                    .onConflictDoUpdate({
                    target: drizzle_schema_1.filesTable.id,
                    set: {
                        status: (0, drizzle_orm_1.sql) `excluded.status`,
                        file_name: (0, drizzle_orm_1.sql) `excluded.file_name`,
                        previewable: (0, drizzle_orm_1.sql) `excluded.previewable`,
                        file_size: (0, drizzle_orm_1.sql) `excluded.file_size`,
                        token_usage: (0, drizzle_orm_1.sql) `excluded.token_usage`,
                        error_code: (0, drizzle_orm_1.sql) `excluded.error_code`,
                        inserted_at: (0, drizzle_orm_1.sql) `excluded.inserted_at`,
                        updated_at: (0, drizzle_orm_1.sql) `excluded.updated_at`,
                        content: (0, drizzle_orm_1.sql) `excluded.content`,
                    },
                });
            }
            if (linkValues.length > 0) {
                await db
                    .insert(drizzle_schema_1.messageFilesTable)
                    .values(linkValues)
                    .onConflictDoNothing({
                    target: [drizzle_schema_1.messageFilesTable.sessionId, drizzle_schema_1.messageFilesTable.messageId, drizzle_schema_1.messageFilesTable.fileId],
                });
            }
        };
        if (tx) {
            await execute(tx);
            return data.length;
        }
        else {
            return await this.client.transaction(async (newTx) => {
                await execute(newTx);
                return data.length;
            });
        }
    }
    async createFile(data, tx) {
        const execute = async (db) => {
            const messageFile = new models_1.MessageFile(data);
            const [result] = await db
                .insert(drizzle_schema_1.filesTable)
                .values({ ...messageFile })
                .onConflictDoUpdate({
                target: drizzle_schema_1.filesTable.id,
                set: {
                    status: (0, drizzle_orm_1.sql) `excluded.status`,
                    file_name: (0, drizzle_orm_1.sql) `excluded.file_name`,
                    previewable: (0, drizzle_orm_1.sql) `excluded.previewable`,
                    file_size: (0, drizzle_orm_1.sql) `excluded.file_size`,
                    token_usage: (0, drizzle_orm_1.sql) `excluded.token_usage`,
                    error_code: (0, drizzle_orm_1.sql) `excluded.error_code`,
                    inserted_at: (0, drizzle_orm_1.sql) `excluded.inserted_at`,
                    updated_at: (0, drizzle_orm_1.sql) `excluded.updated_at`,
                    content: (0, drizzle_orm_1.sql) `excluded.content`,
                },
            })
                .returning();
            if (messageFile.sessionId && messageFile.messageId) {
                await db
                    .insert(drizzle_schema_1.messageFilesTable)
                    .values({
                    sessionId: messageFile.sessionId,
                    messageId: messageFile.messageId,
                    fileId: messageFile.id,
                })
                    .onConflictDoNothing();
            }
            return new models_1.MessageFile({
                ...data,
                ...result,
            });
        };
        if (tx) {
            return await execute(tx);
        }
        else {
            return await this.client.transaction(async (newTx) => execute(newTx));
        }
    }
    async findAllMessages(sessionId) {
        const items = await this.client.select().from(drizzle_schema_1.chatMessagesTable).where((0, drizzle_orm_1.eq)(drizzle_schema_1.chatMessagesTable.sessionId, sessionId));
        return items.map((item) => new models_1.ChatMessage({
            ...item,
            accumulated_token_usage: item.accumulatedTokenUsage,
            auto_continue: item.autoContinue,
            ban_edit: item.banEdit,
            ban_regenerate: item.banRegenerate,
            files: [],
            fragments: [],
            has_pending_fragment: item.hasPendingFragment,
            inserted_at: item.insertedAt,
            message_id: item.messageId,
            model: item.model,
            parent_id: item.parentMessageId,
            role: item.role,
            search_enabled: item.searchEnabled,
            thinking_enabled: item.thinkingEnabled,
        }));
    }
    async findMessageById(sessionId, messageId) {
        const [item] = await this.client
            .select()
            .from(drizzle_schema_1.chatMessagesTable)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(drizzle_schema_1.chatMessagesTable.sessionId, sessionId), (0, drizzle_orm_1.eq)(drizzle_schema_1.chatMessagesTable.messageId, messageId)));
        return item
            ? new models_1.ChatMessage({
                ...item,
                accumulated_token_usage: item.accumulatedTokenUsage,
                auto_continue: item.autoContinue,
                ban_edit: item.banEdit,
                ban_regenerate: item.banRegenerate,
                files: [],
                fragments: [],
                has_pending_fragment: item.hasPendingFragment,
                inserted_at: item.insertedAt,
                message_id: item.messageId,
                model: item.model,
                parent_id: item.parentMessageId,
                role: item.role,
                search_enabled: item.searchEnabled,
                thinking_enabled: item.thinkingEnabled,
            })
            : null;
    }
    async createManyMessages(sessionId, messages, tx) {
        if (messages.length === 0)
            return 0;
        const chatMessages = messages.map((msg) => new models_1.ChatMessage({ ...msg, sessionId }));
        const messageFiles = messages.flatMap((msg) => (msg.files ?? []).map((file) => ({ ...file, sessionId, messageId: msg.message_id })));
        const fragments = messages.flatMap((msg) => msg.fragments.map((frag) => ({
            ...frag,
            sessionId,
            messageId: msg.message_id,
        })));
        const execute = async (db) => {
            if (chatMessages.length > 0) {
                await db
                    .insert(drizzle_schema_1.chatMessagesTable)
                    .values(chatMessages)
                    .onConflictDoUpdate({
                    target: [drizzle_schema_1.chatMessagesTable.sessionId, drizzle_schema_1.chatMessagesTable.messageId],
                    set: {
                        parentMessageId: (0, drizzle_orm_1.sql) `excluded.parent_message_id`,
                        model: (0, drizzle_orm_1.sql) `excluded.model`,
                        role: (0, drizzle_orm_1.sql) `excluded.role`,
                        thinkingEnabled: (0, drizzle_orm_1.sql) `excluded.thinking_enabled`,
                        banEdit: (0, drizzle_orm_1.sql) `excluded.ban_edit`,
                        banRegenerate: (0, drizzle_orm_1.sql) `excluded.ban_regenerate`,
                        status: (0, drizzle_orm_1.sql) `excluded.status`,
                        accumulatedTokenUsage: (0, drizzle_orm_1.sql) `excluded.accumulated_token_usage`,
                        feedback: (0, drizzle_orm_1.sql) `excluded.feedback`,
                        insertedAt: (0, drizzle_orm_1.sql) `excluded.inserted_at`,
                        searchEnabled: (0, drizzle_orm_1.sql) `excluded.search_enabled`,
                        hasPendingFragment: (0, drizzle_orm_1.sql) `excluded.has_pending_fragment`,
                        autoContinue: (0, drizzle_orm_1.sql) `excluded.auto_continue`,
                    },
                });
            }
            await this.createManyFiles(messageFiles, db);
            await this.createManyFragments(fragments, db);
        };
        if (tx) {
            await execute(tx);
            return messages.length;
        }
        else {
            return await this.client.transaction(async (newTx) => {
                await execute(newTx);
                return messages.length;
            });
        }
    }
    async createMessage(data, tx) {
        const { sessionId, files = [], fragments = [] } = data;
        const execute = async (db) => {
            const message = new models_1.ChatMessage({ ...data, sessionId });
            const [insertedMessage] = await db
                .insert(drizzle_schema_1.chatMessagesTable)
                .values(message)
                .onConflictDoUpdate({
                target: [drizzle_schema_1.chatMessagesTable.sessionId, drizzle_schema_1.chatMessagesTable.messageId],
                set: {
                    parentMessageId: (0, drizzle_orm_1.sql) `excluded.parent_message_id`,
                    model: (0, drizzle_orm_1.sql) `excluded.model`,
                    role: (0, drizzle_orm_1.sql) `excluded.role`,
                    thinkingEnabled: (0, drizzle_orm_1.sql) `excluded.thinking_enabled`,
                    banEdit: (0, drizzle_orm_1.sql) `excluded.ban_edit`,
                    banRegenerate: (0, drizzle_orm_1.sql) `excluded.ban_regenerate`,
                    status: (0, drizzle_orm_1.sql) `excluded.status`,
                    accumulatedTokenUsage: (0, drizzle_orm_1.sql) `excluded.accumulated_token_usage`,
                    feedback: (0, drizzle_orm_1.sql) `excluded.feedback`,
                    insertedAt: (0, drizzle_orm_1.sql) `excluded.inserted_at`,
                    searchEnabled: (0, drizzle_orm_1.sql) `excluded.search_enabled`,
                    hasPendingFragment: (0, drizzle_orm_1.sql) `excluded.has_pending_fragment`,
                    autoContinue: (0, drizzle_orm_1.sql) `excluded.auto_continue`,
                },
            })
                .returning();
            if (files.length > 0) {
                const fileCreates = files.map((file) => ({ ...file, sessionId, messageId: message.messageId }));
                await this.createManyFiles(fileCreates, db);
            }
            if (fragments.length > 0) {
                const fragmentCreates = fragments.map((frag) => ({
                    ...frag,
                    sessionId,
                    messageId: message.messageId,
                    id: frag.id,
                }));
                await this.createManyFragments(fragmentCreates, db);
            }
            return new models_1.ChatMessage({
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
                model: insertedMessage.model,
                parent_id: insertedMessage.parentMessageId,
                role: insertedMessage.role,
                search_enabled: insertedMessage.searchEnabled,
                thinking_enabled: insertedMessage.thinkingEnabled,
            });
        };
        if (tx) {
            return await execute(tx);
        }
        else {
            return await this.client.transaction(async (newTx) => execute(newTx));
        }
    }
    async findAllUsers() {
        const items = await this.client.select().from(drizzle_schema_1.userTable);
        return items.map((item) => new models_1.User({ ...item }));
    }
    async findUserById(id) {
        const [item] = await this.client.select().from(drizzle_schema_1.userTable).where((0, drizzle_orm_1.eq)(drizzle_schema_1.userTable.id, id));
        return item ? new models_1.User({ ...item }) : null;
    }
    async createManyUsers(data, tx) {
        if (data.length === 0)
            return 0;
        const users = data.map((d) => new models_1.User({ ...d, id: d.id ?? crypto.randomUUID() }));
        const execute = async (db) => {
            const result = await db
                .insert(drizzle_schema_1.userTable)
                .values(users.map((u) => ({ ...u })))
                .onConflictDoUpdate({
                target: drizzle_schema_1.userTable.id,
                set: {
                    name: (0, drizzle_orm_1.sql) `excluded.name`,
                    credentials: (0, drizzle_orm_1.sql) `excluded.credentials`,
                },
            });
            return result.rowCount ?? 0;
        };
        if (tx) {
            return await execute(tx);
        }
        else {
            return await this.client.transaction(async (newTx) => execute(newTx));
        }
    }
    async createUser(data, tx) {
        const execute = async (db) => {
            const user = new models_1.User(data);
            const [result] = await db
                .insert(drizzle_schema_1.userTable)
                .values({ ...user })
                .onConflictDoUpdate({
                target: drizzle_schema_1.userTable.id,
                set: {
                    name: (0, drizzle_orm_1.sql) `excluded.name`,
                    credentials: (0, drizzle_orm_1.sql) `excluded.credentials`,
                },
            })
                .returning();
            return new models_1.User({ ...result });
        };
        if (tx) {
            return await execute(tx);
        }
        else {
            return await this.client.transaction(async (newTx) => execute(newTx));
        }
    }
    async deleteUser(id) {
        const [deleted] = await this.client.delete(drizzle_schema_1.userTable).where((0, drizzle_orm_1.eq)(drizzle_schema_1.userTable.id, id)).returning({ id: drizzle_schema_1.userTable.id });
        return !!deleted;
    }
    async createMessagesBizData(user_id, data, tx) {
        const { chat_session, chat_messages } = data;
        const sessionData = {
            ...chat_session,
            user_id,
        };
        const execute = async (db) => {
            await this.createSession(sessionData, db);
            await this.createManyMessages(chat_session.id, chat_messages.map((m) => ({ ...m, sessionId: chat_session.id })), db);
        };
        if (tx) {
            await execute(tx);
        }
        else {
            await this.client.transaction(async (newTx) => {
                await execute(newTx);
            });
        }
    }
    async findEmbeddingsBySession(sessionId, tx) {
        const db = tx || this.client;
        const items = await db.select().from(drizzle_schema_1.embeddingsTable).where((0, drizzle_orm_1.eq)(drizzle_schema_1.embeddingsTable.sessionId, sessionId)).orderBy((0, drizzle_orm_1.desc)(drizzle_schema_1.embeddingsTable.createdAt));
        return items.map((item) => new models_1.Embedding({ ...item }));
    }
    async findEmbeddingsByDate(createdAt, modelname, tx) {
        const db = tx || this.client;
        const items = await db
            .select({
            sessionId: drizzle_schema_1.embeddingsTable.sessionId,
            model_name: drizzle_schema_1.embeddingsTable.model_name,
            createdAt: drizzle_schema_1.embeddingsTable.createdAt,
            processing_time_ms: drizzle_schema_1.embeddingsTable.processing_time_ms,
        })
            .from(drizzle_schema_1.embeddingsTable)
            .where((0, drizzle_orm_1.gt)(drizzle_schema_1.embeddingsTable.createdAt, createdAt))
            .orderBy((0, drizzle_orm_1.desc)(drizzle_schema_1.embeddingsTable.createdAt));
        return items.map((item) => new models_1.Embedding({ ...item }));
    }
    async findEmbeddingBySessionAndModel(sessionId, modelName, tx) {
        const db = tx || this.client;
        const [item] = await db
            .select()
            .from(drizzle_schema_1.embeddingsTable)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(drizzle_schema_1.embeddingsTable.sessionId, sessionId), (0, drizzle_orm_1.eq)(drizzle_schema_1.embeddingsTable.model_name, modelName)))
            .orderBy((0, drizzle_orm_1.desc)(drizzle_schema_1.embeddingsTable.createdAt))
            .limit(1);
        if (!item)
            return null;
        return new models_1.Embedding({ ...item });
    }
    async createManyEmbeddings(sessionId, data, tx) {
        if (data.length === 0)
            return 0;
        const embeddings = data.map((d) => new models_1.Embedding({ ...d, sessionId }));
        const execute = async (db) => {
            const result = await db
                .insert(drizzle_schema_1.embeddingsTable)
                .values(embeddings)
                .onConflictDoUpdate({
                target: [drizzle_schema_1.embeddingsTable.sessionId, drizzle_schema_1.embeddingsTable.model_name, drizzle_schema_1.embeddingsTable.createdAt],
                set: {
                    dimension: (0, drizzle_orm_1.sql) `excluded.dimension`,
                    processing_time_ms: (0, drizzle_orm_1.sql) `excluded.processing_time_ms`,
                    embedding: (0, drizzle_orm_1.sql) `excluded.embedding_vector`,
                },
            });
            return result.rowCount ?? 0;
        };
        if (tx) {
            return await execute(tx);
        }
        else {
            return await this.client.transaction(async (newTx) => execute(newTx));
        }
    }
    async createEmbedding(sessionId, data, tx) {
        const execute = async (db) => {
            const embedding = new models_1.Embedding({
                ...data,
                sessionId,
            });
            const [result] = await db
                .insert(drizzle_schema_1.embeddingsTable)
                .values(embedding)
                .onConflictDoUpdate({
                target: [drizzle_schema_1.embeddingsTable.sessionId, drizzle_schema_1.embeddingsTable.model_name, drizzle_schema_1.embeddingsTable.createdAt],
                set: {
                    dimension: (0, drizzle_orm_1.sql) `excluded.dimension`,
                    processing_time_ms: (0, drizzle_orm_1.sql) `excluded.processing_time_ms`,
                    embedding: (0, drizzle_orm_1.sql) `excluded.embedding_vector`,
                },
            })
                .returning();
            return new models_1.Embedding(result);
        };
        if (tx) {
            return await execute(tx);
        }
        else {
            return await this.client.transaction(async (newTx) => execute(newTx));
        }
    }
    async findAllSessionsAll() {
        const items = await this.client.select().from(drizzle_schema_1.chatSessionsTable);
        return items.map((item) => new models_1.ChatSessions({ ...item }));
    }
}
exports.DrizzleRepository = DrizzleRepository;
__decorate([
    logger_1.Log,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, pg_core_1.PgTransaction]),
    __metadata("design:returntype", Promise)
], DrizzleRepository.prototype, "createEmbedding", null);
