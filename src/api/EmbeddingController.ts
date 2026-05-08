import { Router, Request, Response } from "express";
import { IRepository } from "../db/IRepository";
import { EmbeddingCreate } from "../db/models/EmbeddingCreate";
import { Program } from "../program";
import { HeadingCodeParser } from "mdforge";
import { safe } from "../utils/data-utils";
export class EmbeddingController {
  private router: Router;
  headingCodeParser: HeadingCodeParser;

  constructor(private program: Program) {
    //this.repo = program.repository!;
    this.router = Router();
    this.headingCodeParser = new HeadingCodeParser();
    this.setupRoutes();
  }

  get repo(): IRepository {
    return this.program.repository;
  }

  private setupRoutes() {
    // GET /documents
    this.router.get("/documents", this.getAllDocuments.bind(this));
    // GET /documents/:id
    this.router.get("/document/:id", this.getDocumentById.bind(this));
    // GET /document/:id/text (legacy)
    this.router.get("/document/:id/text", this.getDocumentText.bind(this));

    this.router.get("/document/:id/parse", this.getParseDocumentText.bind(this));
    // GET /document/:id/fragment/:fragment_id/text
    this.router.get("/document/:id/fragment/:fragment_id/text", this.getFragmentText.bind(this));
    // POST /embeddings/:id
    this.router.post("/embeddings/:id", this.postEmbeddings.bind(this));
    // GET /embeddings/:id
    this.router.get("/embeddings/:id", this.getEmbeddings.bind(this));

    this.router.get("/update", this.Update.bind(this));
    this.router.get("/update1", this.Update1.bind(this));
  }

  async Update(req: Request, res: Response) {
    this.program.Update();
    res.json("OK");
  }

  async Update1(req: Request, res: Response) {
    await safe(() => this.program.UpdateEmbedding());
    res.json("OK");
  }

  getRouter(): Router {
    return this.router;
  }

  // GET /documents
  async getAllDocuments(req: Request, res: Response) {
    try {
      const sessions = await this.repo.findAllSessionsAll();
      // const result = [];
      // for (const session of sessions) {
      //   const doc = await this.getSessionWithDetails1(session.id);
      //   if (doc) result.push(doc);
      // }
      res.json(sessions);
    } catch (err) {
      console.error("Error in GET /documents:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  // GET /documents/:id
  async getDocumentById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (typeof id !== "string") {
        return res.status(400).send("id");
      }
      const doc = await this.getSessionWithDetails2(id);
      if (!doc) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(doc);
    } catch (err) {
      console.error("Error in GET /documents/:id:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  // GET /documents/:id/text (legacy) – возвращает весь текст сессии (склеенные фрагменты)
  async getDocumentText(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (typeof id !== "string") {
        return res.status(400).send("id");
      }
      const session = await this.repo.findSessionById(id);
      if (!session) {
        return res.status(404).send("Document not found");
      }

      const messages = await this.repo.findAllMessages(id);
      const texts: string[] = [];
      for (const msg of messages) {
        const fragments = await this.repo.findAllFragments(id, msg.messageId);
        for (const frag of fragments) {
          texts.push(frag.content);
        }
        // Файлы не включаем в текст
      }

      const fullText = texts.join("\n\n");
      res.set("Content-Type", "text/plain; charset=utf-8");
      res.send(fullText);
    } catch (err) {
      console.error("Error in GET /documents/:id/text:", err);
      res.status(500).send("Internal server error");
    }
  }

  // GET /documents/:id/text (legacy) – возвращает весь текст сессии (склеенные фрагменты)
  async getParseDocumentText(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (typeof id !== "string") {
        return res.status(400).send("id");
      }
      const session = await this.repo.findSessionById(id);
      if (!session) {
        return res.status(404).send("Document not found");
      }

      const messages = await this.repo.findAllMessages(id);
      const texts: string[] = [];
      for (const msg of messages) {
        const fragments = await this.repo.findAllFragments(id, msg.messageId);
        for (const frag of fragments) {
          texts.push(frag.content);
        }
        // Файлы не включаем в текст
      }

      const fullText = texts.join("\n\n");
      let result = this.headingCodeParser.parse(fullText);
      res.json(result);
    } catch (err) {
      console.error("Error in GET /documents/:id/text:", err);
      res.status(500).send("Internal server error");
    }
  }

  // GET /documents/:id/fragment/:fragment_id/text
  async getFragmentText(req: Request, res: Response) {
    try {
      const { id, fragment_id } = req.params;
      if (typeof id !== "string") {
        return res.status(400).send("id");
      }
      if (typeof fragment_id !== "string") {
        return res.status(400).send("id");
      }
      // Ожидаем форматы: msg_<messageId>_frag_<fragmentOrder> или file_<fileId>
      if (fragment_id.startsWith("msg_")) {
        // Парсим: msg_123_frag_456
        const match = fragment_id.match(/^msg_(\d+)_frag_(\d+)$/);
        if (!match) {
          return res.status(400).send("Invalid fragment ID format");
        }
        const messageId = parseInt(match[1], 10);
        const fragmentOrder = parseInt(match[2], 10);
        const fragment = await this.repo.findFragmentById(id, messageId, fragmentOrder);
        if (!fragment) {
          return res.status(404).send("Fragment not found");
        }
        res.set("Content-Type", "text/plain; charset=utf-8");
        res.send(fragment.content);
      } else if (fragment_id.startsWith("file_")) {
        const fileId = fragment_id.substring(5);
        const file = await this.repo.findFileById(fileId);
        if (!file) {
          return res.status(404).send("File not found");
        }
        // Файлы не являются текстом – возвращаем 404 или пустоту (по заданию не уточнено)

        res.send(file.contentBytes);
        res.status(404).send("File content not available as text");
      } else {
        res.status(400).send("Invalid fragment ID");
      }
    } catch (err) {
      console.error("Error in GET /documents/:id/fragment/:fragment_id/text:", err);
      res.status(500).send("Internal server error");
    }
  }

  // GET /embeddings/:id
  async getEmbeddings(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (typeof id !== "string") {
        return res.status(400).send("id");
      }

      const embeddings = await this.repo.findEmbeddingsBySession(id);
      res.status(200).json(embeddings);
    } catch (err) {
      console.error("Error in POST /embeddings/:id:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  // POST /embeddings/:id
  async postEmbeddings(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (typeof id !== "string") {
        return res.status(400).send("id");
      }
      const session = await this.repo.findSessionById(id);
      if (!session) {
        return res.status(404).json({ error: "Document not found" });
      }

      const embeddingsArray = req.body as EmbeddingCreate[];
      if (!Array.isArray(embeddingsArray)) {
        return res.status(400).json({ error: "Request body must be an array" });
      }

      var embs = embeddingsArray.map((emb) => ({
        session_title: session.title,
        model_name: emb.model_name,
      }));

      // // Валидация каждого объекта
      // for (const emb of embeddingsArray) {

      //   if (!emb.model_name || !emb.embedding || !emb.dimension || emb.processing_time_ms === undefined) {
      //     return res.status(400).json({ error: "Missing required fields in embedding object" });
      //   }
      // }

      const count = await this.repo.createManyEmbeddings(id, embeddingsArray);
      res.status(200).json({ status: "ok", received: count });
      console.log("POST /embeddings/:id:", embs);
    } catch (err) {
      console.error("Error in POST /embeddings/:id:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  // Вспомогательные методы для получения данных о сессии
  private async getSessionWithDetails1(sessionId: string): Promise<any> {
    const session = await this.repo.findSessionById(sessionId);
    if (!session) return null;
    // Получаем эмбеддинги для сессии (список моделей)
    const embeddings = await this.repo.findEmbeddingsBySession(sessionId);
    const models = embeddings.map((e) => e.model_name);

    return {
      ...session,
      models,
    };
  }

  // Вспомогательные методы для получения данных о сессии
  private async getSessionWithDetails2(sessionId: string): Promise<any> {
    const session = await this.repo.findSessionById(sessionId);
    if (!session) return null;

    // Получаем все сообщения сессии
    const messages = await this.repo.findAllMessages(sessionId);

    // Собираем фрагменты (текстовые) и файлы
    const fragmentsList: { id: string; size_bytes: number; messageId: number; name?: string }[] = [];
    for (const msg of messages) {
      const files = await this.repo.getFilesForMessage(sessionId, msg.messageId);
      for (const file of files) {
        fragmentsList.push({
          id: `file_${file.id}`,
          name: file.file_name,
          messageId: msg.messageId,
          size_bytes: file.file_size,
        });
      }
      // Текстовые фрагменты
      const msgFragments = await this.repo.findAllFragments(sessionId, msg.messageId);
      for (const frag of msgFragments) {
        fragmentsList.push({
          id: `msg_${msg.messageId}_frag_${frag.fragmentOrder}`,
          messageId: msg.messageId,
          size_bytes: Buffer.byteLength(frag.content, "utf8"),
        });
      }
      // Файлы, прикреплённые к сообщению
    }

    // Получаем эмбеддинги для сессии (список моделей)
    const embeddings = await this.repo.findEmbeddingsBySession(sessionId);
    const models = embeddings.map((e) => e.model_name);

    return {
      ...session,
      size_bytes: fragmentsList.reduce((sum, f) => sum + f.size_bytes, 0),
      models,
      fragments: fragmentsList,
      messages,
    };
  }
}
