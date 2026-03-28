import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requirePremiumAccess } from "@/lib/billing/guard";

export async function GET(req: Request) {
  const gate = await requirePremiumAccess(req, { feature: "monthly export" });
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(req.url);
  const filename = searchParams.get("filename");

  if (!filename) {
    return NextResponse.json({ error: "filename is required" }, { status: 400 });
  }

  // Prevent path traversal
  if (filename.includes("/") || filename.includes("..") || filename.includes("\\")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const exportDir = path.join(process.cwd(), "data", "exports");
  const filePath = path.join(exportDir, filename);

  try {
    const content = await readFile(filePath);
    
    let contentType = "application/octet-stream";
    if (filename.endsWith(".csv")) contentType = "text/csv";
    else if (filename.endsWith(".json")) contentType = "application/json";
    else if (filename.endsWith(".md")) contentType = "text/markdown";

    return new Response(content, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    void err;
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
