"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

function IconPencil({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className ?? "h-4 w-4"}
      aria-hidden
    >
      <path d="M2.695 14.153l1.869-1.869 8.562-8.562a2.53 2.53 0 114.12 2.864l-8.562 8.562-1.87 1.869a.75.75 0 01-1.092-.274l-.548-1.745a.75.75 0 01.274-.92z" />
    </svg>
  );
}

function IconPhoto({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className ?? "h-4 w-4"}
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm3 2a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM4 15l3.5-4.5 2.5 3.01L14.5 8 16 9.5V15H4z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function IconTrash({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className ?? "h-4 w-4"}
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M8 2a1 1 0 011-1h2a1 1 0 011 1v1h4a1 1 0 110 2h-1v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5H4a1 1 0 110-2h4V2zM7 5v11h6V5H7zm2 2a1 1 0 012 0v6a1 1 0 11-2 0V7zm3 0a1 1 0 012 0v6a1 1 0 11-2 0V7z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function DocumentRowActions({
  documentId,
  imageAvailable = true,
  onEditClick,
}: {
  documentId: string;
  /** false = ไม่มีไฟล์รูปในระบบ (flow ไม่เก็บรูป) */
  imageAvailable?: boolean;
  onEditClick: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onDelete = useCallback(async () => {
    try {
      if (busy) {
        return;
      }
      if (!window.confirm("ลบรายการนี้ออกจากระบบ?")) {
        return;
      }
      setBusy(true);
      const res = await fetch(`/api/documents/${documentId}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        window.alert(data.error ?? "ลบไม่สำเร็จ");
        return;
      }
      router.refresh();
    } catch (err) {
      console.error("[DocumentRowActions.onDelete]", err);
      window.alert("เกิดข้อผิดพลาด");
    } finally {
      setBusy(false);
    }
  }, [busy, documentId, router]);

  const imageHref = `/api/documents/${documentId}/image`;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="แก้ไข"
        title="แก้ไข"
        onClick={() => {
          try {
            onEditClick();
          } catch (err) {
            console.error("[DocumentRowActions onEditClick]", err);
          }
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      >
        <IconPencil />
      </button>
      {imageAvailable ? (
        <a
          href={imageHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="ดูรูป"
          title="ดูรูป"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          <IconPhoto />
        </a>
      ) : null}
      <button
        type="button"
        aria-label="ลบ"
        title="ลบ"
        disabled={busy}
        onClick={() => {
          void onDelete();
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-red-600 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/50 dark:hover:text-red-300"
      >
        <IconTrash />
      </button>
    </div>
  );
}
