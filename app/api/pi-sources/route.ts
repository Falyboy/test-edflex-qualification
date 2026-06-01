import { NextResponse } from "next/server";
import { auth } from "@/auth";

const NOTION_TOKEN = process.env.NOTION_TOKEN!;
const SOURCES_DB_ID = process.env.NOTION_SOURCES_DB_ID!;

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ sources: [] });
  const res = await fetch(`https://api.notion.com/v1/databases/${SOURCES_DB_ID}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    },
    body: JSON.stringify({
      filter: {
        and: [
          { property: "PI Verdict auto", select: { does_not_equal: "safe" } },
          { property: "PI Validation humaine", checkbox: { equals: false } },
        ],
      },
    }),
  });
  const data = await res.json();
  const sources = (data.results ?? []).map((page: Record<string, unknown>) => {
    const props = page.properties as Record<string, Record<string, unknown>>;
    return {
      id: page.id,
      name: (props["Name"]?.title as Array<{ plain_text: string }>)?.[0]?.plain_text ?? "Source inconnue",
      verdict: (props["PI Verdict auto"]?.select as { name: string } | null)?.name ?? "unknown",
      warning: (props["PI Avertissement"]?.rich_text as Array<{ plain_text: string }>)?.[0]?.plain_text ?? "",
      deadline: (props["PI Deadline"]?.date as { start: string } | null)?.start ?? null,
    };
  });
  return NextResponse.json({ sources });
}
