-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "title_type" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);
