import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export function getPrisma(): PrismaClient {
  try {
    if (globalForPrisma.prisma) {
      return globalForPrisma.prisma;
    }
    const client = new PrismaClient();
    if (process.env.NODE_ENV !== "production") {
      globalForPrisma.prisma = client;
    }
    return client;
  } catch (err) {
    console.error("[getPrisma]", err);
    if (
      err instanceof Error &&
      err.message.includes("did not initialize yet")
    ) {
      throw new Error(
        'Prisma Client ยังไม่ถูก generate — รัน `npx prisma generate` หรือ `npm run db:generate` แล้วลองใหม่ (หรือใช้ `npm run dev` จะ generate อัตโนมัติผ่าน predev)',
        { cause: err },
      );
    }
    throw err;
  }
}
