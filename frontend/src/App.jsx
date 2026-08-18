import { useState, useRef, useEffect } from 'react'
import { saveAs } from 'file-saver'
import {
  detectKind, imageToImage, textToHtml, textToRtf, textToCsv,
  jsonToCsv, jsonToText, csvToJson, csvToText, htmlToText,
  spreadsheetToText, spreadsheetToCsv,
  pdfSplit, pdfMerge
} from './lib/converters-lite'

const API_URL = import.meta.env.VITE_API_URL || ''

// Heavy operations (PDF, Word, PDF generation) — loaded on demand
let _full = null
async function loadFull() {
  if (!_full) {
    _full = await import('./lib/converters-full.js')
  }
  return _full
}

export default function App() {
  const [tab, setTab] = useState('convert')
  const [files, setFiles] = useState([])
  const [targetFormat, setTargetFormat] = useState('jpg')
  const [quality, setQuality] = useState(0.85)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState(null)
  const [history, setHistory] = useState([])
  const fileInput = useRef(null)

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('aina_history') || '[]')
      setHistory(saved)
    } catch {}
  }, [])

  const showStatus = (text, kind = 'success') => {
    setStatus({ text, kind })
    setTimeout(() => setStatus(null), 3500)
  }

  const addFiles = (newFiles) => {
    if (!newFiles || newFiles.length === 0) return
    const valid = Array.from(newFiles).filter(f =>
      ['pdf', 'image', 'text', 'word', 'spreadsheet', 'presentation', 'json', 'csv', 'html', 'rtf'].includes(detectKind(f))
    )
    if (valid.length === 0) {
      showStatus('Unsupported file type', 'error')
      return
    }
    setFiles(prev => [...prev, ...valid].slice(0, 10))
  }

  const removeFile = (i) => setFiles(prev => prev.filter((_, idx) => idx !== i))

  const loadSampleFile = async () => {
    try {
      // Create a tiny TXT sample (works without PDF.js)
      const sampleText = `AINA Converter — Sample Document
====================================

This is a sample text file you can use to test conversions.

Try converting it to:
  • HTML — web page
  • RTF  — rich text
  • CSV  — spreadsheet
  • PDF  — printable document (needs the heavy lib)
  • Word — .docx (needs the heavy lib)

Line 1: AINA Converter is awesome.
Line 2: It runs on your phone, offline.
Line 3: No tracking, no uploads.

# Heading 1
## Heading 2
### Heading 3

AINA — universal file conversion.
`
      const blob = new Blob([sampleText], { type: 'text/plain' })
      const file = new File([blob], 'sample.txt', { type: 'text/plain' })
      addFiles([file])
      showStatus('Sample text ready — pick an output format!')
    } catch (e) {
      showStatus('Failed to create sample: ' + e.message, 'error')
    }
  }

  const onDrop = (e) => {
    e.preventDefault()
    addFiles(e.dataTransfer.files)
  }

  const saveHistory = (entry) => {
    const next = [entry, ...history].slice(0, 50)
    setHistory(next)
    localStorage.setItem('aina_history', JSON.stringify(next))
  }

  // ---------- PDF Tools: Split ----------
  const splitPdf = async () => {
    if (files.length === 0 || detectKind(files[0]) !== 'pdf') {
      showStatus('Select a PDF file first', 'error')
      return
    }
    setBusy(true)
    setProgress(0)
    try {
      const outputs = await pdfSplit(files[0], setProgress)
      // Download each page
      for (const out of outputs) {
        saveAs(out.blob, out.name)
      }
      saveHistory({
        id: Date.now(),
        time: new Date().toLocaleString(),
        count: 1,
        from: files[0].name,
        to: 'PDF (split)',
        outputs: outputs.length
      })
      showStatus(`Split into ${outputs.length} PDFs`)
    } catch (e) {
      console.error(e)
      showStatus('Split failed: ' + (e.message || e), 'error')
    } finally {
      setBusy(false)
      setProgress(0)
    }
  }

  // ---------- PDF Tools: Merge ----------
  const mergePdfs = async () => {
    const pdfFiles = files.filter(f => detectKind(f) === 'pdf')
    if (pdfFiles.length < 2) {
      showStatus('Select at least 2 PDF files', 'error')
      return
    }
    setBusy(true)
    setProgress(0)
    try {
      const outputs = await pdfMerge(pdfFiles, setProgress)
      for (const out of outputs) {
        saveAs(out.blob, out.name)
      }
      saveHistory({
        id: Date.now(),
        time: new Date().toLocaleString(),
        count: pdfFiles.length,
        from: pdfFiles.length + ' PDFs',
        to: 'PDF (merged)',
        outputs: outputs.length
      })
      showStatus(`Merged ${pdfFiles.length} PDFs into 1`)
    } catch (e) {
      console.error(e)
      showStatus('Merge failed: ' + (e.message || e), 'error')
    } finally {
      setBusy(false)
      setProgress(0)
    }
  }

  const convert = async () => {
    if (files.length === 0) {
      showStatus('Pick a file first', 'error')
      return
    }
    setBusy(true)
    setProgress(0)

    try {
      const allOutputs = []
      // Lazy-load full converters only if needed
      const needsFull = files.some(f => {
        const k = detectKind(f)
        return k === 'pdf' || k === 'word' || k === 'spreadsheet' || k === 'presentation' || ['pdf', 'docx', 'xlsx'].includes(targetFormat)
      })
      const full = needsFull ? await loadFull() : null

      for (const file of files) {
        const kind = detectKind(file)
        const fmt = targetFormat.toLowerCase()

        // Image → image (lite, fast)
        if (kind === 'image' && ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'].includes(fmt)) {
          allOutputs.push(...await imageToImage([file], fmt, quality, setProgress))
        }
        // Text → HTML (lite)
        else if (kind === 'text' && fmt === 'html') {
          allOutputs.push(...await textToHtml(file))
        }
        // Text → RTF (lite)
        else if (kind === 'text' && fmt === 'rtf') {
          allOutputs.push(...await textToRtf(file))
        }
        // Text → CSV (lite)
        else if (kind === 'text' && fmt === 'csv') {
          allOutputs.push(...await textToCsv(file))
        }
        // Text → JSON (lite: just wrap)
        else if (kind === 'text' && fmt === 'json') {
          const text = await file.text()
          const blob = new Blob([JSON.stringify({ content: text.split('\n') }, null, 2)], { type: 'application/json' })
          allOutputs.push([{ blob, name: file.name.replace(/\.txt$/i, '') + '.json' }])
        }
        // Text → PDF (full)
        else if (kind === 'text' && fmt === 'pdf') {
          allOutputs.push(...await full.textToPdf(file, setProgress))
        }
        // Text → Word (full)
        else if (kind === 'text' && fmt === 'docx') {
          allOutputs.push(...await full.textToWord(file))
        }
        // Text → TXT (passthrough)
        else if (kind === 'text' && fmt === 'txt') {
          const text = await file.text()
          allOutputs.push([{ blob: new Blob([text], { type: 'text/plain' }), name: file.name.replace(/\.txt$/i, '') + '.txt' }])
        }
        // JSON → CSV (lite)
        else if (kind === 'json' && fmt === 'csv') {
          allOutputs.push(...await jsonToCsv(file))
        }
        // JSON → TXT (lite)
        else if (kind === 'json' && fmt === 'txt') {
          allOutputs.push(...await jsonToText(file))
        }
        // JSON → PDF (full)
        else if (kind === 'json' && fmt === 'pdf') {
          const txt = await jsonToText(file)
          allOutputs.push(...await full.textToPdf({ ...file, name: file.name.replace(/\.json$/i, '') + '.txt' }, setProgress))
        }
        // CSV → JSON (lite)
        else if (kind === 'csv' && fmt === 'json') {
          allOutputs.push(...await csvToJson(file))
        }
        // CSV → TXT (lite)
        else if (kind === 'csv' && fmt === 'txt') {
          allOutputs.push(...await csvToText(file))
        }
        // CSV → PDF (full)
        else if (kind === 'csv' && fmt === 'pdf') {
          allOutputs.push(...await full.csvToPdf(file, setProgress))
        }
        // CSV → Excel (lite: build a minimal xlsx-like .xls text)
        else if (kind === 'csv' && fmt === 'xlsx') {
          const text = await file.text()
          const blob = new Blob([text], { type: 'application/vnd.ms-excel' })
          allOutputs.push([{ blob, name: file.name.replace(/\.csv$/i, '') + '.xls' }])
        }
        // HTML → TXT (lite)
        else if (kind === 'html' && fmt === 'txt') {
          allOutputs.push(...await htmlToText(file))
        }
        // HTML → PDF (full)
        else if (kind === 'html' && fmt === 'pdf') {
          allOutputs.push(...await full.htmlToPdf(file, setProgress))
        }
        // Spreadsheet → TXT (lite)
        else if (kind === 'spreadsheet' && fmt === 'txt') {
          allOutputs.push(...await spreadsheetToText(file))
        }
        // Spreadsheet → CSV (lite)
        else if (kind === 'spreadsheet' && fmt === 'csv') {
          allOutputs.push(...await spreadsheetToCsv(file))
        }
        // Spreadsheet → PDF (full)
        else if (kind === 'spreadsheet' && fmt === 'pdf') {
          allOutputs.push(...await full.spreadsheetToPdf(file, setProgress))
        }
        // PDF → image formats (full)
        else if (kind === 'pdf' && ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'].includes(fmt)) {
          allOutputs.push(...await full.pdfToImages(file, fmt, quality, setProgress))
        }
        // PDF → TXT (full)
        else if (kind === 'pdf' && fmt === 'txt') {
          allOutputs.push(...await full.pdfToText(file, setProgress))
        }
        // PDF → Word (full, with backend fallback)
        else if (kind === 'pdf' && fmt === 'docx') {
          allOutputs.push(...await full.pdfToWordLocal(file, setProgress))
        }
        // Image → PDF (full)
        else if (kind === 'image' && fmt === 'pdf') {
          allOutputs.push(...await full.imagesToPdf([file], setProgress))
        }
        // Word → PDF (full)
        else if (kind === 'word' && fmt === 'pdf') {
          const text = await file.text()
          const fakeFile = new File([text], file.name.replace(/\.docx?$/i, '') + '.txt', { type: 'text/plain' })
          allOutputs.push(...await full.textToPdf(fakeFile, setProgress))
        }
        else {
          throw new Error(`Can't convert ${kind} to ${fmt}`)
        }
      }

      for (const out of allOutputs) {
        saveAs(out.blob, out.name)
      }

      saveHistory({
        id: Date.now(),
        time: new Date().toLocaleString(),
        count: files.length,
        from: files[0]?.name,
        to: targetFormat.toUpperCase(),
        outputs: allOutputs.length
      })

      showStatus(`Converted ${allOutputs.length} file(s)`)
    } catch (e) {
      console.error(e)
      showStatus(e.message || 'Conversion failed', 'error')
    } finally {
      setBusy(false)
      setProgress(0)
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">AINA Converter</h1>
        <p className="app-subtitle">PDF · Word · Excel · Markdown · Images</p>
        {!API_URL && (
          <div style={{
            display: 'inline-block', marginTop: 8, padding: '4px 10px',
            background: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            color: '#f59e0b', fontSize: 11, fontWeight: 700, borderRadius: 999
          }}>
            PREVIEW MODE — on-device conversions
          </div>
        )}
      </header>

      <nav className="app-nav">
        <button className={`nav-btn ${tab === 'convert' ? 'active' : ''}`} onClick={() => setTab('convert')}>Convert</button>
        <button className={`nav-btn ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>History</button>
        <button className={`nav-btn ${tab === 'about' ? 'active' : ''}`} onClick={() => setTab('about')}>About</button>
      </nav>

      <main className="app-content">
        {tab === 'convert' && (
          <ConverterView
            files={files} addFiles={addFiles} removeFile={removeFile}
            targetFormat={targetFormat} setTargetFormat={setTargetFormat}
            quality={quality} setQuality={setQuality}
            busy={busy} progress={progress} convert={convert}
            onDrop={onDrop} fileInput={fileInput} loadSample={loadSampleFile}
            splitPdf={splitPdf} mergePdfs={mergePdfs}
          />
        )}
        {tab === 'history' && <HistoryView history={history} setHistory={setHistory} />}
        {tab === 'about' && <AboutView />}
      </main>

      {status && <div className={`toast ${status.kind}`}>{status.text}</div>}
    </div>
  )
}

function ConverterView({ files, addFiles, removeFile, targetFormat, setTargetFormat,
  quality, setQuality, busy, progress, convert, onDrop, fileInput, loadSample, splitPdf, mergePdfs }) {
  const allFormats = [
    { id: 'jpg',   emoji: '🖼️', label: 'JPG',   sub: 'Image',    accepts: ['pdf', 'image'] },
    { id: 'png',   emoji: '🎨', label: 'PNG',   sub: 'Image',    accepts: ['pdf', 'image'] },
    { id: 'webp',  emoji: '✨', label: 'WebP',  sub: 'Image',    accepts: ['pdf', 'image'] },
    { id: 'bmp',   emoji: '🔲', label: 'BMP',   sub: 'Image',    accepts: ['pdf', 'image'] },
    { id: 'gif',   emoji: '🎞️', label: 'GIF',   sub: 'Image',    accepts: ['pdf', 'image'] },
    { id: 'txt',   emoji: '📝', label: 'TXT',   sub: 'Text',     accepts: ['pdf', 'text', 'json', 'spreadsheet', 'csv', 'html'] },
    { id: 'docx',  emoji: '📘', label: 'Word',  sub: 'Document', accepts: ['pdf', 'text'] },
    { id: 'xlsx',  emoji: '📊', label: 'Excel', sub: 'Spreadsheet', accepts: ['csv'] },
    { id: 'pdf',   emoji: '📕', label: 'PDF',   sub: 'Document', accepts: ['image', 'text', 'word', 'spreadsheet', 'json', 'html', 'csv'] },
    { id: 'html',  emoji: '🌐', label: 'HTML',  sub: 'Web',      accepts: ['text', 'html'] },
    { id: 'rtf',   emoji: '📃', label: 'RTF',   sub: 'Document', accepts: ['text'] },
    { id: 'csv',   emoji: '📋', label: 'CSV',   sub: 'Data',     accepts: ['text', 'json', 'csv', 'spreadsheet'] },
    { id: 'json',  emoji: '🧬', label: 'JSON',  sub: 'Data',     accepts: ['csv', 'json', 'text'] }
  ]

  const sourceKinds = files.length > 0 ? [...new Set(files.map(detectKind))] : []
  const formats = files.length === 0
    ? allFormats
    : allFormats.filter(f => sourceKinds.some(k => f.accepts.includes(k)))

  return (
    <>
      <div
        className={`drop-zone ${files.length > 0 ? 'has-file' : ''}`}
        onClick={() => fileInput.current.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <span className="drop-zone-icon">{files.length > 0 ? '✅' : '📤'}</span>
        <div className="drop-zone-text">
          {files.length > 0 ? `${files.length} file(s) ready` : 'Tap to choose files'}
        </div>
        <div className="drop-zone-hint">PDF, Word, Excel, PPT, Markdown, images, JSON, CSV, HTML, TXT — up to 10 files</div>
        <input
          ref={fileInput} type="file" multiple
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ods,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.bmp,.gif,.tif,.tiff,.txt,.md,.markdown,.html,.htm,.rtf,.json,.csv"
          style={{ display: 'none' }}
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {files.length === 0 && (
        <button className="action-btn secondary" style={{ marginTop: 12 }} onClick={loadSample}>
          🧪 Try a sample text file
        </button>
      )}

      {files.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">
            <span className="card-title-icon">📎</span> Selected files
          </div>
          {files.map((f, i) => (
            <div className="file-item" key={i}>
              <div className="file-icon">{fileEmoji(f.name)}</div>
              <div className="file-info">
                <div className="file-name">{f.name}</div>
                <div className="file-size">{formatSize(f.size)}</div>
              </div>
              <button className="file-remove" onClick={() => removeFile(i)}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* PDF Tools - only show when PDFs are loaded */}
      {files.length > 0 && files.some(f => detectKind(f) === 'pdf') && (
        <div className="card" style={{ marginTop: 12, background: 'rgba(124, 58, 237, 0.08)', border: '1px solid rgba(124, 58, 237, 0.2)' }}>
          <div className="card-title">
            <span className="card-title-icon" style={{ background: 'linear-gradient(135deg, #f59e0b, #ec4899)' }}>🔧</span>
            PDF Tools
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            Quick actions for PDF files
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="action-btn secondary"
              style={{ flex: 1, marginTop: 0, padding: '12px 8px', fontSize: 13 }}
              onClick={splitPdf}
              disabled={busy || files.filter(f => detectKind(f) === 'pdf').length !== 1}
            >
              ✂️ Split PDF
              <div style={{ fontSize: 9, opacity: 0.7, marginTop: 2, fontWeight: 500 }}>
                1 page per file
              </div>
            </button>
            <button
              className="action-btn secondary"
              style={{ flex: 1, marginTop: 0, padding: '12px 8px', fontSize: 13 }}
              onClick={mergePdfs}
              disabled={busy || files.filter(f => detectKind(f) === 'pdf').length < 2}
            >
              🔗 Merge PDFs
              <div style={{ fontSize: 9, opacity: 0.7, marginTop: 2, fontWeight: 500 }}>
                Combine all into 1
              </div>
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">
          <span className="card-title-icon">🔄</span> Convert to
          {files.length > 0 && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, marginLeft: 'auto' }}>
              {formats.length} option{formats.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="format-grid">
          {formats.map(fmt => (
            <button
              key={fmt.id}
              className={`format-btn ${targetFormat === fmt.id ? 'active' : ''}`}
              onClick={() => setTargetFormat(fmt.id)}
            >
              <span className="format-btn-emoji">{fmt.emoji}</span>
              <div className="format-btn-label">{fmt.label}</div>
              <div className="format-btn-sub">{fmt.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {(targetFormat === 'jpg' || targetFormat === 'webp') && (
        <div className="card">
          <div className="card-title">
            <span className="card-title-icon">⚙️</span> Image quality
          </div>
          <div className="quality-row">
            <input type="range" min="0.3" max="1" step="0.05"
              value={quality} onChange={(e) => setQuality(parseFloat(e.target.value))}
              className="quality-slider" />
            <div className="quality-value">{Math.round(quality * 100)}%</div>
          </div>
        </div>
      )}

      {busy && (
        <div className="progress-wrap">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <div className="progress-text">Converting… {Math.round(progress * 100)}%</div>
        </div>
      )}

      <button className="action-btn" onClick={convert} disabled={busy || files.length === 0}>
        {busy ? <><span className="spinner" /> Converting…</> : <>🚀 Convert & Download</>}
      </button>
    </>
  )
}

function HistoryView({ history, setHistory }) {
  if (history.length === 0) {
    return (
      <div className="card">
        <div className="history-empty">
          <div className="history-empty-icon">📜</div>
          <div>No conversions yet</div>
          <div style={{ fontSize: 12, marginTop: 8 }}>Your conversion history will appear here</div>
        </div>
      </div>
    )
  }
  return (
    <>
      <button className="history-clear" onClick={() => {
        localStorage.removeItem('aina_history')
        setHistory([])
      }}>🗑️ Clear all</button>
      {history.map(h => (
        <div className="history-item" key={h.id}>
          <div className="file-icon">📄</div>
          <div className="file-info">
            <div className="file-name">{h.count} file(s) → {h.to}</div>
            <div className="history-time">{h.time}</div>
          </div>
          <span className="history-arrow">›</span>
        </div>
      ))}
    </>
  )
}

function AboutView() {
  return (
    <>
      <div className="card">
        <div className="card-title"><span className="card-title-icon">ℹ️</span> About</div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          AINA Converter is a free, privacy-friendly file converter. Most conversions happen on your device — files never leave your phone.
        </p>
      </div>
      <div className="card">
        <div className="card-title"><span className="card-title-icon">🔒</span> Privacy</div>
        <ul style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, paddingLeft: 18 }}>
          <li>Image, text, JSON, CSV, HTML conversions: <b style={{ color: 'var(--success)' }}>on your device</b></li>
          <li>PDF and Word conversions: <b style={{ color: 'var(--success)' }}>on your device</b></li>
          <li>No accounts, no tracking, no logs</li>
        </ul>
      </div>
      <div className="card">
        <div className="card-title"><span className="card-title-icon">💡</span> Install on your phone</div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <b>Android:</b> Menu (⋮) → "Add to Home screen"<br/>
          <b>iPhone:</b> Share (↑) → "Add to Home Screen"<br/>
          <br/>Then the AINA icon appears on your home screen and opens like a real app!
        </p>
      </div>
    </>
  )
}

function fileEmoji(name) {
  const n = name.toLowerCase()
  if (n.endsWith('.pdf')) return '📕'
  if (n.endsWith('.doc') || n.endsWith('.docx')) return '📘'
  if (/\.(xlsx?|ods)$/.test(n)) return '📊'
  if (n.endsWith('.ppt') || n.endsWith('.pptx')) return '📽️'
  if (/\.(jpe?g|png|webp|bmp|gif|tiff?)$/.test(n)) return '🖼️'
  if (n.endsWith('.json')) return '🧬'
  if (n.endsWith('.csv')) return '📋'
  if (n.endsWith('.html') || n.endsWith('.htm')) return '🌐'
  if (n.endsWith('.rtf')) return '📃'
  if (n.endsWith('.md') || n.endsWith('.markdown')) return '📑'
  if (n.endsWith('.txt')) return '📝'
  return '📄'
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}
