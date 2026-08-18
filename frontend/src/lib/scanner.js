// ============================================
// Document Scanner
// Camera capture + auto-crop + clean-up + multi-page PDF
// ============================================

// Load image from File or dataURL
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = typeof src === 'string' ? src : URL.createObjectURL(src)
  })
}

// ============================================
// Step 1: Process image (auto-crop, enhance, white BG)
// ============================================
export async function processScannedImage(file, options = {}) {
  const {
    autoCrop = true,
    enhance = true,
    whiteBackground = true,
    outputFormat = 'image/jpeg',
    quality = 0.92
  } = options

  const img = await loadImage(file)
  let { width, height } = img

  // Step 1: Detect document edges
  let cropBox = null
  if (autoCrop) {
    cropBox = detectDocumentEdges(img)
  }

  // Step 2: Apply perspective correction + crop
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })

  if (cropBox) {
    // Apply perspective transform using the 4 detected corners
    const transformed = applyPerspectiveTransform(img, cropBox)
    canvas.width = transformed.width
    canvas.height = transformed.height
    ctx.putImageData(transformed.imageData, 0, 0)
  } else {
    canvas.width = width
    canvas.height = height
    ctx.drawImage(img, 0, 0)
  }

  // Step 3: Enhance (white background, contrast, brightness)
  if (enhance || whiteBackground) {
    enhanceDocument(canvas)
  }

  // Return as blob
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve({
        blob,
        width: canvas.width,
        height: canvas.height,
        dataUrl: canvas.toDataURL(outputFormat, quality),
        name: file.name || 'scan.jpg'
      })
    }, outputFormat, quality)
  })
}

// ============================================
// Edge Detection
// ============================================
function detectDocumentEdges(img) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  // Downscale for faster processing
  const scale = Math.min(1, 600 / Math.max(img.width, img.height))
  canvas.width = Math.floor(img.width * scale)
  canvas.height = Math.floor(img.height * scale)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data
  const w = canvas.width
  const h = canvas.height

  // Convert to grayscale
  const gray = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]
    gray[i] = (r * 0.299 + g * 0.587 + b * 0.114) | 0
  }

  // Simple Sobel edge detection
  const edges = new Uint8Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const gx = -gray[i - w - 1] + gray[i - w + 1]
                - 2 * gray[i - 1] + 2 * gray[i + 1]
                - gray[i + w - 1] + gray[i + w + 1]
      const gy = -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1]
                + gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1]
      const mag = Math.sqrt(gx * gx + gy * gy)
      edges[i] = mag > 50 ? 255 : 0
    }
  }

  // Find the bounding box of the strongest edges
  let minX = w, minY = h, maxX = 0, maxY = 0
  let edgeCount = 0
  const threshold = 200

  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      if (edges[y * w + x] > threshold) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
        edgeCount++
      }
    }
  }

  // If we found edges covering a reasonable area
  if (edgeCount > 100 && (maxX - minX) > w * 0.3 && (maxY - minY) > h * 0.3) {
    // Scale back up to original image size
    const scaleBack = 1 / scale
    return {
      x: Math.floor(minX * scaleBack),
      y: Math.floor(minY * scaleBack),
      width: Math.floor((maxX - minX) * scaleBack),
      height: Math.floor((maxY - minY) * scaleBack)
    }
  }

  // Fallback: use full image with some margin
  const margin = Math.min(width, height) * 0.05
  return {
    x: margin,
    y: margin,
    width: width - 2 * margin,
    height: height - 2 * margin
  }
}

// ============================================
// Perspective Transform (basic 4-point)
// ============================================
function applyPerspectiveTransform(img, cropBox) {
  // For simplicity, we do a basic crop (not full perspective)
  // Full perspective would need a math library like gl-matrix
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  canvas.width = cropBox.width
  canvas.height = cropBox.height

  // Draw the cropped region (this is a simple crop, not true perspective)
  ctx.drawImage(
    img,
    cropBox.x, cropBox.y, cropBox.width, cropBox.height,
    0, 0, canvas.width, canvas.height
  )

  return {
    width: canvas.width,
    height: canvas.height,
    imageData: ctx.getImageData(0, 0, canvas.width, canvas.height)
  }
}

// ============================================
// Document Enhancement
// ============================================
function enhanceDocument(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data
  const len = data.length

  // Auto white-balance + contrast + brightness
  // Find the brightest and darkest pixels
  let minVal = 255, maxVal = 0
  for (let i = 0; i < len; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2]
    const lum = (r * 0.299 + g * 0.587 + b * 0.114) | 0
    if (lum < minVal) minVal = lum
    if (lum > maxVal) maxVal = lum
  }

  // Stretch contrast to full range
  const range = maxVal - minVal
  if (range > 20) {
    const scale = 255 / range
    const offset = -minVal * scale
    for (let i = 0; i < len; i += 4) {
      let r = data[i] * scale + offset
      let g = data[i + 1] * scale + offset
      let b = data[i + 2] * scale + offset
      // Slight blue channel boost for whiter whites
      if (r > 200 && g > 200 && b > 200) {
        const boost = 1.05
        r = Math.min(255, r * boost)
        g = Math.min(255, g * boost)
        b = Math.min(255, b * boost)
      }
      data[i] = r | 0
      data[i + 1] = g | 0
      data[i + 2] = b | 0
    }
  }

  ctx.putImageData(imageData, 0, 0)
}

// ============================================
// Build a multi-page PDF from multiple scanned images
// Uses canvas + jsPDF (loaded dynamically)
// ============================================
export async function buildScannedPDF(scans, options = {}) {
  const { quality = 0.85, pageSize = 'a4' } = options

  // Dynamic import to keep main bundle small
  const { jsPDF } = await import('jspdf')

  if (!scans || scans.length === 0) {
    throw new Error('No scans provided')
  }

  // Load first image to determine page size
  const firstImg = await loadImage(scans[0].dataUrl)
  let pdf = null

  for (let i = 0; i < scans.length; i++) {
    const scan = scans[i]
    const img = await loadImage(scan.dataUrl)

    if (!pdf) {
      // Create PDF with the first image's aspect ratio
      const orientation = img.width > img.height ? 'landscape' : 'portrait'
      pdf = new jsPDF({
        orientation,
        unit: 'pt',
        format: pageSize === 'fit' ? [img.width, img.height] : pageSize
      })
    } else {
      pdf.addPage()
    }

    // Add the image, scaled to fit the page
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 20

    const imgRatio = img.width / img.height
    const pageRatio = (pageWidth - margin * 2) / (pageHeight - margin * 2)

    let renderWidth, renderHeight
    if (imgRatio > pageRatio) {
      renderWidth = pageWidth - margin * 2
      renderHeight = renderWidth / imgRatio
    } else {
      renderHeight = pageHeight - margin * 2
      renderWidth = renderHeight * imgRatio
    }

    const x = (pageWidth - renderWidth) / 2
    const y = (pageHeight - renderHeight) / 2

    pdf.addImage(scan.dataUrl, 'JPEG', x, y, renderWidth, renderHeight, undefined, 'FAST')
  }

  const blob = pdf.output('blob')
  return { blob, name: 'scanned_document.pdf' }
}

// ============================================
// Process a single scan with default settings
// (auto-crop + enhance + white BG)
// ============================================
export async function quickScan(file) {
  return processScannedImage(file, {
    autoCrop: true,
    enhance: true,
    whiteBackground: true,
    outputFormat: 'image/jpeg',
    quality: 0.92
  })
}
