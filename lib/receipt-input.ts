import { Prisma } from "@prisma/client";

export function parseAmountInput(raw: string): Prisma.Decimal | null {
  try {
    const cleaned = raw.trim().replace(/,/g, "");
    if (!cleaned) {
      return null;
    }
    const n = Number.parseFloat(cleaned);
    if (!Number.isFinite(n) || n < 0) {
      return null;
    }
    return new Prisma.Decimal(n.toFixed(2));
  } catch (err) {
    console.error("[parseAmountInput]", err);
    return null;
  }
}

export function parseDateInputYmd(raw: string): Date | null {
  try {
    const s = raw.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      return null;
    }
    const d = new Date(`${s}T12:00:00.000Z`);
    if (Number.isNaN(d.getTime())) {
      return null;
    }
    return d;
  } catch (err) {
    console.error("[parseDateInputYmd]", err);
    return null;
  }
}
