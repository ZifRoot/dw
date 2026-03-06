// src/cli.ts

import "dotenv/config";
import { PrismaItemRepository } from "./PrismaItemRepository";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "crypto";
import { PrismaClient } from "../generated/prisma/client";

export async function testDb1() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }), log: ["query", "info", "warn", "error"] });
  const repository = new PrismaItemRepository(prisma);

  await repository.create({ id: randomUUID(), title: "hterthtr", title_type: "fg", updated_at: 4 });

  await prisma.$disconnect();
}

// runWithPromiseAsync(main()).catch(console.error);
