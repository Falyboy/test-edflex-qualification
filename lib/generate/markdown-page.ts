import { marked } from 'marked'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Rend un livrable markdown en page HTML autonome, stylée et lisible.
export function renderMarkdownPage(markdown: string, title: string): string {
  const body = marked.parse(markdown ?? '', { async: false, gfm: true, breaks: true }) as string
  const safeTitle = escapeHtml(title || 'Livrable')

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif;
    background: #f7f8fc;
    color: #1a1a2e;
    line-height: 1.65;
    margin: 0;
    padding: 48px 24px 80px;
  }
  .doc {
    max-width: 760px;
    margin: 0 auto;
    background: #fff;
    border: 1px solid #e6e8f0;
    border-radius: 16px;
    padding: 48px 56px;
    box-shadow: 0 2px 24px rgba(0,0,0,.05);
  }
  .doc h1 { font-size: 28px; font-weight: 800; margin: 0 0 20px; line-height: 1.25; }
  .doc h2 { font-size: 21px; font-weight: 700; margin: 32px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #eef0f6; }
  .doc h3 { font-size: 17px; font-weight: 700; margin: 24px 0 8px; color: #2d2d4a; }
  .doc p { margin: 0 0 14px; }
  .doc ul, .doc ol { margin: 0 0 16px; padding-left: 24px; }
  .doc li { margin: 4px 0; }
  .doc strong { font-weight: 700; color: #14142b; }
  .doc a { color: #4338ca; text-decoration: underline; text-underline-offset: 2px; }
  .doc code { background: #f1f2f8; padding: 2px 6px; border-radius: 5px; font-size: 13px; font-family: ui-monospace, monospace; }
  .doc pre { background: #1a1a2e; color: #e8e8f5; padding: 16px 18px; border-radius: 10px; overflow-x: auto; font-size: 13px; }
  .doc pre code { background: none; padding: 0; color: inherit; }
  .doc blockquote { border-left: 3px solid #cbd0e0; margin: 16px 0; padding: 4px 0 4px 16px; color: #5a5a78; font-style: italic; }
  .doc table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
  .doc th, .doc td { border: 1px solid #e6e8f0; padding: 8px 12px; text-align: left; }
  .doc th { background: #f4f5fb; font-weight: 700; }
  .doc hr { border: none; border-top: 1px solid #eef0f6; margin: 28px 0; }
  .doc img { max-width: 100%; border-radius: 8px; }
</style>
</head>
<body>
  <article class="doc">
${body}
  </article>
</body>
</html>`
}
