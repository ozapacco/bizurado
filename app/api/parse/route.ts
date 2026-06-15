import { NextResponse } from "next/server";
import { importAllMaterials } from "@/lib/seed";

export async function POST() {
  try {
    const result = importAllMaterials();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
