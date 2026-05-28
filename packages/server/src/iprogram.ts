import { IRepository } from "./db/IRepository";

export interface IProgram {
  repo: () => IRepository;
  Update: () => void;
  UpdateEmbedding: () => Promise<void>;
}
