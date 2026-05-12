import Link from "next/link";
import { HomeDocumentsClient } from "@/app/components/HomeDocumentsClient";
import {
  listDocumentsWithExtractions,
  type DocumentListItem,
} from "@/lib/documents-service";

export default async function Home() {
  let items: DocumentListItem[] = [];
  let loadError: string | null = null;
  try {
    items = await listDocumentsWithExtractions();
  } catch (err) {
    console.error("[Home]", err);
    loadError = "โหลดข้อมูลไม่สำเร็จ — ตรวจสอบการเชื่อมต่อฐานข้อมูล";
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
              อัปโหลดรูปใบเสร็จ ตรวจวันที่กับยอดเงิน แล้วกดยืนยันเพื่อบันทึก
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
            <HomeDocumentsClient items={items} />
          )}
        </section>
      </div>
    );
  } catch (err) {
    console.error("[Home] render", err);
    throw err;
  }
}
