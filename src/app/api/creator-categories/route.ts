import { NextResponse } from "next/server";
import { listCreatorCategories } from "@/lib/creatorCategoriesServer";

export const runtime = "nodejs";

export async function GET() {
  try {
    const categories = await listCreatorCategories();
    return NextResponse.json({ categories });
  } catch (error) {
    console.error("creator-categories GET:", error);
    return NextResponse.json({ error: "Failed to load creator categories" }, { status: 500 });
  }
}
