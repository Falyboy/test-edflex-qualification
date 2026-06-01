import { NextRequest, NextResponse } from "next/server";

const NOTION_TOKEN = process.env.NOTION_TOKEN!;

export async function POST(req: NextRequest) {
  const { pageIds } = await req.json() as { pageIds: string[] };
  await Promise.all(
    pageIds.map((id: string) =>
      fetch(`https://api.notion.com/v1/pages/${id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${NOTION_TOKEN}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify({
          properties: { "PI Validation humaine": { checkbox: true } },
        }),
      })
    )
  );
  return NextResponse.json({ validated: pageIds.length });
}
