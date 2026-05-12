import type { OcrLineBox } from "@/lib/ocr";
import { expandThaiBuddhistEraYearFromToken } from "@/lib/date-thai-display";

export type ParsedExpense = {
  serviceDate: Date | null;
  amountThb: number | null;
  dateSource: string | null;
  amountSource: string | null;
};

/** พ.ศ. บนใบเสร็จมัก ≥ 2400 — แปลงเป็น ค.ศ. สำหรับเก็บ DB. ปี ค.ศ. (เช่น 2019–2035) ไม่ลบ 543 */
function yearForGregorianStorage(yearRaw: number): number {
  try {
    if (yearRaw >= 2400 && yearRaw <= 2800) {
      return yearRaw - 543;
    }
    return yearRaw;
  } catch (err) {
    console.error("[yearForGregorianStorage]", err);
    throw err;
  }
}

/** แปลงชิ้นข้อความที่น่าจะเป็นชื่อเดือนไทย → หมายเลขเดือน (รองรับ OCR / ตัวย่อ) */
function thaiMonthFragmentToNumber(fragment: string): number | null {
  try {
    const collapsed = fragment.replace(/\s+/g, "").replace(/\./g, "");
    const loose = fragment.replace(/\s+/g, " ").trim();

    switch (true) {
      case collapsed.includes("มกราคม") ||
        /^ม\.?ค\.?$/u.test(loose) ||
        collapsed === "มค":
        return 1;
      case collapsed.includes("กุมภาพันธ์") ||
        collapsed.includes("กุมภา") ||
        /^ก\.?พ\.?$/u.test(loose) ||
        collapsed === "กพ":
        return 2;
      case collapsed.includes("มีนาคม") ||
        collapsed.includes("มีนา") ||
        /^ม\.?มี\.?ค\.?$/u.test(loose) ||
        /^มี\.?ค\.?$/u.test(loose) ||
        collapsed === "มีค":
        return 3;
      case collapsed.includes("เมษายน") ||
        /^เม\.?ย\.?$/u.test(loose) ||
        collapsed === "เมย":
        return 4;
      case collapsed.includes("พฤษภาคม") ||
        collapsed.includes("พฤษภาคม") ||
        collapsed.includes("พืษภาคม") ||
        collapsed.includes("พฤษภาคม") ||
        /^พ\.?ค\.?$/u.test(loose) ||
        collapsed === "พค":
        return 5;
      case collapsed.includes("มิถุนายน") ||
        /^ม\.?ย\.?$/u.test(loose) ||
        collapsed === "มย":
        return 6;
      case collapsed.includes("กรกฎาคม") ||
        collapsed.includes("กรกฎา") ||
        /^ก\.?ค\.?$/u.test(loose) ||
        collapsed === "กค":
        return 7;
      case collapsed.includes("สิงหาคม") ||
        collapsed.includes("สิงหา") ||
        /^ส\.?ค\.?$/u.test(loose) ||
        collapsed === "สค":
        return 8;
      case collapsed.includes("กันยายน") ||
        /^ก\.?ย\.?$/u.test(loose) ||
        collapsed === "กย":
        return 9;
      case collapsed.includes("ตุลาคม") ||
        collapsed.includes("ตุลา") ||
        /^ต\.?ค\.?$/u.test(loose) ||
        collapsed === "ตค":
        return 10;
      case collapsed.includes("พฤศจิกายน") ||
        collapsed.includes("พฤษจิกายน") ||
        collapsed.includes("พฤศจิกา") ||
        /^พ\.?ย\.?$/u.test(loose) ||
        collapsed === "พย":
        return 11;
      case collapsed.includes("ธันวาคม") ||
        collapsed.includes("ธันวา") ||
        /^ธ\.?ค\.?$/u.test(loose) ||
        collapsed === "ธค":
        return 12;
      default:
        return null;
    }
  } catch (err) {
    console.error("[thaiMonthFragmentToNumber]", err);
    return null;
  }
}

function parseYearToken(raw: string): number | null {
  try {
    const s = raw.replace(/,/g, "").trim();
    const be = expandThaiBuddhistEraYearFromToken(s);
    if (be != null) {
      return be;
    }
    const n = Number.parseInt(s, 10);
    if (!Number.isFinite(n)) {
      return null;
    }
    if (s.length === 4 && n >= 1900 && n <= 2100) {
      return n;
    }
    return null;
  } catch (err) {
    console.error("[parseYearToken]", err);
    return null;
  }
}

function parseDateFromMatch(
  day: number,
  month: number,
  yearRaw: number,
  source: string,
): { date: Date; source: string } | null {
  try {
    const year = yearForGregorianStorage(yearRaw);
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }
    const utc = Date.UTC(year, month - 1, day);
    if (Number.isNaN(utc)) {
      return null;
    }
    return { date: new Date(utc), source };
  } catch (err) {
    console.error("[parseDateFromMatch]", err);
    return null;
  }
}

/** รูปแบบ "20 พฤษภาคม 2563" / "12 พ.ค. 69" (ปี พ.ศ. สองหลัก → 2569) */
function extractThaiWrittenDates(text: string): Array<{ date: Date; source: string; index: number }> {
  const out: Array<{ date: Date; source: string; index: number }> = [];
  try {
    const re =
      /(\d{1,2})\s+([\u0E00-\u0E7F\u0020\.]{2,32}?)\s+(\d{2}|\d{4})/gu;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const day = Number.parseInt(m[1], 10);
      const monthStr = m[2];
      const yearRaw = parseYearToken(m[3]);
      if (yearRaw == null) {
        continue;
      }
      const month = thaiMonthFragmentToNumber(monthStr);
      if (month == null) {
        continue;
      }
      const parsed = parseDateFromMatch(day, month, yearRaw, "d_thai_month_y");
      if (parsed) {
        out.push({ ...parsed, index: m.index ?? 0 });
      }
    }
    return out;
  } catch (err) {
    console.error("[extractThaiWrittenDates]", err);
    return out;
  }
}

function extractBestDate(text: string): { date: Date; source: string } | null {
  try {
    const patterns: Array<{ re: RegExp; source: string }> = [
      { re: /(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})/g, source: "dmy_numeric" },
      { re: /(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/g, source: "ymd_numeric" },
    ];

    const candidates: Array<{ date: Date; source: string }> = [];

    for (const hit of extractThaiWrittenDates(text)) {
      candidates.push({
        date: hit.date,
        source: hit.source,
      });
    }

    for (const { re, source } of patterns) {
      let m: RegExpExecArray | null;
      const r = new RegExp(re.source, re.flags);
      while ((m = r.exec(text)) !== null) {
        if (source === "ymd_numeric") {
          const y = Number(m[1]);
          const mo = Number(m[2]);
          const d = Number(m[3]);
          const parsed = parseDateFromMatch(d, mo, y, source);
          if (parsed) {
            candidates.push({ ...parsed });
          }
        } else {
          const d = Number(m[1]);
          const mo = Number(m[2]);
          const yParsed = parseYearToken(m[3]);
          if (yParsed == null) {
            continue;
          }
          const parsed = parseDateFromMatch(d, mo, yParsed, source);
          if (parsed) {
            candidates.push({ ...parsed });
          }
        }
      }
    }

    if (candidates.length === 0) {
      return null;
    }
    const sourceRank = (s: string): number => {
      try {
        if (s === "d_thai_month_y") {
          return 2;
        }
        if (s.startsWith("ymd")) {
          return 1;
        }
        return 0;
      } catch (err) {
        console.error("[sourceRank]", err);
        return 0;
      }
    };
    candidates.sort((a, b) => {
      const byTime = b.date.getTime() - a.date.getTime();
      if (byTime !== 0) {
        return byTime;
      }
      return sourceRank(b.source) - sourceRank(a.source);
    });
    const best = candidates[0];
    return { date: best.date, source: best.source };
  } catch (err) {
    console.error("[extractBestDate]", err);
    return null;
  }
}

function parseMoneyToken(raw: string): number | null {
  try {
    const cleaned = raw.replace(/,/g, "").replace(/\s+/g, "");
    const n = Number.parseFloat(cleaned);
    if (!Number.isFinite(n) || n <= 0) {
      return null;
    }
    return n;
  } catch (err) {
    console.error("[parseMoneyToken]", err);
    return null;
  }
}

function isLikelyReceiptReferenceToken(rawToken: string, amount: number): boolean {
  try {
    const t = rawToken.replace(/,/g, "").trim();
    const intOnly = /^\d+$/.test(t);
    if (intOnly && t.length >= 10 && amount >= 10_000_000) {
      return true;
    }
    if (intOnly && t.length >= 12) {
      return true;
    }
    return false;
  } catch (err) {
    console.error("[isLikelyReceiptReferenceToken]", err);
    return false;
  }
}

function lineHasStrongTotalKeyword(line: string): boolean {
  try {
    return /รวมทั้งสิ้น|ยอดชำระ(?:เงิน)?|Grand\s*Total|ยอด(?:เงิน)?รวม|จำนวนเงิน(?:ทั้งสิ้น)?|Net\s*Amount|TOTAL\s*THB|ชำระ(?:แล้ว)?|สุทธิ|ยอดสุทธิ|Amount\s*Due|Balance\s*Due|ค่ารักษาพยาบาล|ค่ารักษา|ค่ายา|ค่าบริการ|ยอดที่ต้องชำระ/i.test(
      line,
    );
  } catch (err) {
    console.error("[lineHasStrongTotalKeyword]", err);
    return false;
  }
}

function lineHasWeakMoneyKeyword(line: string): boolean {
  try {
    return /รวม|total|net|ยอด|ชำระ|balance|บาท|THB|฿/i.test(line);
  } catch (err) {
    console.error("[lineHasWeakMoneyKeyword]", err);
    return false;
  }
}

/** ดึงช่วงตัวเลขเงิน — จับยาวสุดก่อน กันปัญหา 2500 → 250 และ 1,000.00 → 1 */
function findMoneySpansInString(text: string): Array<{ raw: string; start: number; end: number }> {
  try {
    type Span = { start: number; end: number; raw: string; len: number };
    const patterns: RegExp[] = [
      /\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?/g,
      /(?<![\d,])\d{4,11}(?:\.\d{1,2})?(?![\d])/g,
      /(?<![\d,.])\d{1,3}\.\d{1,2}(?!\.\d)/g,
    ];
    const all: Span[] = [];
    for (const re of patterns) {
      const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
      const r = new RegExp(re.source, flags);
      r.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = r.exec(text)) !== null) {
        const raw = m[0];
        const start = m.index ?? 0;
        const end = start + raw.length;
        all.push({ start, end, raw, len: end - start });
      }
    }
    all.sort((a, b) => b.len - a.len || a.start - b.start);

    const kept: Span[] = [];
    for (const s of all) {
      const overlaps = kept.some(
        (k) => !(s.end <= k.start || s.start >= k.end),
      );
      if (!overlaps) {
        kept.push(s);
      }
    }
    kept.sort((a, b) => a.start - b.start);
    return kept.map(({ raw, start, end }) => ({ raw, start, end }));
  } catch (err) {
    console.error("[findMoneySpansInString]", err);
    return [];
  }
}

function collectMoneyCandidatesInText(
  text: string,
  baseIndex: number,
): Array<{ raw: string; amount: number; index: number }> {
  const found: Array<{ raw: string; amount: number; index: number }> = [];
  try {
    for (const span of findMoneySpansInString(text)) {
      const amount = parseMoneyToken(span.raw);
      if (amount == null || amount <= 0 || amount > 50_000_000) {
        continue;
      }
      if (isLikelyReceiptReferenceToken(span.raw, amount)) {
        continue;
      }
      found.push({ raw: span.raw, amount, index: baseIndex + span.start });
    }
    return found;
  } catch (err) {
    console.error("[collectMoneyCandidatesInText]", err);
    return found;
  }
}

function bboxBottomRightScore(bbox: OcrLineBox["bbox"], W: number, H: number): number {
  try {
    const w = Math.max(W, 1);
    const h = Math.max(H, 1);
    const cx = (bbox.x0 + bbox.x1) / 2 / w;
    const cy = (bbox.y0 + bbox.y1) / 2 / h;
    return 0.38 * cx + 0.62 * cy;
  } catch (err) {
    console.error("[bboxBottomRightScore]", err);
    return 0;
  }
}

function extractBestAmountFromOcrLines(
  ocrLines: OcrLineBox[],
): { amount: number; source: string } | null {
  try {
    if (ocrLines.length === 0) {
      return null;
    }
    let W = 0;
    let H = 0;
    for (const ln of ocrLines) {
      W = Math.max(W, ln.bbox.x1);
      H = Math.max(H, ln.bbox.y1);
    }
    if (W < 80 || H < 80) {
      return null;
    }

    type Cand = { amount: number; score: number; source: string };
    const cands: Cand[] = [];

    for (const ln of ocrLines) {
      const pos = bboxBottomRightScore(ln.bbox, W, H);
      const vertical = ((ln.bbox.y0 + ln.bbox.y1) / 2 / H) * 100;
      const keywordStrong = lineHasStrongTotalKeyword(ln.text);
      const keywordWeak = lineHasWeakMoneyKeyword(ln.text);
      const keywordBoost =
        (keywordStrong ? 1_200_000 : 0) + (keywordWeak && !keywordStrong ? 350_000 : 0);
      const verticalPenalty = vertical < 32 && !keywordStrong ? 0.35 : 1;

      const hits = collectMoneyCandidatesInText(ln.text, 0);
      for (const h of hits) {
        const hasDecimals = /\.\d{2}$/.test(h.raw) || h.raw.includes(",");
        const formatBoost = hasDecimals ? 80_000 : 0;
        const score =
          (pos * 2_800_000 + keywordBoost + formatBoost + Math.min(h.amount, 200_000) / 5000) *
          verticalPenalty;
        cands.push({
          amount: h.amount,
          score,
          source: "ocr_bbox_bottom_right",
        });
      }
    }

    if (cands.length === 0) {
      return null;
    }
    cands.sort((a, b) => b.score - a.score || b.amount - a.amount);
    const best = cands[0];
    return { amount: best.amount, source: best.source };
  } catch (err) {
    console.error("[extractBestAmountFromOcrLines]", err);
    return null;
  }
}

function extractBestAmountFromPlainLines(
  text: string,
): { amount: number; source: string } | null {
  try {
    const lines = text
      .split(/\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      return null;
    }
    type Cand = { amount: number; score: number };
    const cands: Cand[] = [];
    const n = lines.length;
    for (let i = 0; i < n; i++) {
      const line = lines[i] ?? "";
      const bottomWeight = (i + 1) / n;
      const keywordStrong = lineHasStrongTotalKeyword(line);
      const keywordWeak = lineHasWeakMoneyKeyword(line);
      const kw = (keywordStrong ? 900_000 : 0) + (keywordWeak && !keywordStrong ? 280_000 : 0);
      const hits = collectMoneyCandidatesInText(line, 0);
      for (const h of hits) {
        const hasDecimals = /\.\d{2}$/.test(h.raw) || h.raw.includes(",");
        const formatBoost = hasDecimals ? 60_000 : 0;
        const score =
          bottomWeight * 2_200_000 + kw + formatBoost + Math.min(h.amount, 200_000) / 6000;
        cands.push({ amount: h.amount, score });
      }
    }
    if (cands.length === 0) {
      return null;
    }
    cands.sort((a, b) => b.score - a.score || b.amount - a.amount);
    return { amount: cands[0].amount, source: "ocr_text_lines_bottom" };
  } catch (err) {
    console.error("[extractBestAmountFromPlainLines]", err);
    return null;
  }
}

function extractBestAmount(
  text: string,
  ocrLines?: OcrLineBox[],
): { amount: number; source: string } | null {
  try {
    if (ocrLines && ocrLines.length > 0) {
      const fromBoxes = extractBestAmountFromOcrLines(ocrLines);
      if (fromBoxes) {
        return fromBoxes;
      }
    }
    const fromLines = extractBestAmountFromPlainLines(text);
    if (fromLines) {
      return fromLines;
    }

    const lower = text.toLowerCase();
    const keywordOffsets: number[] = [];
    const keywords = [
      "รวมทั้งสิ้น",
      "ยอดชำระ",
      "grand total",
      "total",
      "net",
      "balance",
      "ชำระ",
      "ยอด",
      "สุทธิ",
    ];
    for (const k of keywords) {
      let idx = lower.indexOf(k);
      while (idx !== -1) {
        keywordOffsets.push(idx);
        idx = lower.indexOf(k, idx + k.length);
      }
    }

    const moneySpans = findMoneySpansInString(text);
    const amounts: Array<{ amount: number; index: number; bonus: number }> = [];
    for (const span of moneySpans) {
      const raw = span.raw;
      const amount = parseMoneyToken(raw);
      if (amount == null || amount > 50_000_000) {
        continue;
      }
      if (isLikelyReceiptReferenceToken(raw, amount)) {
        continue;
      }
      const index = span.start;
      const nearKeyword = keywordOffsets.some((k) => Math.abs(k - index) < 100);
      const bonus = nearKeyword ? 1_000_000 : 0;
      amounts.push({ amount, index, bonus: bonus + amount });
    }

    if (amounts.length === 0) {
      return null;
    }
    amounts.sort((a, b) => b.bonus - a.bonus || b.amount - a.amount);
    const best = amounts[0];
    return { amount: best.amount, source: "heuristic_money_legacy" };
  } catch (err) {
    console.error("[extractBestAmount]", err);
    return null;
  }
}

export function parseExpenseFromOcrText(
  rawText: string,
  ocrLines?: OcrLineBox[],
): ParsedExpense {
  try {
    const text = rawText.replace(/\r/g, "\n");
    const dateHit = extractBestDate(text);
    const amountHit = extractBestAmount(text, ocrLines);
    return {
      serviceDate: dateHit?.date ?? null,
      amountThb: amountHit?.amount ?? null,
      dateSource: dateHit?.source ?? null,
      amountSource: amountHit?.source ?? null,
    };
  } catch (err) {
    console.error("[parseExpenseFromOcrText]", err);
    return {
      serviceDate: null,
      amountThb: null,
      dateSource: null,
      amountSource: null,
    };
  }
}
