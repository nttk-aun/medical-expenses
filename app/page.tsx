import Image from "next/image";
import Link from "next/link";
import {
  listDocumentsWithExtractions,
  type DocumentListItem,
} from "@/lib/documents-service";

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
    console.error("[statusLabel]", err);
    return status;
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
    console.error("[statusClass]", err);
    return "";
  }
}

export default async function Home() {
  let items: DocumentListItem[] = [];
  let loadError: string | null = null;
  try {
    items = await listDocumentsWithExtractions();
  } catch (err) {
    console.error("[Home]", err);
    loadError =
      "โหลดข้อมูลไม่สำเร็จ — ตั้งค่า DATABASE_URL แล้วรัน npm run db:migrate (หรือ db:push)";
  }

  try {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Medical expenses
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              อัปโหลดรูป → OCR แนะนำวันที่/ยอด → คุณตรวจและกดยืนยัน → จึงเก็บใน Neon
              (ใบแต่ละโรงไม่เหมือนกัน — เก็บ snapshot การ parse ใน JSON ได้)
            </p>
          </div>
          <Link
            href="/upload"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            อัปโหลดเอกสาร
          </Link>
        </header>

        {loadError ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
            {loadError}
          </p>
        ) : null}

        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              รายการเอกสาร
            </h2>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-zinc-600 dark:text-zinc-400">
              ยังไม่มีเอกสาร — เริ่มจากปุ่ม &quot;อัปโหลดเอกสาร&quot;
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                  <tr>
                    <th className="px-4 py-3">ภาพ</th>
                    <th className="px-4 py-3">ไฟล์</th>
                    <th className="px-4 py-3">สถานะไฟล์</th>
                    <th className="px-4 py-3">วันที่ (ประมาณ)</th>
                    <th className="px-4 py-3">จำนวนเงิน</th>
                    <th className="px-4 py-3">อัปโหลดเมื่อ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {items.map((row) => (
                    <tr key={row.id} className="align-middle">
                      <td className="px-4 py-3">
                        <div className="relative h-14 w-14 overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
                          <Image
                            src={`/api/documents/${row.id}/image`}
                            alt={row.originalFilename}
                            fill
                            className="object-cover"
                            sizes="56px"
                            unoptimized
                          />
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
                        {row.serviceDate ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                        {row.amountThb != null
                          ? `${row.amountThb} ${row.currency}`
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {new Date(row.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    );
  } catch (err) {
    console.error("[Home] render", err);
    throw err;
  }
}
