// ============================================
// Browser-side conversion library
// Handles: PDF→JPG, PDF→PNG, PDF→TXT
//          JPG→PDF, PNG→PDF, TXT→PDF
//          TXT→DOCX (simple in-browser)
//          (Full PDF→DOCX uses the backend)
// ============================================

import * as pdfjsLib from 'pdfjs-dist'
import { jsPDF } from 'jspdf'
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'

// Worker setup — fire and forget. If it fails (e.g. sandboxed iframe),
// PDF conversions will gracefully fall back to running on the main thread.
// We DON'T await this, so it never blocks the app from mounting.
function setupPdfWorker() {
  try {
    const workerUrl = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    )
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl.toString()
  } catch (e) {
    // If even constructing the URL fails, leave workerSrc unset —
    // pdf.js will run on the main thread (slower but still works)
  }
}

setupPdfWorker()

// ---------- PDF → Images (JPG / PNG / WebP / BMP) ----------
export async function pdfToImages(file, format, quality, onProgress) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const results = []

  // Map format to canvas-supported MIME type. BMP and GIF go via PNG.
  const fmt = format.toLowerCase()
  let mime
  if (fmt === 'jpg' || fmt === 'jpeg') mime = 'image/jpeg'
  else if (fmt === 'png') mime = 'image/png'
  else if (fmt === 'webp') mime = 'image/webp'
  else if (fmt === 'bmp') mime = 'image/bmp'
  else if (fmt === 'gif') mime = 'image/gif'
  else throw new Error(`Unsupported image format: ${format}`)

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 2.0 }) // 2x for crispness

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    canvas.width = viewport.width
    canvas.height = viewport.height

    // White background for JPG (no alpha)
    if (fmt === 'jpg' || fmt === 'jpeg' || fmt === 'bmp') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    await page.render({ canvasContext: ctx, viewport }).promise

    const dataUrl = canvas.toDataURL(mime, quality)
    const baseName = file.name.replace(/\.pdf$/i, '')
    const ext = fmt === 'jpeg' ? 'jpg' : fmt

    results.push({
      dataUrl,
      blob: dataURLtoBlob(dataUrl),
      page: i,
      name: `${baseName}_page_${i}.${ext}`
    })

    onProgress?.(i / pdf.numPages)
  }

  return results
}

// ---------- Image → Image (convert between any image formats) ----------
// Converts JPG/PNG/WebP/BMP/GIF/TIFF input to any of the supported output formats
export async function imageToImage(files, targetFormat, quality, onProgress) {
  const fmt = targetFormat.toLowerCase()
  let mime
  if (fmt === 'jpg' || fmt === 'jpeg') mime = 'image/jpeg'
  else if (fmt === 'png') mime = 'image/png'
  else if (fmt === 'webp') mime = 'image/webp'
  else if (fmt === 'bmp') mime = 'image/bmp'
  else if (fmt === 'gif') mime = 'image/gif'
  else throw new Error(`Unsupported image format: ${targetFormat}`)

  const results = []
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const img = await loadImage(file)
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth || img.width
    canvas.height = img.naturalHeight || img.height
    const ctx = canvas.getContext('2d')
    // White background for formats without alpha
    if (fmt === 'jpg' || fmt === 'jpeg' || fmt === 'bmp') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    ctx.drawImage(img, 0, 0)
    const dataUrl = canvas.toDataURL(mime, quality)
    const ext = fmt === 'jpeg' ? 'jpg' : fmt
    const baseName = file.name.replace(/\.[^.]+$/i, '')
    results.push({
      dataUrl,
      blob: dataURLtoBlob(dataUrl),
      name: `${baseName}.${ext}`
    })
    onProgress?.((i + 1) / files.length)
  }
  return results
}

// ---------- PDF → TXT ----------
export async function pdfToText(file, onProgress) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  let fullText = ''

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items.map(item => item.str).join(' ')
    fullText += pageText + '\n\n'
    onProgress?.(i / pdf.numPages)
  }

  const blob = new Blob([fullText], { type: 'text/plain' })
  return [{ blob, name: file.name.replace(/\.pdf$/i, '') + '.txt' }]
}

// ---------- Images → PDF ----------
export async function imagesToPdf(files, onProgress) {
  if (files.length === 0) throw new Error('No images provided')

  const firstImg = await loadImage(files[0])
  const pdf = new jsPDF({
    orientation: firstImg.width > firstImg.height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [firstImg.width, firstImg.height]
  })

  for (let i = 0; i < files.length; i++) {
    const img = await loadImage(files[i])
    if (i > 0) pdf.addPage([img.width, img.height], img.width > img.height ? 'landscape' : 'portrait')
    pdf.addImage(img, 'JPEG', 0, 0, img.width, img.height)
    onProgress?.((i + 1) / files.length)
  }

  const blob = pdf.output('blob')
  return [{ blob, name: 'converted.pdf' }]
}

// ---------- Text → PDF ----------
export async function textToPdf(file, onProgress) {
  const text = await file.text()
  onProgress?.(0.3)

  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 40
  const lineHeight = 16
  const maxWidth = pageWidth - margin * 2

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(11)

  const lines = pdf.splitTextToSize(text, maxWidth)
  let y = margin

  for (let i = 0; i < lines.length; i++) {
    if (y + lineHeight > pageHeight - margin) {
      pdf.addPage()
      y = margin
    }
    pdf.text(lines[i], margin, y)
    y += lineHeight
    if (i % 100 === 0) onProgress?.(0.3 + (0.7 * i) / lines.length)
  }

  const blob = pdf.output('blob')
  onProgress?.(1)
  return [{ blob, name: file.name.replace(/\.(txt|md)$/i, '') + '.pdf' }]
}

// ---------- TXT → Word (real .docx) ----------
export async function textToWord(file) {
  const text = await file.text()
  const lines = text.split(/\r?\n/)

  const children = []
  // Title
  children.push(new Paragraph({
    text: file.name.replace(/\.(txt|md)$/i, ''),
    heading: HeadingLevel.HEADING_1,
    spacing: { after: 300 }
  }))

  // Body — each non-empty line becomes a paragraph
  for (const line of lines) {
    if (line.trim() === '') {
      children.push(new Paragraph({ text: '' }))
    } else {
      children.push(new Paragraph({
        children: [new TextRun({ text: line, size: 22 })]
      }))
    }
  }

  const doc = new Document({
    creator: 'PDF Converter',
    title: file.name,
    sections: [{ children }]
  })

  const buffer = await Packer.toBuffer(doc)
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  })
  return [{ blob, name: file.name.replace(/\.(txt|md)$/i, '') + '.docx' }]
}

// ---------- PDF → Word (in-browser fallback) ----------
// Same as the backend version, but runs entirely on-device using the same
// pdfjs instance and the docx library. Slower than the backend for large
// PDFs but works offline and in restricted environments.
export async function pdfToWordLocal(file, onProgress) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const children = []
  children.push(new Paragraph({
    text: file.name.replace(/\.pdf$/i, ''),
    heading: HeadingLevel.HEADING_1,
    spacing: { after: 300 }
  }))

  let totalChars = 0
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items.map(item => item.str).join(' ')
    const lines = text.split(/\s{2,}|\n/).map(l => l.trim()).filter(Boolean)
    for (const line of lines) {
      children.push(new Paragraph({
        children: [new TextRun({ text: line, size: 22 })]
      }))
      totalChars += line.length
    }
    if (i < pdf.numPages) {
      children.push(new Paragraph({ children: [new TextRun({ text: '', break: 1 })], pageBreakBefore: true }))
    }
    onProgress?.(i / pdf.numPages)
  }

  if (totalChars === 0) {
    children.push(new Paragraph({
      children: [new TextRun({
        text: '(This PDF appears to contain no extractable text — it may be image-based.)',
        italics: true
      })]
    }))
  }

  const doc = new Document({
    creator: 'PDF Converter',
    title: file.name,
    sections: [{ children }]
  })

  const buffer = await Packer.toBuffer(doc)
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  })
  return [{ blob, name: file.name.replace(/\.pdf$/i, '') + '.docx' }]
}

// ---------- Text → HTML ----------
// Wraps plain/markdown text in a basic HTML document
export async function textToHtml(file) {
  const text = await file.text()
  // Escape HTML, then convert basic markdown
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const lines = text.split(/\r?\n/)
  const body = lines.map(line => {
    const t = esc(line)
    if (/^#{1,6}\s/.test(line)) {
      const level = line.match(/^#+/)[0].length
      return `<h${level}>${t.replace(/^#+\s/, '')}</h${level}>`
    }
    if (line.trim() === '') return '<br/>'
    return `<p>${t}</p>`
  }).join('\n')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(file.name)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #222; }
  h1, h2, h3 { color: #7c3aed; }
  pre { background: #f4f4f4; padding: 12px; border-radius: 6px; overflow-x: auto; }
</style>
</head>
<body>
${body}
</body>
</html>`
  const blob = new Blob([html], { type: 'text/html' })
  return [{ blob, name: file.name.replace(/\.(txt|md)$/i, '') + '.html' }]
}

// ---------- Text → RTF ----------
// Minimal Rich Text Format output
export async function textToRtf(file) {
  const text = await file.text()
  // RTF-escape special chars
  const esc = text
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\n/g, '\\par\n')
  const rtf = `{\\rtf1\\ansi\\ansicpg1252\\deff0
{\\fonttbl{\\f0 Arial;}}
{\\colortbl;\\red124\\green58\\blue237;}
\\viewkind4\\uc1\\pard\\cf1\\fs28 ${esc}\\cf0\\fs22
}`
  const blob = new Blob([rtf], { type: 'application/rtf' })
  return [{ blob, name: file.name.replace(/\.(txt|md)$/i, '') + '.rtf' }]
}

// ---------- Text → CSV (single-column table) ----------
// For multi-column CSVs, use spreadsheetToCsv
export async function textToCsv(file) {
  const text = await file.text()
  const lines = text.split(/\r?\n/).filter(l => l.length > 0)
  const csv = lines.map(line => {
    // Escape quotes/commas
    const v = line.includes(',') || line.includes('"') ? `"${line.replace(/"/g, '""')}"` : line
    return `Line,${v}`
  }).join('\n')
  const header = 'Column,Content\n'
  const blob = new Blob([header + csv], { type: 'text/csv' })
  return [{ blob, name: file.name.replace(/\.(txt|md)$/i, '') + '.csv' }]
}

// ---------- Spreadsheet → CSV ----------
// For .xlsx/.xls/.ods — extracts cells as best we can from the underlying XML
// (For real xlsx parsing we'd need SheetJS; this is a lightweight fallback.)
export async function spreadsheetToText(file) {
  const text = await file.text()
  // Excel files are zipped XML — extract any readable strings
  const matches = text.match(/<t[^>]*>([^<]+)<\/t>/g) || []
  const values = matches.map(m => m.replace(/<[^>]+>/g, '')).filter(v => v.trim())
  const blob = new Blob([values.join('\n')], { type: 'text/plain' })
  return [{ blob, name: file.name.replace(/\.(xlsx|xls|ods)$/i, '') + '.txt' }]
}

// ---------- JSON → TXT (pretty-print) ----------
export async function jsonToText(file) {
  const text = await file.text()
  let data
  try { data = JSON.parse(text) } catch (e) { throw new Error('Invalid JSON') }
  const pretty = JSON.stringify(data, null, 2)
  const blob = new Blob([pretty], { type: 'text/plain' })
  return [{ blob, name: file.name.replace(/\.json$/i, '') + '.txt' }]
}

// ---------- Spreadsheet → PDF ----------
// Lightweight: try to extract rows from XML, render as a basic PDF table
export async function spreadsheetToPdf(file, onProgress) {
  const text = await file.text()
  const matches = text.match(/<t[^>]*>([^<]+)<\/t>/g) || []
  const values = matches.map(m => m.replace(/<[^>]+>/g, '')).filter(v => v.trim())
  onProgress?.(0.3)

  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const margin = 40
  let y = margin + 10
  pdf.setFontSize(14)
  pdf.text(file.name, margin, y)
  y += 30
  pdf.setFontSize(10)
  for (let i = 0; i < values.length; i++) {
    if (y > 800) { pdf.addPage(); y = margin }
    pdf.text(values[i].slice(0, 80), margin, y)
    y += 16
    if (i % 50 === 0) onProgress?.(0.3 + (0.7 * i) / Math.max(values.length, 1))
  }
  onProgress?.(1)
  const blob = pdf.output('blob')
  return [{ blob, name: file.name.replace(/\.(xlsx|xls|ods)$/i, '') + '.pdf' }]
}

// ---------- Image → Image with format hints ----------
// (already implemented above as imageToImage — keeping import compatibility)

// ---------- Build CSV from data ----------
export async function jsonToCsv(file) {
  const text = await file.text()
  let data
  try { data = JSON.parse(text) } catch (e) { throw new Error('Invalid JSON: ' + e.message) }
  let rows = []
  if (Array.isArray(data)) {
    rows = data
  } else if (typeof data === 'object' && data !== null) {
    rows = [data]
  } else {
    throw new Error('JSON must be an array or object')
  }
  if (rows.length === 0) throw new Error('JSON is empty')

  // Collect all unique keys
  const keys = new Set()
  for (const r of rows) {
    if (typeof r === 'object' && r !== null) Object.keys(r).forEach(k => keys.add(k))
  }
  const headers = [...keys]
  const esc = v => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => esc(typeof r === 'object' && r !== null ? r[h] : r)).join(','))
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  return [{ blob, name: file.name.replace(/\.json$/i, '') + '.csv' }]
}

// ---------- CSV → JSON ----------
// Lightweight CSV parser (handles quoted values, escaped quotes, CRLF)
function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') { inQuotes = false }
      else { field += c }
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else if (c === '\r') { /* skip */ }
      else { field += c }
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  if (rows.length === 0) return []
  const headers = rows[0]
  return rows.slice(1).filter(r => r.length > 0).map(r => {
    const obj = {}
    headers.forEach((h, i) => { obj[h] = r[i] ?? '' })
    return obj
  })
}

export async function csvToJson(file) {
  const text = await file.text()
  const rows = parseCsv(text)
  const json = JSON.stringify(rows, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  return [{ blob, name: file.name.replace(/\.csv$/i, '') + '.json' }]
}

// ---------- CSV → PDF ----------
export async function csvToPdf(file, onProgress) {
  const text = await file.text()
  const rows = parseCsv(text)
  onProgress?.(0.2)

  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const margin = 40
  const rowH = 16
  const colWidth = (pdf.internal.pageSize.getWidth() - margin * 2) / Math.max(rows[0]?.length || 1, 1)
  const pageH = pdf.internal.pageSize.getHeight()
  let y = margin + 10

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(11)
  if (rows[0]) {
    rows[0].forEach((cell, i) => pdf.text(String(cell).slice(0, 30), margin + i * colWidth, y))
    y += rowH
  }
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.line(margin, y - 3, pdf.internal.pageSize.getWidth() - margin, y - 3)

  for (let r = 1; r < rows.length; r++) {
    if (y > pageH - margin) { pdf.addPage(); y = margin }
    rows[r].forEach((cell, i) => pdf.text(String(cell).slice(0, 40), margin + i * colWidth, y))
    y += rowH
    if (r % 50 === 0) onProgress?.(0.2 + (0.8 * r) / rows.length)
  }
  onProgress?.(1)
  const blob = pdf.output('blob')
  return [{ blob, name: file.name.replace(/\.csv$/i, '') + '.pdf' }]
}

// ---------- HTML → PDF ----------
// Strips HTML and renders as plain text PDF (for safety, we don't eval scripts)
export async function htmlToPdf(file, onProgress) {
  const raw = await file.text()
  // Strip tags
  const text = raw
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim()
  onProgress?.(0.3)
  const fakeFile = new File([text], file.name.replace(/\.html?$/i, '') + '.txt', { type: 'text/plain' })
  const out = await textToPdf(fakeFile, onProgress)
  return out.map(o => ({ ...o, name: file.name.replace(/\.html?$/i, '') + '.pdf' }))
}

// ============================================
// Helpers
// ============================================

function dataURLtoBlob(dataUrl) {
  const [head, body] = dataUrl.split(',')
  const mime = head.match(/:(.*?);/)[1]
  const bin = atob(body)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

// File-type detection
export function detectKind(file) {
  const n = file.name.toLowerCase()
  if (n.endsWith('.pdf')) return 'pdf'
  if (/\.(jpe?g|png|webp|bmp|gif|tiff?)$/.test(n)) return 'image'
  if (/\.(xlsx?|ods)$/.test(n)) return 'spreadsheet'
  if (/\.(pptx?)$/.test(n)) return 'presentation'
  if (n.endsWith('.json')) return 'json'
  if (n.endsWith('.csv')) return 'csv'
  if (n.endsWith('.html') || n.endsWith('.htm')) return 'html'
  if (n.endsWith('.rtf')) return 'rtf'
  if (n.endsWith('.txt') || n.endsWith('.md')) return 'text'
  if (/\.(docx?)$/.test(n)) return 'word'
  return 'unknown'
}
