export async function generatePdfThumbnail(file: File): Promise<string | null> {
  try {
    const pdfjsLib = await import('pdfjs-dist')
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    const page = await pdf.getPage(1)
    const viewport = page.getViewport({ scale: 0.5 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    await page.render({ canvasContext: ctx as CanvasRenderingContext2D, viewport, canvas } as Parameters<typeof page.render>[0]).promise
    return canvas.toDataURL('image/jpeg', 0.8)
  } catch (err) {
    console.error('[pdf-thumbnail]', err)
    return null
  }
}
