"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { DocumentRowActions } from "@/app/components/DocumentRowActions";
import {
  ceIsoDateStringToThaiBeDdMmYyyy,
  parseReceiptDateFieldToCeIso,
  parseReceiptDateFieldToThaiBeDisplay,
} from "@/lib/date-thai-display";
import type { DocumentListItem } from "@/lib/documents-service";

function statusLabel(status: string): string {
  try {
    switch (status) {
      case "PROCESSED":
        return "แสกนสำเร็จ";
      case "FAILED":
        return "แสกนล้มเหลว";
      case "PROCESSING":
        return "กำลังประมวลผล";
      default:
        return status;
    }
  } catch (err) {
    console.error("[HomeDocumentsClient.statusLabel]", err);
    return status;
  }
}

function formatServiceDateThaiDisplay(isoYmd: string | null): string {
  try {
    if (!isoYmd) {
      return "—";
    }
    const out = ceIsoDateStringToThaiBeDdMmYyyy(isoYmd);
    return out || "—";
  } catch (err) {
    console.error("[HomeDocumentsClient.formatServiceDateThaiDisplay]", err);
    return "—";
  }
}

function statusClass(status: string): string {
  try {
    if (status === "PROCESSED") {
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200";
    }
    if (status === "FAILED") {
      return "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200";
    }
    return "bg-zinc-100 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200";
  } catch (err) {
    console.error("[HomeDocumentsClient.statusClass]", err);
    return "";
  }
}

export function HomeDocumentsClient({ items }: { items: DocumentListItem[] }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [editDocId, setEditDocId] = useState<string | null>(null);
  const [editFilename, setEditFilename] = useState("");
  const [serviceDateThaiBe, setServiceDateThaiBe] = useState("");
  const [amountThb, setAmountThb] = useState("");
  const [notesPreserve, setNotesPreserve] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [loadBusy, setLoadBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [editImageAvailable, setEditImageAvailable] = useState(false);

  const closeModal = useCallback(() => {
    try {
      setEditOpen(false);
      setEditDocId(null);
      setEditFilename("");
      setServiceDateThaiBe("");
      setAmountThb("");
      setNotesPreserve(null);
      setLoadError(null);
      setFormMessage(null);
      setLoadBusy(false);
      setEditImageAvailable(false);
    } catch (err) {
      console.error("[HomeDocumentsClient.closeModal]", err);
    }
  }, []);

  const openEdit = useCallback((id: string, filename: string, imageAvailable: boolean) => {
    try {
      setEditDocId(id);
      setEditFilename(filename);
      setEditImageAvailable(imageAvailable);
      setEditOpen(true);
      setLoadError(null);
      setFormMessage(null);
      setServiceDateThaiBe("");
      setAmountThb("");
      setNotesPreserve(null);
      setLoadBusy(true);
    } catch (err) {
      console.error("[HomeDocumentsClient.openEdit]", err);
    }
  }, []);

  useEffect(() => {
    if (!editOpen || !editDocId) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/documents/${editDocId}`);
        const data = (await res.json().catch(() => ({}))) as {
          document?: {
            serviceDateIso: string | null;
            amountThb: string | null;
            notes: string | null;
          };
          error?: string;
        };
        if (cancelled) {
          return;
        }
        if (!res.ok) {
          setLoadError(data.error ?? "โหลดไม่สำเร็จ");
          return;
        }
        const d = data.document;
        if (!d) {
          setLoadError("ไม่พบข้อมูล");
          return;
        }
        setServiceDateThaiBe(ceIsoDateStringToThaiBeDdMmYyyy(d.serviceDateIso ?? ""));
        setAmountThb(d.amountThb ?? "");
        setNotesPreserve(d.notes ?? null);
      } catch (err) {
        console.error("[HomeDocumentsClient load doc]", err);
        if (!cancelled) {
          setLoadError("เกิดข้อผิดพลาด");
        }
      } finally {
        if (!cancelled) {
          setLoadBusy(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editOpen, editDocId]);

  useEffect(() => {
    if (!editOpen) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      try {
        if (e.key === "Escape") {
          closeModal();
        }
      } catch (err) {
        console.error("[HomeDocumentsClient Escape]", err);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editOpen, closeModal]);

  const onSave = useCallback(async () => {
    try {
      if (!editDocId) {
        return;
      }
      setSaveBusy(true);
      setFormMessage(null);
      const serviceDateIso = parseReceiptDateFieldToCeIso(serviceDateThaiBe);
      if (!serviceDateIso) {
        setFormMessage("วันที่ไม่ถูกต้อง");
        return;
      }
      const res = await fetch(`/api/documents/${editDocId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceDate: serviceDateIso,
          amountThb,
          notes: notesPreserve,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setFormMessage(data.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      closeModal();
      router.refresh();
    } catch (err) {
      console.error("[HomeDocumentsClient.onSave]", err);
      setFormMessage("เกิดข้อผิดพลาด");
    } finally {
      setSaveBusy(false);
    }
  }, [amountThb, closeModal, editDocId, notesPreserve, router, serviceDateThaiBe]);

  return (
    <>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3">ภาพ</th>
              <th className="px-4 py-3">ไฟล์</th>
              <th className="px-4 py-3">สถานะไฟล์</th>
              <th className="px-4 py-3">วันที่รักษา</th>
              <th className="px-4 py-3">จำนวนเงิน</th>
              <th className="px-4 py-3">อัปโหลดเมื่อ</th>
              <th className="w-px whitespace-nowrap px-4 py-3 text-right normal-case">
                จัดการ
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {items.map((row) => (
              <tr key={row.id} className="align-middle">
                <td className="px-4 py-3">
                  <div className="relative h-14 w-14 overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
                    {row.imageAvailable ? (
                      <Image
                        src={`/api/documents/${row.id}/image`}
                        alt={row.originalFilename}
                        fill
                        className="object-cover"
                        sizes="56px"
                        unoptimized
                      />
                    ) : (
                      <span
                        className="flex h-full w-full items-center justify-center text-[10px] font-medium text-zinc-500 dark:text-zinc-400"
                        title="ไม่มีไฟล์รูปในระบบ"
                      >
                        ไม่มีรูป
                      </span>
                    )}
                  </div>
                </td>
                <td className="max-w-[200px] truncate px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                  {row.originalFilename}
                  {row.status === "FAILED" && row.ocrError ? (
                    <span
                      className="mt-1 block truncate text-xs font-normal text-red-600 dark:text-red-400"
                      title={row.ocrError}
                    >
                      {row.ocrError}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(row.status)}`}
                  >
                    {statusLabel(row.status)}
                  </span>
                </td>
                <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                  {formatServiceDateThaiDisplay(row.serviceDate)}
                </td>
                <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                  {row.amountThb != null ? `${row.amountThb} ${row.currency}` : "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-zinc-600 dark:text-zinc-400">
                  {new Date(row.createdAt).toLocaleString()}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <DocumentRowActions
                    documentId={row.id}
                    imageAvailable={row.imageAvailable}
                    onEditClick={() =>
                      openEdit(row.id, row.originalFilename, row.imageAvailable)
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onMouseDown={(e) => {
            try {
              if (e.target === e.currentTarget) {
                closeModal();
              }
            } catch (err) {
              console.error("[HomeDocumentsClient backdrop]", err);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-doc-title"
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 shadow-lg dark:border-zinc-700 dark:bg-zinc-950"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2
              id="edit-doc-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
            >
              แก้ไขข้อมูล
            </h2>
            <p className="mt-1 truncate text-sm text-zinc-600 dark:text-zinc-400" title={editFilename}>
              {editFilename}
            </p>

            {loadBusy ? (
              <p className="mt-4 text-sm text-zinc-500">กำลังโหลด…</p>
            ) : loadError ? (
              <p className="mt-4 text-sm text-red-600 dark:text-red-400">{loadError}</p>
            ) : (
              <div className="mt-4 flex flex-col gap-4">
                <label className="flex flex-col gap-1 text-sm font-medium text-zinc-800 dark:text-zinc-100">
                  วันที่รักษา
                  <input
                    type="text"
                    value={serviceDateThaiBe}
                    onChange={(e) => setServiceDateThaiBe(e.target.value)}
                    onBlur={(e) => {
                      try {
                        const v = e.target.value.trim();
                        if (!v) {
                          return;
                        }
                        const normalized = parseReceiptDateFieldToThaiBeDisplay(v);
                        if (normalized) {
                          setServiceDateThaiBe(normalized);
                        }
                      } catch (err) {
                        console.error("[HomeDocumentsClient] date onBlur", err);
                      }
                    }}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                    disabled={saveBusy || loadBusy}
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
                    value={amountThb}
                    onChange={(e) => setAmountThb(e.target.value)}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                    disabled={saveBusy || loadBusy}
                  />
                  <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
                    ยอดเงินจากการสแกน — ถ้าไม่ตรงใบให้แก้มือ
                  </span>
                </label>

                {formMessage ? (
                  <p className="text-sm text-red-600 dark:text-red-400">{formMessage}</p>
                ) : null}

                <div className="flex flex-wrap gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => void onSave()}
                    disabled={saveBusy || loadBusy}
                    className="inline-flex h-10 items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saveBusy ? "กำลังบันทึก…" : "บันทึก"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        closeModal();
                      } catch (err) {
                        console.error("[HomeDocumentsClient cancel]", err);
                      }
                    }}
                    disabled={saveBusy || loadBusy}
                    className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    ยกเลิก
                  </button>
                  {editImageAvailable ? (
                    <a
                      href={editDocId ? `/api/documents/${editDocId}/image` : "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-10 items-center justify-center text-sm font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
                    >
                      ดูรูป
                    </a>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
