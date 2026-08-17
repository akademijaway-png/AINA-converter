// ============================================
// PDF Converter Backend - Node.js / Express
// Handles: PDF → Word, Word → PDF
// Other conversions happen in the browser
// ============================================

import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx'
import mammoth from 'mammoth'
import PDFDocument from 'pdfkit'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

const app = express()
const PORT = process.env.PORT || 3001

// CORS — allow your PWA origin
app.use(cors({
  origin: '*', // For dev. Lock this down in production to your frontend domain.
  methods: ['GET', 'POST', 'OPTIONS']
}))

// File upload (50 MB max, in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
})

// Health check
app.get('/', (req, res) => {
  res.json({
    service: 'PDF Converter API',
    version: '1.0.0',
    endpoints: ['/api/pdf-to-word', '/api/word-to-pdf', '/api/pdf-to-text', '/health']
  })
})

app.get('/health', (req, res) => res.json({ status: 'ok' }))

// ============================================
// Helper: extract text from a PDF buffer using pdfjs
// Returns array of { page, text }
// ============================================
async function extractPdfText(buffer) {
  const data = new Uint8Array(buffer)
  const loadingTask = pdfjsLib.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true
  })
  const pdf = await loadingTask.promise
  const pages = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items.map(item => item.str).join(' ')
    pages.push({ page: i, text })
  }
  return pages
}

// ============================================
// PDF → Word (.docx)
// ============================================
app.post('/api/pdf-to-word', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

    const pages = await extractPdfText(req.file.buffer)

    // Build .docx
    const docChildren = []
    docChildren.push(new Paragraph({
      text: req.file.originalname.replace(/\.pdf$/i, ''),
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 }
    }))

    let totalChars = 0
    for (let i = 0; i < pages.length; i++) {
      const pageText = (pages[i].text || '').trim()
      if (pageText) {
        const lines = pageText.split(/\s{2,}|\n/).map(l => l.trim()).filter(Boolean)
        for (const line of lines) {
          docChildren.push(new Paragraph({
            children: [new TextRun({ text: line, size: 22 })],
            spacing: { after: 120 }
          }))
          totalChars += line.length
        }
      }
      if (i < pages.length - 1) {
        docChildren.push(new Paragraph({ text: '', pageBreakBefore: true }))
      }
    }

    if (totalChars === 0) {
      docChildren.push(new Paragraph({
        children: [new TextRun({
          text: '(This PDF appears to contain no extractable text — it may be image-based. Try a different PDF or use OCR.)',
          italics: true,
          color: '888888'
        })]
      }))
    }

    const doc = new Document({
      creator: 'PDF Converter',
      title: req.file.originalname,
      sections: [{ children: docChildren }]
    })

    const buffer = await Packer.toBuffer(doc)

    const filename = req.file.originalname.replace(/\.pdf$/i, '') + '.docx'
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(buffer)
  } catch (e) {
    console.error('pdf-to-word error:', e)
    res.status(500).json({ error: e.message || 'Conversion failed' })
  }
})

// ============================================
// Word → PDF
// ============================================
app.post('/api/word-to-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

    const result = await mammoth.extractRawText({ buffer: req.file.buffer })
    const text = result.value || ''

    const doc = new PDFDocument({ size: 'A4', margin: 50 })
    const chunks = []
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks)
      const filename = req.file.originalname.replace(/\.docx?$/i, '') + '.pdf'
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.send(pdfBuffer)
    })

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
    doc.fontSize(11).text(text, { width: pageWidth, align: 'left' })
    doc.end()
  } catch (e) {
    console.error('word-to-pdf error:', e)
    res.status(500).json({ error: e.message || 'Conversion failed' })
  }
})

// ============================================
// PDF → TXT
// ============================================
app.post('/api/pdf-to-text', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    const pages = await extractPdfText(req.file.buffer)
    const text = pages.map(p => p.text).join('\n\n')
    const filename = req.file.originalname.replace(/\.pdf$/i, '') + '.txt'
    res.setHeader('Content-Type', 'text/plain')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(text)
  } catch (e) {
    console.error('pdf-to-text error:', e)
    res.status(500).json({ error: e.message || 'Conversion failed' })
  }
})

// ============================================
// Error handling
// ============================================
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  if (err instanceof multer.MulterError) {
    return res.status(413).json({ error: `File too large: ${err.message}` })
  }
  res.status(500).json({ error: err.message || 'Server error' })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 PDF Converter API running on port ${PORT}`)
  console.log(`   Endpoints: /api/pdf-to-word, /api/word-to-pdf, /api/pdf-to-text`)
})
