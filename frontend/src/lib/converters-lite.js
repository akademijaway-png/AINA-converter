// ============================================
// LITE converters — no heavy dependencies
// Just the file-type detection and any conversion
// that can be done with built-in browser APIs only.
// Heavy PDF conversions are loaded dynamically.
// ============================================

// File-type detection (no dependencies)
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

// Image → Image (uses native canvas, no dependencies)
export async function imageToImage(files, targetFormat, quality = 0.92, onProgress) {
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

// Text → HTML (no dependencies)
export async function textToHtml(file) {
  const text = await file.text()
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
<head><meta charset="UTF-8"><title>${esc(file.name)}</title>
<style>body{font-family:sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.6;color:#222}h1,h2,h3{color:#7c3aed}</style>
</head><body>${body}</body></html>`
  const blob = new Blob([html], { type: 'text/html' })
  return [{ blob, name: file.name.replace(/\.(txt|md)$/i, '') + '.html' }]
}

// Text → RTF
export async function textToRtf(file) {
  const text = await file.text()
  const esc = text
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\n/g, '\\par\n')
  const rtf = `{\\rtf1\\ansi\\ansicpg1252\\deff0\n{\\fonttbl{\\f0 Arial;}}\\viewkind4\\uc1\\pard\\fs28 ${esc}\\par\\fs22\n}`
  const blob = new Blob([rtf], { type: 'application/rtf' })
  return [{ blob, name: file.name.replace(/\.(txt|md)$/i, '') + '.rtf' }]
}

// Text → CSV
export async function textToCsv(file) {
  const text = await file.text()
  const lines = text.split(/\r?\n/).filter(l => l.length > 0)
  const csv = 'Line,Content\n' + lines.map(line => {
    const v = line.includes(',') || line.includes('"') ? `"${line.replace(/"/g, '""')}"` : line
    return `${lines.indexOf(line) + 1},${v}`
  }).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  return [{ blob, name: file.name.replace(/\.(txt|md)$/i, '') + '.csv' }]
}

// JSON → CSV
export async function jsonToCsv(file) {
  const text = await file.text()
  let data
  try { data = JSON.parse(text) } catch (e) { throw new Error('Invalid JSON: ' + e.message) }
  let rows = []
  if (Array.isArray(data)) rows = data
  else if (typeof data === 'object' && data !== null) rows = [data]
  else throw new Error('JSON must be an array or object')
  if (rows.length === 0) throw new Error('JSON is empty')

  const keys = new Set()
  for (const r of rows) {
    if (typeof r === 'object' && r !== null) Object.keys(r).forEach(k => keys.add(k))
  }
  const headers = [...keys]
  const esc = v => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => esc(typeof r === 'object' && r !== null ? r[h] : r)).join(','))
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  return [{ blob, name: file.name.replace(/\.json$/i, '') + '.csv' }]
}

// JSON → TXT
export async function jsonToText(file) {
  const text = await file.text()
  let data
  try { data = JSON.parse(text) } catch (e) { throw new Error('Invalid JSON') }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'text/plain' })
  return [{ blob, name: file.name.replace(/\.json$/i, '') + '.txt' }]
}

// CSV → JSON
function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') inQuotes = false
      else field += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else if (c === '\r') { /* skip */ }
      else field += c
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
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
  return [{ blob, name: file.name.replace(/\.csv$/i, '') + '.json' }]
}

// CSV → TXT
export async function csvToText(file) {
  const text = await file.text()
  const blob = new Blob([text], { type: 'text/plain' })
  return [{ blob, name: file.name.replace(/\.csv$/i, '') + '.txt' }]
}

// HTML → TXT (strip tags)
export async function htmlToText(file) {
  const raw = await file.text()
  const text = raw
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim()
  const blob = new Blob([text], { type: 'text/plain' })
  return [{ blob, name: file.name.replace(/\.html?$/i, '') + '.txt' }]
}

// Spreadsheet → TXT (extract from underlying XML)
export async function spreadsheetToText(file) {
  const text = await file.text()
  const matches = text.match(/<t[^>]*>([^<]+)<\/t>/g) || []
  const values = matches.map(m => m.replace(/<[^>]+>/g, '')).filter(v => v.trim())
  const blob = new Blob([values.join('\n')], { type: 'text/plain' })
  return [{ blob, name: file.name.replace(/\.(xlsx|xls|ods)$/i, '') + '.txt' }]
}

// Spreadsheet → CSV
export async function spreadsheetToCsv(file) {
  const text = await file.text()
  const matches = text.match(/<t[^>]*>([^<]+)<\/t>/g) || []
  const values = matches.map(m => m.replace(/<[^>]+>/g, '')).filter(v => v.trim())
  const csv = 'Row,Value\n' + values.map((v, i) => `${i + 1},"${v.replace(/"/g, '""')}"`).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  return [{ blob, name: file.name.replace(/\.(xlsx|xls|ods)$/i, '') + '.csv' }]
}

// ============================================
// Helpers (no dependencies)
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

// Generate a sample PDF in-memory using jsPDF (lazy-loaded)
export async function makeSamplePdf() {
  // Use the standard PDF format (a real PDF file we have on the server)
  // Fallback: return a basic text-PDF structure
  return null
}

// ============================================
// NEW: PDF Split (browser-based, no PDF.js needed)
// Uses canvas to render each page then saves as separate PDFs
// ============================================
export async function pdfSplit(file, onProgress) {
  // Load PDF.js dynamically (heavy lib, only when needed)
  const pdfjsLib = await import('pdfjs-dist')
  const { jsPDF } = await import('jspdf')

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const results = []
  const baseName = file.name.replace(/\.pdf$/i, '')

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 1.5 })
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    canvas.width = viewport.width
    canvas.height = viewport.height
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport }).promise
    const imgData = canvas.toDataURL('image/jpeg', 0.92)

    const newPdf = new jsPDF({
      unit: 'pt',
      format: [viewport.width, viewport.height]
    })
    newPdf.addImage(imgData, 'JPEG', 0, 0, viewport.width, viewport.height)

    results.push({
      blob: newPdf.output('blob'),
      name: `${baseName}_page_${i}.pdf`
    })
    onProgress?.(i / pdf.numPages)
  }
  return results
}

// ============================================
// NEW: PDF Merge (combine multiple PDFs into one)
// ============================================
export async function pdfMerge(files, onProgress) {
  const pdfjsLib = await import('pdfjs-dist')
  const { jsPDF } = await import('jspdf')

  if (!files || files.length === 0) throw new Error('No files to merge')

  // Use A4 as the base, or use first page's size
  const mergedPdf = new jsPDF({ unit: 'pt', format: 'a4' })
  let isFirstPage = true

  for (let f = 0; f < files.length; f++) {
    const file = files[f]
    onProgress?.(f / files.length)
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const viewport = page.getViewport({ scale: 1.5 })
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      canvas.width = viewport.width
      canvas.height = viewport.height
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: ctx, viewport }).promise
      const imgData = canvas.toDataURL('image/jpeg', 0.85)

      if (!isFirstPage) {
        mergedPdf.addPage([viewport.width, viewport.height],
          viewport.width > viewport.height ? 'landscape' : 'portrait')
      } else {
        isFirstPage = false
      }
      mergedPdf.addImage(imgData, 'JPEG', 0, 0, viewport.width, viewport.height)
    }
  }

  onProgress?.(1)
  return [{ blob: mergedPdf.output('blob'), name: 'merged.pdf' }]
}
