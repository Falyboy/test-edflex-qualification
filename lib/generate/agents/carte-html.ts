export interface CarteNode {
  id: string
  num: string
  title: string
  icon: string
  color: string
  bg: string
  items: string[]
}

export interface CarteEdge {
  from: string
  to: string
  label: string
  color: string
  dashed: boolean
}

export interface CarteData {
  title: string
  subtitle: string
  center: { label: string; icon: string }
  nodes: CarteNode[]
  edges: CarteEdge[]
  tagline: string
}

const CARD_W = 222
const CENTER_W = 152
const CENTER_X = Math.floor((1120 - CENTER_W) / 2) // 484

// [left, top] per slot, by node count
const LAYOUTS: Record<number, { slots: [number, number][]; centerY: number; mapH: number }> = {
  0: { slots: [], centerY: 180, mapH: 380 },
  1: { slots: [[50, 180]], centerY: 200, mapH: 420 },
  2: { slots: [[50, 190], [848, 190]], centerY: 220, mapH: 450 },
  3: { slots: [[50, 50], [848, 50], [449, 440]], centerY: 270, mapH: 650 },
  4: { slots: [[50, 40], [848, 40], [50, 390], [848, 390]], centerY: 255, mapH: 610 },
  5: { slots: [[50, 30], [848, 30], [50, 250], [848, 250], [449, 460]], centerY: 210, mapH: 680 },
  6: { slots: [[50, 30], [848, 30], [20, 230], [878, 230], [50, 440], [848, 440]], centerY: 330, mapH: 660 },
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escJs(s: string): string {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

export function buildCarteHtml(data: CarteData): string {
  const n = Math.min(data.nodes.length, 6)
  const layout = LAYOUTS[n] ?? LAYOUTS[6]

  const cardsHtml = data.nodes.slice(0, 6).map((node, i) => {
    const [left, top] = layout.slots[i]
    const itemsHtml = node.items
      .map(item => `        <li>${esc(item)}</li>`)
      .join('\n')
    return `    <div class="card" id="${esc(node.id)}" style="--col:${esc(node.color)};--bg:${esc(node.bg)};left:${left}px;top:${top}px">
      <div class="card-top">
        <div class="card-ico">${esc(node.icon)}</div>
        <div>
          <span class="card-num">${esc(node.num)}</span>
          <span class="card-title">${esc(node.title)}</span>
        </div>
      </div>
      <ul>
${itemsHtml}
      </ul>
    </div>`
  }).join('\n')

  const edgesJs = data.edges.map(e => {
    const fid = e.from === 'center' ? 'ctr' : escJs(e.from)
    const tid = e.to === 'center' ? 'ctr' : escJs(e.to)
    return `      drawArrow('${fid}','${tid}','${escJs(e.label)}','${escJs(e.color)}',${e.dashed});`
  }).join('\n')

  const uniqueEdgeTypes = [...new Map(
    data.edges.map(e => [`${e.label}|${e.color}|${e.dashed}`, e])
  ).values()]

  const legendHtml = uniqueEdgeTypes.map(e => `
      <div class="leg">
        <div class="leg-arrow">
          <div class="leg-line${e.dashed ? ' dash' : ''}" style="--lc:${esc(e.color)}"></div>
          <div class="leg-arrow-head" style="--lc:${esc(e.color)}"></div>
        </div>
        <span class="leg-name" style="color:${esc(e.color)}">${esc(e.label)}</span>
      </div>`).join('')

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(data.title)} — Carte Conceptuelle</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f7f8fc; color: #1a1a2e; padding: 48px 40px 56px; }
    h1 { text-align: center; font-size: 26px; font-weight: 700; color: #1a1a2e; margin-bottom: 6px; }
    .sub { text-align: center; font-size: 13px; color: #888; margin-bottom: 48px; }
    .map { position: relative; width: 1120px; height: ${layout.mapH}px; margin: 0 auto; }
    svg.arr { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; overflow: visible; }
    .card { position: absolute; width: ${CARD_W}px; background: #fff; border: 2px solid var(--col); border-radius: 14px; padding: 14px 14px 16px; z-index: 2; box-shadow: 0 2px 12px rgba(0,0,0,.06); }
    .card-top { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    .card-ico { width: 42px; height: 42px; border-radius: 50%; background: var(--bg); display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0; }
    .card-num { display: block; font-size: 10px; font-weight: 700; color: var(--col); letter-spacing: .05em; margin-bottom: 2px; }
    .card-title { font-size: 13px; font-weight: 700; color: #1a1a2e; line-height: 1.3; display: block; }
    .card ul { list-style: none; border-top: 1px solid #eee; padding-top: 9px; }
    .card ul li { font-size: 12px; color: #555; padding: 2px 0 2px 14px; position: relative; line-height: 1.45; }
    .card ul li::before { content: '\\2022'; position: absolute; left: 0; color: var(--col); }
    .ctr { position: absolute; left: ${CENTER_X}px; top: ${layout.centerY}px; width: ${CENTER_W}px; background: #1e3d72; border-radius: 14px; padding: 20px 14px; text-align: center; z-index: 3; box-shadow: 0 4px 24px rgba(30,61,114,.25); }
    .ctr .ico { font-size: 32px; display: block; margin-bottom: 8px; }
    .ctr .lbl { font-size: 15px; font-weight: 700; color: #fff; line-height: 1.3; }
    .legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 32px; width: 1120px; margin: 28px auto 0; background: #fff; border: 1px solid #e4e4e4; border-radius: 10px; padding: 14px 24px; }
    .leg { display: flex; align-items: center; gap: 10px; font-size: 12px; }
    .leg-arrow { display: flex; align-items: center; }
    .leg-line { width: 36px; height: 2px; background: var(--lc); }
    .leg-line.dash { background: repeating-linear-gradient(90deg,var(--lc) 0,var(--lc) 5px,transparent 5px,transparent 10px); }
    .leg-arrow-head { width: 0; height: 0; border-top: 5px solid transparent; border-bottom: 5px solid transparent; border-left: 8px solid var(--lc); }
    .leg-name { font-weight: 700; }
    .tagline { text-align: center; margin-top: 20px; font-size: 13px; color: #888; font-style: italic; }
  </style>
</head>
<body>
  <h1>${esc(data.title)}</h1>
  <p class="sub">${esc(data.subtitle)}</p>
  <div class="map" id="map">
    <svg class="arr" id="svg"></svg>
${cardsHtml}
    <div class="ctr" id="ctr">
      <span class="ico">${esc(data.center.icon)}</span>
      <span class="lbl">${esc(data.center.label)}</span>
    </div>
  </div>
  <div class="legend">${legendHtml}</div>
  <p class="tagline">${esc(data.tagline)}</p>
  <script>
    const svg = document.getElementById('svg');
    const map = document.getElementById('map');
    function box(id) {
      const el = document.getElementById(id);
      const er = el.getBoundingClientRect();
      const mr = map.getBoundingClientRect();
      return { x: er.left - mr.left + er.width / 2, y: er.top - mr.top + er.height / 2, w: er.width, h: er.height };
    }
    function edgePt(b, tx, ty) {
      const dx = tx - b.x, dy = ty - b.y;
      if (!dx && !dy) return { x: b.x, y: b.y };
      const hw = b.w / 2 + 8, hh = b.h / 2 + 8;
      const sc = Math.min(Math.abs(hw / (dx || 1e9)), Math.abs(hh / (dy || 1e9)));
      return { x: b.x + dx * sc, y: b.y + dy * sc };
    }
    function ns(t) { return document.createElementNS('http://www.w3.org/2000/svg', t); }
    function drawArrow(fid, tid, label, color, dashed) {
      const f = box(fid), t = box(tid);
      const fp = edgePt(f, t.x, t.y), tp = edgePt(t, f.x, f.y);
      const mx = (fp.x + tp.x) / 2, my = (fp.y + tp.y) / 2;
      const off = 0.08;
      const cx = mx - (tp.y - fp.y) * off, cy = my + (tp.x - fp.x) * off;
      const p = ns('path');
      p.setAttribute('d', 'M' + fp.x + ',' + fp.y + ' Q' + cx + ',' + cy + ' ' + tp.x + ',' + tp.y);
      p.setAttribute('stroke', color); p.setAttribute('stroke-width', '1.8'); p.setAttribute('fill', 'none');
      if (dashed) p.setAttribute('stroke-dasharray', '7 4');
      svg.appendChild(p);
      const ang = Math.atan2(tp.y - cy, tp.x - cx), al = 9, aa = 0.38;
      const ah = ns('path');
      ah.setAttribute('d', 'M' + (tp.x + al * Math.cos(ang - aa)) + ',' + (tp.y + al * Math.sin(ang - aa)) + ' L' + tp.x + ',' + tp.y + ' L' + (tp.x + al * Math.cos(ang + aa)) + ',' + (tp.y + al * Math.sin(ang + aa)));
      ah.setAttribute('stroke', color); ah.setAttribute('stroke-width', '1.8'); ah.setAttribute('fill', 'none'); ah.setAttribute('stroke-linecap', 'round');
      svg.appendChild(ah);
      if (label) {
        const lx = (fp.x + tp.x) / 2 - (tp.y - fp.y) * off * 0.5;
        const ly = (fp.y + tp.y) / 2 + (tp.x - fp.x) * off * 0.5;
        const tw = label.length * 6.4 + 14;
        const bg = ns('rect');
        bg.setAttribute('x', lx - tw / 2); bg.setAttribute('y', ly - 9); bg.setAttribute('width', tw); bg.setAttribute('height', 17); bg.setAttribute('rx', '5'); bg.setAttribute('fill', '#f7f8fc'); bg.setAttribute('stroke', color); bg.setAttribute('stroke-width', '1');
        svg.appendChild(bg);
        const tx2 = ns('text');
        tx2.setAttribute('x', lx); tx2.setAttribute('y', ly + 3.5); tx2.setAttribute('text-anchor', 'middle'); tx2.setAttribute('fill', color); tx2.setAttribute('font-size', '10.5'); tx2.setAttribute('font-family', '-apple-system,sans-serif'); tx2.setAttribute('font-weight', '700'); tx2.textContent = label;
        svg.appendChild(tx2);
      }
    }
    window.addEventListener('load', function () {
${edgesJs}
    });
  </script>
</body>
</html>`
}

export function parseCarteJson(raw: string): CarteData | null {
  let json = raw.trim()

  // Extract from ```json ... ``` block if present
  const match = json.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (match) json = match[1].trim()

  // Try to find first { ... } if still not clean JSON
  if (!json.startsWith('{')) {
    const start = json.indexOf('{')
    if (start === -1) return null
    json = json.slice(start)
    const end = json.lastIndexOf('}')
    if (end === -1) return null
    json = json.slice(0, end + 1)
  }

  try {
    const parsed = JSON.parse(json) as Record<string, unknown>
    if (
      typeof parsed.title !== 'string' ||
      typeof parsed.subtitle !== 'string' ||
      !parsed.center ||
      !Array.isArray(parsed.nodes) ||
      !Array.isArray(parsed.edges)
    ) return null
    return parsed as unknown as CarteData
  } catch {
    return null
  }
}
