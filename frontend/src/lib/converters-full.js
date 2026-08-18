// ============================================
// ============================================
// Browser-side conversion library
// ============================================

import * as pdfjsLib from 'pdfjs-dist'
import { jsPDF } from 'jspdf'
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'

// Worker setup
let workerInitialized = false
async function setupPdfWorker() {
  if (workerInitialized) return
  try {
    const workerUrl = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    )
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl.toString()
  } catch (e) {
    // Silently fall back to fake worker
  }
  workerInitialized = true
}
setupPdfWorker()

// ---------- Helpers ----------
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

// ============================================
// PDF conversions
// ============================================

export async function pdfToImages(file, format, quality, onProgress) {
  await setupPdfWorker()
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
  else throw new Error(`Unsupported image format: ${format}`)

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
      dataUrl,
      blob: dataURLtoBlob(dataUrl),
      page: i,
      name: `${baseName}_page_${i}.${ext}`
    })
    onProgress?.(i / pdf.numPages)
  }
  return results
}

export async function pdfToText(file, onProgress) {
  await setupPdfWorker()
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

// ---------- NEW: PDF Split ----------
// Splits a PDF into separate pages, each page as its own PDF
export async function pdfSplit(file, onProgress) {
  await setupPdfWorker()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const results = []
  const baseName = file.name.replace(/\.pdf$/i, '')

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 1.5 })

    // Create a new PDF with just this page
    const newPdf = new jsPDF({
      unit: 'pt',
      format: [viewport.width, viewport.height]
    })

    // Render the page to a canvas, then add as image
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    canvas.width = viewport.width
    canvas.height = viewport.height
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport }).promise
    const imgData = canvas.toDataURL('image/jpeg', 0.92)
    newPdf.addImage(imgData, 'JPEG', 0, 0, viewport.width, viewport.height)

    const blob = newPdf.output('blob')
    results.push({
      blob,
      name: `${baseName}_page_${i}.pdf`
    })
    onProgress?.(i / pdf.numPages)
  }
  return results
}

// ---------- NEW: PDF Merge ----------
// Combines multiple PDFs into one
export async function pdfMerge(files, onProgress) {
  await setupPdfWorker()
  if (!files || files.length === 0) throw new Error('No files to merge')
  if (files.length === 1) {
    // Just return the single file
    return [{ blob: files[0], name: 'merged.pdf' }]
  }

  // Use the first PDF as the base
  const firstBuffer = await files[0].arrayBuffer()
  const firstPdf = await pdfjsLib.getDocument({ data: firstBuffer }).promise

  // Create a new PDF, copying each page from each input file
  const mergedPdf = new jsPDF({
    unit: 'pt',
    format: 'a4'
  })
  let isFirstPage = true

  for (let f = 0; f < files.length; f++) {
    const file = files[f]
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
        mergedPdf.addPage([viewport.width, viewport.height], viewport.width > viewport.height ? 'landscape' : 'portrait')
      } else {
        isFirstPage = false
      }
      mergedPdf.addImage(imgData, 'JPEG', 0, 0, viewport.width, viewport.height)

      onProgress?.(((f * 100) + (i / pdf.numPages * 100)) / files.length / 100)
    }
  }

  const blob = mergedPdf.output('blob')
  return [{ blob, name: 'merged.pdf' }]
}

// ============================================
// Image conversions
// ============================================

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

// ============================================
// Text / Markdown conversions
// ============================================

// Markdown → HTML (improved version)
function markdownToHtml(text) {
  const lines = text.split(/\r?\n/)
  const result = []
  let inList = false
  let inOrderedList = false
  let inCodeBlock = false
  let codeContent = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    // Code block
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        result.push('<pre><code>' + esc(codeContent.join('\n')) + '</code></pre>')
        codeContent = []
        inCodeBlock = false
      } else {
        inCodeBlock = true
      }
      continue
    }
    if (inCodeBlock) {
      codeContent.push(line)
      continue
    }

    // Close lists
    const isUnordered = /^\s*[-*+]\s/.test(line)
    const isOrdered = /^\s*\d+\.\s/.test(line)
    if (inList && !isUnordered) {
      result.push('</ul>')
      inList = false
    }
    if (inOrderedList && !isOrdered) {
      result.push('</ol>')
      inOrderedList = false
    }

    // Headings
    const hMatch = line.match(/^(#{1,6})\s+(.*)$/)
    if (hMatch) {
      const level = hMatch[1].length
      result.push(`<h${level}>${esc(hMatch[2])}</h${level}>`)
      continue
    }

    // Lists
    if (isUnordered) {
      if (!inList) { result.push('<ul>'); inList = true }
      result.push('<li>' + esc(line.replace(/^\s*[-*+]\s/, '')) + '</li>')
      continue
    }
    if (isOrdered) {
      if (!inOrderedList) { result.push('<ol>'); inOrderedList = true }
      result.push('<li>' + esc(line.replace(/^\s*\d+\.\s/, '')) + '</li>')
      continue
    }

    // Blockquote
    if (line.startsWith('> ')) {
      result.push('<blockquote>' + esc(line.substring(2)) + '</blockquote>')
      continue
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(line.trim())) {
      result.push('<hr/>')
      continue
    }

    // Bold (**text** or __text__)
    let processed = esc(line)
    processed = processed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    processed = processed.replace(/__([^_]+)__/g, '<strong>$1</strong>')
    // Italic (*text* or _text_)
    processed = processed.replace(/\*([^*]+)\*/g, '<em>$1</em>')
    processed = processed.replace(/_([^_]+)_/g, '<em>$1</em>')
    // Code (`text`)
    processed = processed.replace(/`([^`]+)`/g, '<code>$1</code>')
    // Links [text](url)
    processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Images ![alt](url)
    processed = processed.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2"/>')

    if (line.trim() === '') {
      result.push('')
    } else {
      result.push('<p>' + processed + '</p>')
    }
  }

  // Close any open lists/code blocks
  if (inList) result.push('</ul>')
  if (inOrderedList) result.push('</ol>')
  if (inCodeBlock) result.push('<pre><code>' + esc(codeContent.join('\n')) + '</code></pre>')

  return result.join('\n')
}

export async function textToHtml(file) {
  const text = await file.text()
  const isMd = /\.(md|markdown)$/i.test(file.name)
  const body = isMd ? markdownToHtml(text) : (() => {
    // Plain text → simple HTML
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return text.split(/\r?\n/).map(line =>
      line.trim() === '' ? '<p><br/></p>' : '<p>' + esc(line) + '</p>'
    ).join('\n')
  })()

  const title = file.name.replace(/\.(txt|md|markdown)$/i, '')
  const html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
    '<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '<title>' + title.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]) + '</title>\n' +
    '<style>\n' +
    'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.7; color: #222; }\n' +
    'h1, h2, h3, h4, h5, h6 { color: #7c3aed; margin-top: 1.5em; }\n' +
    'h1 { font-size: 2em; border-bottom: 2px solid #7c3aed; padding-bottom: 0.3em; }\n' +
    'h2 { font-size: 1.5em; border-bottom: 1px solid #eee; padding-bottom: 0.2em; }\n' +
    'code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-family: monospace; font-size: 0.9em; color: #c7254e; }\n' +
    'pre { background: #1e1e2e; color: #f8f8f2; padding: 16px; border-radius: 8px; overflow-x: auto; }\n' +
    'pre code { background: none; color: inherit; padding: 0; }\n' +
    'blockquote { border-left: 4px solid #7c3aed; margin: 1em 0; padding: 0.5em 1em; color: #666; background: #f9f9f9; }\n' +
    'img { max-width: 100%; height: auto; }\n' +
    'a { color: #7c3aed; text-decoration: none; border-bottom: 1px dotted #7c3aed; }\n' +
    'a:hover { border-bottom-style: solid; }\n' +
    'ul, ol { padding-left: 1.5em; }\n' +
    'hr { border: none; border-top: 1px solid #eee; margin: 2em 0; }\n' +
    'table { border-collapse: collapse; width: 100%; }\n' +
    'th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }\n' +
    'th { background: #f4f4f4; }\n' +
    '</style>\n</head>\n<body>\n' +
    body + '\n</body>\n</html>'

  const blob = new Blob([html], { type: 'text/html' })
  return [{ blob, name: file.name.replace(/\.(txt|md|markdown)$/i, '') + '.html' }]
}

// Markdown → PDF (uses HTML intermediate)
export async function markdownToPdf(file, onProgress) {
  const htmlResult = await textToHtml(file)
  // Reuse htmlToPdf logic
  return await htmlToPdf(
    new File([htmlResult[0].blob], file.name.replace(/\.md$/i, '') + '.html', { type: 'text/html' }),
    onProgress
  )
}

export async function textToRtf(file) {
  const text = await file.text()
  const esc = text
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\n/g, '\\par\n')
  const rtf = '{\\rtf1\\ansi\\ansicpg1252\\deff0\n{\\fonttbl{\\f0 Arial;}}\\viewkind4\\uc1\\pard\\fs28 ' + esc + '\\par\\fs22\n}'
  return [{ blob: new Blob([rtf], { type: 'application/rtf' }), name: file.name.replace(/\.(txt|md)$/i, '') + '.rtf' }]
}

export async function textToCsv(file) {
  const text = await file.text()
  const lines = text.split(/\r?\n/).filter(l => l.length > 0)
  const csv = 'Line,Content\n' + lines.map((line, i) => {
    const v = line.includes(',') || line.includes('"') ? '"' + line.replace(/"/g, '""') + '"' : line
    return (i + 1) + ',' + v
  }).join('\n')
  return [{ blob: new Blob([csv], { type: 'text/csv' }), name: file.name.replace(/\.(txt|md)$/i, '') + '.csv' }]
}

export async function textToJson(file) {
  const text = await file.text()
  const data = { lines: text.split('\n') }
  return [{ blob: new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
            name: file.name.replace(/\.(txt|md)$/i, '') + '.json' }]
}

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

export async function textToWord(file) {
  const text = await file.text()
  const lines = text.split(/\r?\n/)
  const children = []
  children.push(new Paragraph({
    text: file.name.replace(/\.(txt|md|markdown)$/i, ''),
    heading: HeadingLevel.HEADING_1,
    spacing: { after: 300 }
  }))
  for (const line of lines) {
    if (line.trim() === '') {
      children.push(new Paragraph({ text: '' }))
    } else {
      children.push(new Paragraph({
        children: [new TextRun({ text: line, size: 22 })]
      }))
    }
  }
  const doc = new Document({ creator: 'AINA Converter', title: file.name, sections: [{ children }] })
  const buffer = await Packer.toBuffer(doc)
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  })
  return [{ blob, name: file.name.replace(/\.(txt|md|markdown)$/i, '') + '.docx' }]
}

export async function pdfToWordLocal(file, onProgress) {
  await setupPdfWorker()
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
      children.push(new Paragraph({ children: [new TextRun({ text: line, size: 22 })] }))
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
  const doc = new Document({ creator: 'AINA Converter', title: file.name, sections: [{ children }] })
  const buffer = await Packer.toBuffer(doc)
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  })
  return [{ blob, name: file.name.replace(/\.pdf$/i, '') + '.docx' }]
}

// ============================================
// Data conversions
// ============================================

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

export async function jsonToText(file) {
  const text = await file.text()
  let data
  try { data = JSON.parse(text) } catch (e) { throw new Error('Invalid JSON') }
  return [{ blob: new Blob([JSON.stringify(data, null, 2)], { type: 'text/plain' }),
            name: file.name.replace(/\.json$/i, '') + '.txt' }]
}

export async function csvToJson(file) {
  const text = await file.text()
  const rows = parseCsv(text)
  const json = JSON.stringify(rows, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  return [{ blob, name: file.name.replace(/\.csv$/i, '') + '.json' }]
}

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

export async function csvToText(file) {
  const text = await file.text()
  return [{ blob: new Blob([text], { type: 'text/plain' }), name: file.name.replace(/\.csv$/i, '') + '.txt' }]
}

export async function htmlToTxt(file) {
  const raw = await file.text()
  const text = raw
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim()
  return [{ blob: new Blob([text], { type: 'text/plain' }), name: file.name.replace(/\.html?$/i, '') + '.txt' }]
}

export async function htmlToPdf(file, onProgress) {
  const raw = await file.text()
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

export async function spreadsheetToText(file) {
  const text = await file.text()
  const matches = text.match(/<t[^>]*>([^<]+)<\/t>/g) || []
  const values = matches.map(m => m.replace(/<[^>]+>/g, '')).filter(v => v.trim())
  return [{ blob: new Blob([values.join('\n')], { type: 'text/plain' }),
            name: file.name.replace(/\.(xlsx|xls|ods)$/i, '') + '.txt' }]
}

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
