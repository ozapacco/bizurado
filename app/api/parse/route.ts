import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Importing material reads the .txt files from disk, which only exists in the
// local working tree — not in the Vercel serverless filesystem. So importing is
// now a LOCAL task: run `npm run seed` (it reads the files and writes to the
// Neon DB in DATABASE_URL). This endpoint stays only to give the old
// "Reimportar" button a clear, non-misleading response in production.
export async function POST() {
  return NextResponse.json(
    {
      error: "import-is-local",
      message:
        "A importação agora roda localmente: execute `npm run seed` apontando para o banco (DATABASE_URL). O servidor na nuvem não tem acesso aos arquivos .txt.",
    },
    { status: 501 }
  );
}
