// src/cli.ts

import "dotenv/config";
import { PrismaItemRepository } from "./PrismaItemRepository";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { DrizzleItemRepository } from "./DrizzleItemRepository";
import { db_drizzle } from "./drizzle/drizzle-db";

export async function testDb1() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const repository = new PrismaItemRepository(prisma);

  let ax = await repository.findAll();
  let str = JSON.stringify(ax);
  console.log(str);
  //await repository.create({ id: randomUUID(), title: "hterthtr", title_type: "fg", updated_at: 4 });

  await prisma.$disconnect();
}

export function InitPrismaDb() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  return new PrismaItemRepository(prisma);
}

export function InitdrizzleDb() {
  return new DrizzleItemRepository(db_drizzle);
}

export function InitDb() {
  return InitdrizzleDb();
}
// runWithPromiseAsync(main()).catch(console.error);
