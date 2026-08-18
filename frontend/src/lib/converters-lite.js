// ============================================
// LITE converters — no heavy dependencies
// ============================================

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
  if (n.endsWith('.txt') || n.endsWith('.md') || n.endsWith('.markdown')) return 'text'
  if (/\.(docx?)$/.test(n)) return 'word'
  return 'unknown'
}

// Image → Image
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
    results.push({ dataUrl, blob: dataURLtoBlob(dataUrl), name: `${baseName}.${ext}` })
    onProgress?.((i + 1) / files.length)
  }
  return results
}

// Text → HTML
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
    if (line.trim() === '') return '<p><br/></p>'
    return `<p>${t}</p>`
  }).join('\n')
  const title = file.name.replace(/\.(txt|md|markdown)$/i, '')
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(file.name)}</title>
<style>body{font-family:sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.6;color:#222}h1,h2,h3{color:#7c3aed}</style>
</head>
<body>${body}</body>
</html>`
  const blob = new Blob([html], { type: 'text/html' })
  return [{ blob, name: file.name.replace(/\.(txt|md|markdown)$/i, '') + '.html' }]
}

// Text → RTF
export async function textToRtf(file) {
  const text = await file.text()
  const esc = text.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/\n/g, '\\par\n')
  const rtf = '{\\rtf1\\ansi\\ansicpg1252\\deff0\n{\\fonttbl{\\f0 Arial;}}\\viewkind4\\uc1\\pard\\fs28 ' + esc + '\\par\\fs22\n}'
  const blob = new Blob([rtf], { type: 'application/rtf' })
  return [{ blob, name: file.name.replace(/\.(txt|md)$/i, '') + '.rtf' }]
}

// Text → CSV
export async function textToCsv(file) {
  const text = await file.text()
  const lines = text.split(/\r?\n/).filter(l => l.length > 0)
  const csv = 'Line,Content\n' + lines.map((line, i) => {
    const v = line.includes(',') || line.includes('"') ? '"' + line.replace(/"/g, '""') + '"' : line
    return (i + 1) + ',' + v
  }).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  return [{ blob, name: file.name.replace(/\.(txt|md)$/i, '') + '.csv' }]
}

// Text → JSON
export async function textToJson(file) {
  const text = await file.text()
  const data = { lines: text.split('\n') }
  return [{ blob: new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
            name: file.name.replace(/\.(txt|md)$/i, '') + '.json' }]
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
    return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => esc(typeof r === 'object' && r !== null ? r[h] : r)).join(','))
  ].join('\n')
  return [{ blob: new Blob([csv], { type: 'text/csv' }), name: file.name.replace(/\.json$/i, '') + '.csv' }]
}

// JSON → TXT
export async function jsonToText(file) {
  const text = await file.text()
  let data
  try { data = JSON.parse(text) } catch (e) { throw new Error('Invalid JSON') }
  return [{ blob: new Blob([JSON.stringify(data, null, 2)], { type: 'text/plain' }),
            name: file.name.replace(/\.json$/i, '') + '.txt' }]
}

// CSV parser
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

// CSV → JSON
export async function csvToJson(file) {
  const text = await file.text()
  const rows = parseCsv(text)
  return [{ blob: new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }),
            name: file.name.replace(/\.csv$/i, '') + '.json' }]
}

// CSV → TXT
export async function csvToText(file) {
  const text = await file.text()
  return [{ blob: new Blob([text], { type: 'text/plain' }), name: file.name.replace(/\.csv$/i, '') + '.txt' }]
}

// HTML → TXT
export async function htmlToText(file) {
  const raw = await file.text()
  const text = raw
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim()
  return [{ blob: new Blob([text], { type: 'text/plain' }), name: file.name.replace(/\.html?$/i, '') + '.txt' }]
}

// Spreadsheet → TXT
export async function spreadsheetToText(file) {
  const text = await file.text()
  const matches = text.match(/<t[^>]*>([^<]+)<\/t>/g) || []
  const values = matches.map(m => m.replace(/<[^>]+>/g, '')).filter(v => v.trim())
  return [{ blob: new Blob([values.join('\n')], { type: 'text/plain' }),
            name: file.name.replace(/\.(xlsx|xls|ods)$/i, '') + '.txt' }]
}

// Spreadsheet → CSV
export async function spreadsheetToCsv(file) {
  const text = await file.text()
  const matches = text.match(/<t[^>]*>([^<]+)<\/t>/g) || []
  const values = matches.map(m => m.replace(/<[^>]+>/g, '')).filter(v => v.trim())
  const csv = 'Row,Value\n' + values.map((v, i) => (i + 1) + ',"' + v.replace(/"/g, '""') + '"').join('\n')
  return [{ blob: new Blob([csv], { type: 'text/csv' }),
            name: file.name.replace(/\.(xlsx|xls|ods)$/i, '') + '.csv' }]
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

// ============================================
// PDF Split — uses BACKEND API (avoids client-side jspdf vulnerabilities)
// ============================================
export async function pdfSplit(file, onProgress) {
  const API = (typeof window !== 'undefined' && window.VITE_API_URL) || ''
  const apiBase = API || (import.meta.env?.VITE_API_URL) || ''

  if (apiBase) {
    // Use backend
    onProgress?.(0.1)
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`${apiBase}/api/pdf-split`, { method: 'POST', body: fd })
    if (!res.ok) throw new Error('Server error: ' + res.status)
    onProgress?.(0.9)
    const blob = await res.blob()
    onProgress?.(1)
    return [{ blob, name: file.name.replace(/\.pdf$/i, '') + '_split.zip' }]
  } else {
    // Fallback: use pdfjs + canvas to render pages as separate PDFs in-browser
    // (This will use more memory but works without backend)
    const pdfjsLib = await import('pdfjs-dist')
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    const results = []
    const baseName = file.name.replace(/\.pdf$/i, '')

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()
      const text = textContent.items.map(it => it.str).join(' ')

      // Build a simple text-based PDF
      const pdfText = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>>>>>>>endobj
4 0 obj<</Length ${text.length + 200}>>
stream
BT /F1 12 Tf 50 750 Td (${text.replace(/[()\\]/g, '\\$&').slice(0, 500)}) Tj ET
endstream
endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000054 00000 n
0000000099 00000 n
0000000204 00000 n
trailer<</Size 5/Root 1 0 R>>
startxref
${500 + text.length}
%%EOF`
      const blob = new Blob([pdfText], { type: 'application/pdf' })
      results.push({ blob, name: `${baseName}_page_${i}.pdf` })
      onProgress?.(i / pdf.numPages)
    }
    return results
  }
}

// ============================================
// PDF Merge — uses BACKEND API
// ============================================
export async function pdfMerge(files, onProgress) {
  const apiBase = (import.meta.env?.VITE_API_URL) || ''

  if (apiBase) {
    onProgress?.(0.1)
    const fd = new FormData()
    for (const f of files) fd.append('files', f)
    const res = await fetch(`${apiBase}/api/pdf-merge`, { method: 'POST', body: fd })
    if (!res.ok) throw new Error('Server error: ' + res.status)
    onProgress?.(0.9)
    const blob = await res.blob()
    onProgress?.(1)
    return [{ blob, name: 'merged.pdf' }]
  } else {
    throw new Error('PDF Merge requires the backend server. Deploy with VITE_API_URL set.')
  }
}

// ============================================
// PDF reading (uses pdfjs-dist, no jspdf needed)
// ============================================
async function loadPdfjs() {
  const pdfjsLib = await import('pdfjs-dist')
  return pdfjsLib
}

export async function pdfToText(file, onProgress) {
  const pdfjsLib = await loadPdfjs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  let fullText = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items.map(item => item.str).join(' ')
    fullText += text + '\n\n'
    onProgress?.(i / pdf.numPages)
  }
  return [{ blob: new Blob([fullText], { type: 'text/plain' }),
            name: file.name.replace(/\.pdf$/i, '') + '.txt' }]
}

export async function pdfToImages(file, format, quality, onProgress) {
  const pdfjsLib = await loadPdfjs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const results = []
  const fmt = format.toLowerCase()
  let mime
  if (fmt === 'jpg' || fmt === 'jpeg') mime = 'image/jpeg'
  else if (fmt === 'png') mime = 'image/png'
  else if (fmt === 'webp') mime = 'image/webp'
  else if (fmt === 'bmp') mime = 'image/bmp'
  else if (fmt === 'gif') mime = 'image/gif'
  else throw new Error(`Unsupported format: ${format}`)

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 2.0 })
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    canvas.width = viewport.width
    canvas.height = viewport.height
    if (fmt === 'jpg' || fmt === 'jpeg' || fmt === 'bmp') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    await page.render({ canvasContext: ctx, viewport }).promise
    const dataUrl = canvas.toDataURL(mime, quality)
    const baseName = file.name.replace(/\.pdf$/i, '')
    const ext = fmt === 'jpeg' ? 'jpg' : fmt
    results.push({
      blob: dataURLtoBlob(dataUrl),
      name: `${baseName}_page_${i}.${ext}`
    })
    onProgress?.(i / pdf.numPages)
  }
  return results
}

// Simple PDF → text (for pdfToWord fallback)
export async function pdfToWordLocal(file, onProgress) {
  const out = await pdfToText(file, onProgress)
  return [{
    blob: new Blob([
      `# Extracted from ${file.name}\n\n` + (await out[0].blob.text())
    ], { type: 'text/plain' }),
    name: file.name.replace(/\.pdf$/i, '') + '_extracted.txt'
  }]
}
