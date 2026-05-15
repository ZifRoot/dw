import "dotenv/config";
// import { PrismaItemRepository } from "./PrismaItemRepository";
// import { PrismaPg } from "@prisma/adapter-pg";
// import { PrismaClient } from "../generated/prisma/client";
import { DrizzleRepository } from "./DrizzleRepository";
import { db_drizzle } from "./drizzle/drizzle-db";
import { IRepository } from "./IRepository";
import { startAndWaitAsync, startAndWaitSync } from "./db-manager";

// export async function testDb1() {
//   const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
//   const repository = new PrismaItemRepository(prisma);

//   let ax = await repository.findAllSessions();
//   let str = JSON.stringify(ax);
//   console.log(str);
//   //await repository.create({ id: randomUUID(), title: "hterthtr", title_type: "fg", updated_at: 4 });

//   await prisma.$disconnect();
// }

// export function InitPrismaDb() {
//   const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
//   return new PrismaItemRepository(prisma);
// }

export function InitdrizzleDb() {
  return new DrizzleRepository(db_drizzle);
}

export function InitDb(): IRepository {
  if (!startAndWaitSync()) return null!;
  return InitdrizzleDb();
}

export function InitDbFast(): IRepository {
  return InitdrizzleDb();
}

export async function InitDbAsync(): Promise<IRepository> {
  if (!(await startAndWaitAsync())) return null!;
  return InitdrizzleDb();
}
// runWithPromiseAsync(main()).catch(console.error);
