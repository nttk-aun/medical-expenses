/**
 * แสดงวันที่แบบใบเสร็จ: DD/MM/YYYY ปี พ.ศ.
 * ลง DB / API ยังใช้ ค.ศ. รูปแบบ YYYY-MM-DD
 * รองรับคำย่อเดือน เช่น "10 พ.ค. 2569" และปี พ.ศ. สองหลัก เช่น "69" → 2569
 */

/**
 * ปีบนใบรักษาเป็น พ.ศ. — ถ้าเขียน 2 หลัก (เช่น 69) ให้ถือว่าเป็น 25xx (2569)
 * ถ้า 4 หลักอยู่ในช่วง 2300–2900 ใช้ตามนั้น
 */
export function expandThaiBuddhistEraYearFromToken(raw: string): number | null {
  try {
    const s = raw.replace(/,/g, "").trim();
    if (!/^\d+$/.test(s)) {
      return null;
    }
    const n = Number.parseInt(s, 10);
    if (!Number.isFinite(n)) {
      return null;
    }
    if (s.length === 2) {
      const full = 2500 + n;
      if (full >= 2488 && full <= 2605) {
        return full;
      }
      return null;
    }
    if (s.length === 4) {
      if (n >= 2300 && n <= 2900) {
        return n;
      }
      return null;
    }
    return null;
  } catch (err) {
    console.error("[expandThaiBuddhistEraYearFromToken]", err);
    return null;
  }
}
function thaiMonthTokenToNumberReceipt(token: string): number | null {
  try {
    const spaced = token.replace(/\s+/g, " ").trim();
    const collapsed = spaced.replace(/\./g, "").replace(/\s+/g, "");

    switch (true) {
      case collapsed.includes("มกราคม"):
      case collapsed === "มค":
      case /^ม\.?\s*ค\.?$/u.test(spaced):
        return 1;
      case collapsed.includes("กุมภาพันธ์"):
      case collapsed.includes("กุมภา"):
      case collapsed === "กพ":
      case /^ก\.?\s*พ\.?$/u.test(spaced):
        return 2;
      case collapsed.includes("มีนาคม"):
      case collapsed.includes("มีนา"):
      case collapsed === "มีค":
      case /^ม\.?\s*มี\.?\s*ค\.?$/u.test(spaced):
      case /^มี\.?\s*ค\.?$/u.test(spaced):
        return 3;
      case collapsed.includes("เมษายน"):
      case collapsed === "เมย":
      case /^เม\.?\s*ย\.?$/u.test(spaced):
        return 4;
      case collapsed.includes("พฤษภาคม"):
      case collapsed.includes("พฤษภาคม"):
      case collapsed.includes("พืษภาคม"):
      case collapsed.includes("พฤษภาคม"):
      case collapsed === "พค":
      case /^พ\.?\s*ค\.?$/u.test(spaced):
        return 5;
      case collapsed.includes("มิถุนายน"):
      case collapsed === "มย":
      case /^มิ\.?\s*ย\.?$/u.test(spaced):
        return 6;
      case collapsed.includes("กรกฎาคม"):
      case collapsed.includes("กรกฎา"):
      case collapsed === "กค":
      case /^ก\.?\s*ค\.?$/u.test(spaced):
        return 7;
      case collapsed.includes("สิงหาคม"):
      case collapsed.includes("สิงหา"):
      case collapsed === "สค":
      case /^สิ\.?\s*หา\.?$/u.test(spaced):
      case /^ส\.?\s*ค\.?$/u.test(spaced):
        return 8;
      case collapsed.includes("กันยายน"):
      case collapsed === "กย":
      case /^ก\.?\s*ย\.?$/u.test(spaced):
        return 9;
      case collapsed.includes("ตุลาคม"):
      case collapsed.includes("ตุลา"):
      case collapsed === "ตค":
      case /^ต\.?\s*ค\.?$/u.test(spaced):
        return 10;
      case collapsed.includes("พฤศจิกายน"):
      case collapsed.includes("พฤษจิกายน"):
      case collapsed.includes("พฤศจิกา"):
      case collapsed === "พย":
      case /^พ\.?\s*ย\.?$/u.test(spaced):
        return 11;
      case collapsed.includes("ธันวาคม"):
      case collapsed.includes("ธันวา"):
      case collapsed === "ธค":
      case /^ธ\.?\s*ค\.?$/u.test(spaced):
        return 12;
      default:
        return null;
    }
  } catch (err) {
    console.error("[thaiMonthTokenToNumberReceipt]", err);
    return null;
  }
}

/** รูปแบบ "10 พ.ค. 2569" / "10 พค 2569" / "10-พ.ค.-2569" → DD/MM/YYYY พ.ศ. */
function thaiWrittenDayMonthBeToDdMmYyyyBe(text: string): string | null {
  try {
    const t = text.replace(/\s+/g, " ").trim();
    if (!t) {
      return null;
    }
    const re =
      /^(\d{1,2})[\s/\-]+([\u0E00-\u0E7F][\u0E00-\u0E7F\.\s]{0,30}?)[\s/\-]+(\d{2}|\d{4})$/u;
    const m = re.exec(t);
    if (!m) {
      return null;
    }
    const d = Number.parseInt(m[1], 10);
    const monthNum = thaiMonthTokenToNumberReceipt(m[2].trim());
    const yBe = expandThaiBuddhistEraYearFromToken(m[3].replace(/,/g, ""));
    if (monthNum == null || !Number.isFinite(d) || yBe == null) {
      return null;
    }
    if (monthNum < 1 || monthNum > 12 || d < 1 || d > 31) {
      return null;
    }
    if (yBe < 2300 || yBe > 2900) {
      return null;
    }
    const yCe = yBe - 543;
    const check = new Date(Date.UTC(yCe, monthNum - 1, d));
    if (
      check.getUTCFullYear() !== yCe ||
      check.getUTCMonth() !== monthNum - 1 ||
      check.getUTCDate() !== d
    ) {
      return null;
    }
    const dd = String(d).padStart(2, "0");
    const mm = String(monthNum).padStart(2, "0");
    return `${dd}/${mm}/${yBe}`;
  } catch (err) {
    console.error("[thaiWrittenDayMonthBeToDdMmYyyyBe]", err);
    return null;
  }
}

/** จัดรูปช่องวันที่: DD/MM/YYYY พ.ศ. หรือข้อความแบบใบ (เช่น 10 พ.ค. 2569) → DD/MM/YYYY พ.ศ. */
export function parseReceiptDateFieldToThaiBeDisplay(raw: string): string | null {
  try {
    const t = raw.trim();
    if (!t) {
      return null;
    }
    const viaSlash = thaiBeDdMmYyyyToCeIsoDateString(t);
    if (viaSlash) {
      return ceIsoDateStringToThaiBeDdMmYyyy(viaSlash);
    }
    return thaiWrittenDayMonthBeToDdMmYyyyBe(t);
  } catch (err) {
    console.error("[parseReceiptDateFieldToThaiBeDisplay]", err);
    return null;
  }
}

/** แปลงช่องวันที่ (ทั้งแบบ 20/05/2563 และ 10 พ.ค. 2569) → YYYY-MM-DD ค.ศ. สำหรับ API */
export function parseReceiptDateFieldToCeIso(raw: string): string | null {
  try {
    const t = raw.trim();
    if (!t) {
      return null;
    }
    const direct = thaiBeDdMmYyyyToCeIsoDateString(t);
    if (direct) {
      return direct;
    }
    const ddMmBe = thaiWrittenDayMonthBeToDdMmYyyyBe(t);
    if (!ddMmBe) {
      return null;
    }
    return thaiBeDdMmYyyyToCeIsoDateString(ddMmBe);
  } catch (err) {
    console.error("[parseReceiptDateFieldToCeIso]", err);
    return null;
  }
}

/** แปลง YYYY-MM-DD (ค.ศ.) → DD/MM/YYYY (พ.ศ.) สำหรับแสดงในฟอร์ม */
export function ceIsoDateStringToThaiBeDdMmYyyy(iso: string | null | undefined): string {
  try {
    if (!iso || typeof iso !== "string") {
      return "";
    }
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
    if (!m) {
      return "";
    }
    const yCe = Number.parseInt(m[1], 10);
    const mo = Number.parseInt(m[2], 10);
    const d = Number.parseInt(m[3], 10);
    if (![yCe, mo, d].every((n) => Number.isFinite(n))) {
      return "";
    }
    const be = yCe + 543;
    const dd = String(d).padStart(2, "0");
    const mm = String(mo).padStart(2, "0");
    return `${dd}/${mm}/${be}`;
  } catch (err) {
    console.error("[ceIsoDateStringToThaiBeDdMmYyyy]", err);
    return "";
  }
}

/** แปลง DD/MM/YYYY ที่ปีเป็นพ.ศ. → YYYY-MM-DD (ค.ศ.) สำหรับส่ง API */
export function thaiBeDdMmYyyyToCeIsoDateString(display: string): string | null {
  try {
    const raw = display.trim();
    if (!raw) {
      return null;
    }
    const parts = raw.split(/[/\-.]/).map((p) => p.trim().replace(/,/g, ""));
    if (parts.length !== 3) {
      return null;
    }
    const d = Number.parseInt(parts[0], 10);
    const mo = Number.parseInt(parts[1], 10);
    const yBe = expandThaiBuddhistEraYearFromToken(parts[2]);
    if (yBe == null) {
      return null;
    }
    if (mo < 1 || mo > 12 || d < 1 || d > 31) {
      return null;
    }
    if (yBe < 2300 || yBe > 2900) {
      return null;
    }
    const yCe = yBe - 543;
    if (yCe < 1800 || yCe > 2200) {
      return null;
    }
    const check = new Date(Date.UTC(yCe, mo - 1, d));
    if (
      check.getUTCFullYear() !== yCe ||
      check.getUTCMonth() !== mo - 1 ||
      check.getUTCDate() !== d
    ) {
      return null;
    }
    const yyyy = String(yCe).padStart(4, "0");
    const mm = String(mo).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  } catch (err) {
    console.error("[thaiBeDdMmYyyyToCeIsoDateString]", err);
    return null;
  }
}
