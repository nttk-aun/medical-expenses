import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export function getPrisma(): PrismaClient {
  try {
    if (!globalForPrisma.prisma) {
      globalForPrisma.prisma = new PrismaClient({
        log:
          process.env.NODE_ENV === "development"
            ? ["error", "warn"]
            : ["error"],
      });
    }
    return globalForPrisma.prisma;
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
