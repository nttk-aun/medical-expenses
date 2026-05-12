import Link from "next/link";
import { UploadForm } from "@/app/components/UploadForm";

export default function UploadPage() {
  try {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
        <div>
          <Link
            href="/"
            className="text-sm font-medium text-emerald-700 hover:text-emerald-600 dark:text-emerald-400"
          >
            ← กลับหน้ารายการ
          </Link>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            อัปโหลดใบเสร็จ
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            ระบบจะอ่านข้อความด้วย Tesseract (tha+eng) แล้วให้คุณตรวจสอบวันที่กับยอดเงินก่อนกดยืนยัน
            — จึงจะบันทึกลง PostgreSQL
          </p>
        </div>
        <UploadForm />
      </div>
    );
  } catch (err) {
    console.error("[UploadPage]", err);
    throw err;
  }
}
