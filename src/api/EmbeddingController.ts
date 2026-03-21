import { Router, Request, Response } from "express";
import { IRepository } from "../db/IRepository";

export class EmbeddingController {
  private router: Router;

  constructor(private repo: IRepository) {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes() {
    // GET /documents
    this.router.get("/documents", this.getAllDocuments.bind(this));
    // GET /documents/:id
    this.router.get("/document/:id", this.getDocumentById.bind(this));
    // GET /document/:id/text (legacy)
    this.router.get("/document/:id/text", this.getDocumentText.bind(this));
    // GET /document/:id/fragment/:fragment_id/text
    this.router.get("/document/:id/fragment/:fragment_id/text", this.getFragmentText.bind(this));
    // POST /embeddings/:id
    this.router.post("/embeddings/:id", this.postEmbeddings.bind(this));
  }

  getRouter(): Router {
    return this.router;
  }

  // GET /documents
  async getAllDocuments(req: Request, res: Response) {
    try {
      const sessions = await this.repo.findAllSessionsAll();
      const result = [];
      for (const session of sessions) {
        const doc = await this.getSessionWithDetails1(session.id);
        if (doc) result.push(doc);
      }
      res.json(result);
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
        res.status(404).send("File content not available as text");
      } else {
        res.status(400).send("Invalid fragment ID");
      }
    } catch (err) {
      console.error("Error in GET /documents/:id/fragment/:fragment_id/text:", err);
      res.status(500).send("Internal server error");
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

      const embeddingsArray = req.body;
      if (!Array.isArray(embeddingsArray)) {
        return res.status(400).json({ error: "Request body must be an array" });
      }

      // // Валидация каждого объекта
      // for (const emb of embeddingsArray) {

      //   if (!emb.model_name || !emb.embedding || !emb.dimension || emb.processing_time_ms === undefined) {
      //     return res.status(400).json({ error: "Missing required fields in embedding object" });
      //   }
      // }

      const count = await this.repo.createManyEmbeddings(id, embeddingsArray);
      res.status(200).json({ status: "ok", received: count });
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
    const fragmentsList: { id: string; size_bytes: number; messageId: number }[] = [];
    for (const msg of messages) {
      const files = await this.repo.getFilesForMessage(sessionId, msg.messageId);
      for (const file of files) {
        fragmentsList.push({
          id: `file_${file.id}`,
          messageId: msg.messageId,
          size_bytes: file.fileSize,
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
      messages
    };
  }
}
