"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import {
  ceIsoDateStringToThaiBeDdMmYyyy,
  parseReceiptDateFieldToCeIso,
  parseReceiptDateFieldToThaiBeDisplay,
} from "@/lib/date-thai-display";
import { shouldUploadBlobThenClientOcr } from "@/lib/upload-client-flow";

type PreviewState = {
  stagingId: string;
  originalFilename: string;
  ocrSucceeded: boolean;
  ocrError: string | null;
  /** แสดงรูปจาก Blob URL โดยตรง (โฟลว์ client OCR บน Vercel) */
  previewImageSrc?: string | null;
  /** วัน/เดือน/ปี พ.ศ. ตามใบ เช่น 20/05/2563 */
  serviceDateThaiBe: string;
  amountThb: string;
  notes: string;
};

export function UploadForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const pollAbortRef = useRef<AbortController | null>(null);

  const resetPreview = useCallback(() => {
    try {
      pollAbortRef.current?.abort();
      pollAbortRef.current = null;
      setPreview(null);
      setOcrLoading(false);
    } catch (err) {
      console.error("[UploadForm.resetPreview]", err);
    }
  }, []);

  const pollStagingOcr = useCallback(async (stagingId: string, signal: AbortSignal) => {
    try {
      const maxAttempts = 40;
      for (let i = 0; i < maxAttempts; i++) {
        if (signal.aborted) {
          return;
        }
        const res = await fetch(`/api/receipts/staging/${stagingId}/status`, {
          signal,
        });
        if (!res.ok) {
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        const s = (await res.json()) as {
          ocrPending?: boolean;
          ocrSucceeded?: boolean;
          ocrError?: string | null;
          suggestedServiceDate?: string | null;
          suggestedAmountThb?: string | null;
        };
        if (!s.ocrPending) {
          setPreview((prev) =>
            prev && prev.stagingId === stagingId
              ? {
                  ...prev,
                  ocrSucceeded: s.ocrSucceeded !== false,
                  ocrError: s.ocrError ?? null,
                  serviceDateThaiBe: ceIsoDateStringToThaiBeDdMmYyyy(
                    s.suggestedServiceDate ?? "",
                  ),
                  amountThb: s.suggestedAmountThb ?? "",
                }
              : prev,
          );
          return;
        }
        await new Promise((r) => setTimeout(r, 2500));
      }
      if (!signal.aborted) {
        setMessage(
          "การอ่านข้อความจากรูปใช้เวลานาน — กรอกวันที่และยอดเองในช่องด้านล่างได้",
        );
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      console.error("[UploadForm.pollStagingOcr]", err);
      if (!signal.aborted) {
        setMessage("ไม่สามารถโหลดผลการอ่านข้อความอัตโนมัติ — กรอกข้อมูลเองได้");
      }
    }
  }, []);

  async function onSubmitUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      setBusy(true);
      setMessage(null);
      setOcrLoading(false);
      const form = e.currentTarget;
      const input = form.elements.namedItem("file") as HTMLInputElement | null;
      const file = input?.files?.[0];
      if (!file) {
        setMessage("กรุณาเลือกไฟล์");
        return;
      }

      if (shouldUploadBlobThenClientOcr()) {
        const fd = new FormData();
        fd.set("file", file);
        const up = await fetch("/api/documents/upload?mode=blob", {
          method: "POST",
          body: fd,
        });
        const blobData = (await up.json().catch(() => ({}))) as {
          blobUrl?: string;
          mimeType?: string;
          originalFilename?: string;
          fileSizeBytes?: number;
          error?: string;
        };
        if (!up.ok) {
          setMessage(blobData.error ?? "อัปโหลดรูปไม่สำเร็จ");
          return;
        }
        if (!blobData.blobUrl) {
          setMessage("ตอบกลับอัปโหลดไม่สมบูรณ์");
          return;
        }

        setOcrLoading(true);
        setMessage(
          "กำลังอ่านข้อความบนเครื่องคุณ (ครั้งแรกอาจโหลดโมเดล 30–90 วินาที)…",
        );

        let text = "";
        let lines: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }[] =
          [];
        try {
          const { runClientOcrOnFile } = await import("@/lib/client-ocr-browser");
          const o = await runClientOcrOnFile(file);
          text = o.text;
          lines = o.lines;
        } catch (ocrErr) {
          console.error("[UploadForm] client OCR", ocrErr);
          setMessage(
            "อ่านข้อความจากรูปบนเครื่องคุณไม่สำเร็จ — ลองรูปชัดขึ้น หรือใช้งานบน localhost",
          );
          return;
        } finally {
          setOcrLoading(false);
        }

        const stagingId = crypto.randomUUID();
        const reg = await fetch("/api/receipts/staging/register-parsed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stagingId,
            originalFilename: file.name || blobData.originalFilename || "upload.jpg",
            storedPath: blobData.blobUrl,
            mimeType: blobData.mimeType ?? file.type,
            fileSizeBytes: blobData.fileSizeBytes ?? file.size,
            ocrText: text,
            lines,
          }),
        });
        const data = (await reg.json().catch(() => ({}))) as {
          stagingId?: string;
          originalFilename?: string;
          ocrSucceeded?: boolean;
          ocrError?: string | null;
          suggestedServiceDate?: string | null;
          suggestedAmountThb?: string | null;
          error?: string;
        };
        if (!reg.ok) {
          setMessage(data.error ?? "บันทึกรายการชั่วคราวไม่สำเร็จ");
          return;
        }
        if (!data.stagingId) {
          setMessage("ตอบกลับจากเซิร์ฟเวอร์ไม่สมบูรณ์");
          return;
        }

        setPreview({
          stagingId: data.stagingId,
          originalFilename: data.originalFilename ?? file.name,
          ocrSucceeded: data.ocrSucceeded !== false,
          ocrError: data.ocrError ?? null,
          previewImageSrc: blobData.blobUrl,
          serviceDateThaiBe: ceIsoDateStringToThaiBeDdMmYyyy(
            data.suggestedServiceDate ?? "",
          ),
          amountThb: data.suggestedAmountThb ?? "",
          notes: "",
        });
        setMessage(null);
        form.reset();
        return;
      }

      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as {
        stagingId?: string;
        originalFilename?: string;
        ocrSucceeded?: boolean;
        ocrError?: string | null;
        suggestedServiceDate?: string | null;
        suggestedAmountThb?: string | null;
        ocrPending?: boolean;
        ocrAsyncHint?: string;
        error?: string;
      };
      if (!res.ok) {
        setMessage(data.error ?? "อัปโหลดไม่สำเร็จ");
        return;
      }
      if (!data.stagingId) {
        setMessage("ตอบกลับจากเซิร์ฟเวอร์ไม่สมบูรณ์");
        return;
      }

      pollAbortRef.current?.abort();
      pollAbortRef.current = new AbortController();
      const ac = pollAbortRef.current;

      if (data.ocrPending) {
        if (data.ocrAsyncHint) {
          setMessage(data.ocrAsyncHint);
        }
        setOcrLoading(true);
        setPreview({
          stagingId: data.stagingId,
          originalFilename: data.originalFilename ?? file.name,
          ocrSucceeded: false,
          ocrError: null,
          serviceDateThaiBe: "",
          amountThb: "",
          notes: "",
        });
        void pollStagingOcr(data.stagingId, ac.signal).finally(() => {
          try {
            setOcrLoading(false);
          } catch (e) {
            console.error("[UploadForm] poll finally", e);
          }
        });
      } else {
        setPreview({
          stagingId: data.stagingId,
          originalFilename: data.originalFilename ?? file.name,
          ocrSucceeded: data.ocrSucceeded !== false,
          ocrError: data.ocrError ?? null,
          serviceDateThaiBe: ceIsoDateStringToThaiBeDdMmYyyy(
            data.suggestedServiceDate ?? "",
          ),
          amountThb: data.suggestedAmountThb ?? "",
          notes: "",
        });
      }
      form.reset();
    } catch (err) {
      console.error("[UploadForm.onSubmitUpload]", err);
      setMessage("เกิดข้อผิดพลาด");
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    try {
      if (!preview) {
        return;
      }
      setBusy(true);
      setMessage(null);
      const serviceDateIso = parseReceiptDateFieldToCeIso(
        preview.serviceDateThaiBe,
      );
      if (!serviceDateIso) {
        setMessage("วันที่ไม่ถูกต้อง — ตัวอย่าง 10/05/2569 หรือ 10 พ.ค. 2569");
        setBusy(false);
        return;
      }
      const res = await fetch("/api/receipts/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stagingId: preview.stagingId,
          serviceDate: serviceDateIso,
          amountThb: preview.amountThb,
          notes: preview.notes || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        documentId?: string;
        error?: string;
      };
      if (!res.ok) {
        setMessage(data.error ?? "ยืนยันไม่สำเร็จ");
        return;
      }
      resetPreview();
      setMessage("บันทึกลงฐานข้อมูลแล้ว");
      router.refresh();
    } catch (err) {
      console.error("[UploadForm.onConfirm]", err);
      setMessage("เกิดข้อผิดพลาด");
    } finally {
      setBusy(false);
    }
  }

  async function onDiscard() {
    try {
      if (!preview) {
        return;
      }
      setBusy(true);
      setMessage(null);
      const res = await fetch("/api/receipts/discard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stagingId: preview.stagingId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMessage(data.error ?? "ยกเลิกไม่สำเร็จ");
        return;
      }
      resetPreview();
      setMessage("ยกเลิกรายการชั่วคราวแล้ว");
    } catch (err) {
      console.error("[UploadForm.onDiscard]", err);
      setMessage("เกิดข้อผิดพลาด");
    } finally {
      setBusy(false);
    }
  }

  if (preview) {
    return (
        <div className="flex max-w-xl flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              ตรวจสอบก่อนบันทึก
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {preview.originalFilename} — ตรวจวันที่กับยอดให้ตรงใบ แล้วกดยืนยัน
            </p>
          </div>

          {!preview.ocrSucceeded && preview.ocrError ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
              OCR ไม่สำเร็จ: {preview.ocrError} — กรอกมือได้
            </p>
          ) : null}

          {ocrLoading ? (
            <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100">
              กำลังอ่านข้อความจากรูป (อาจใช้เวลา 10–90 วินาที)… รอผลได้หรือกรอกวันที่กับยอดเองได้
            </p>
          ) : null}

          <div className="relative aspect-[4/3] w-full max-w-sm overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
            <Image
              src={
                preview.previewImageSrc ??
                `/api/receipts/staging/${preview.stagingId}/image`
              }
              alt="ตัวอย่างใบเสร็จ"
              fill
              className="object-contain"
              sizes="(max-width: 640px) 100vw, 384px"
              unoptimized
            />
          </div>

          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-800 dark:text-zinc-100">
            วันที่รักษา
            <input
              type="text"
              value={preview.serviceDateThaiBe}
              onChange={(e) =>
                setPreview((p) =>
                  p ? { ...p, serviceDateThaiBe: e.target.value } : p,
                )
              }
              onBlur={(e) => {
                try {
                  const v = e.target.value.trim();
                  if (!v) {
                    return;
                  }
                  const normalized = parseReceiptDateFieldToThaiBeDisplay(v);
                  if (normalized) {
                    setPreview((p) =>
                      p ? { ...p, serviceDateThaiBe: normalized } : p,
                    );
                  }
                } catch (err) {
                  console.error("[UploadForm] date field onBlur", err);
                }
              }}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
              disabled={busy}
              placeholder="10/05/2569 หรือ 10 พ.ค. 2569"
              autoComplete="off"
            />
            <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
              คลิกนอกช่องเพื่อจัดรูปแบบ
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-800 dark:text-zinc-100">
            จำนวนเงิน (บาท)
            <input
              type="text"
              inputMode="decimal"
              value={preview.amountThb}
              onChange={(e) =>
                setPreview((p) => (p ? { ...p, amountThb: e.target.value } : p))
              }
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
              disabled={busy}
              placeholder="1234.50"
            />
            <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
              ยอดเงินจากการสแกน — ถ้าไม่ตรงใบให้แก้มือ
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-800 dark:text-zinc-100">
            หมายเหตุ (ไม่บังคับ)
            <textarea
              value={preview.notes}
              onChange={(e) =>
                setPreview((p) => (p ? { ...p, notes: e.target.value } : p))
              }
              rows={2}
              className="resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
              disabled={busy}
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className="inline-flex h-11 items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "กำลังบันทึก…" : "ยืนยันและบันทึก"}
            </button>
            <button
              type="button"
              onClick={onDiscard}
              disabled={busy}
              className="inline-flex h-11 items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  resetPreview();
                  setMessage(null);
                } catch (err) {
                  console.error("[UploadForm] new upload click", err);
                }
              }}
              disabled={busy}
              className="text-sm font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
            >
              อัปโหลดใหม่
            </button>
          </div>

          {message ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
          ) : null}
        </div>
    );
  }

  return (
    <form
        onSubmit={onSubmitUpload}
        className="flex max-w-xl flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <label className="flex flex-col gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-100">
          เลือกรูปใบเสร็จ / เอกสาร
          <input
            name="file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="text-sm font-normal text-zinc-600 file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-800 dark:text-zinc-300 dark:file:bg-zinc-100 dark:file:text-zinc-900"
            disabled={busy}
            required
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-11 items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "กำลังอัปโหลดและอ่านข้อความ…" : "อัปโหลดและอ่านข้อความ"}
        </button>
        {shouldUploadBlobThenClientOcr() ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            บน Vercel รูปจะอัปโหลดเร็ว แล้วอ่านข้อความบนเครื่องคุณ (ไม่รันบน server) — ยืนยันครั้งเดียวค่อยบันทึก DB
          </p>
        ) : null}
        {message ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
        ) : null}
    </form>
  );
}
