const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
let img = new Image();
let originalImageSrc = null;

let historyStack = [];
let redoStack = [];
const MAX_HISTORY = 5;

let currentTool = 'none';
let isDrawing = false;
let startX = 0, startY = 0;
let cropRect = { x: 0, y: 0, w: 0, h: 0 };
let isCroppingActive = false;
let cleanCropSnapshot = null;
let imageAspectRatio = 1;

// Theme Initialization based on user browser/system settings
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
if (!prefersDark) {
  document.body.classList.add('light-mode');
}

document.getElementById('themeToggleBtn').addEventListener('click', () => {
  document.body.classList.toggle('light-mode');
});

const highlighterColors = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#fed7aa', '#e9d5ff', '#99f6e4', '#fecaca'];
let selectedHighlighterColor = highlighterColors[0];

// Initialize Swatches
const swatchContainer = document.getElementById('highlighterSwatches');
highlighterColors.forEach((color, idx) => {
  const div = document.createElement('div');
  div.className = `swatch ${idx === 0 ? 'active' : ''}`;
  div.style.backgroundColor = color;
  div.onclick = () => {
    document.querySelectorAll('#highlighterSwatches .swatch').forEach(s => s.classList.remove('active'));
    div.classList.add('active');
    selectedHighlighterColor = color;
  };
  swatchContainer.appendChild(div);
});

// File input & Drag-Drop listeners
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

document.getElementById('browseBtn').addEventListener('click', () => fileInput.click());
document.getElementById('openImageBtn').addEventListener('click', () => fileInput.click());
document.getElementById('demoBtn').addEventListener('click', loadDemoImage);

fileInput.onchange = (e) => {
  if (e.target.files && e.target.files[0]) {
    const reader = new FileReader();
    reader.onload = (event) => initImage(event.target.result);
    reader.readAsDataURL(e.target.files[0]);
  }
};

window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
    const reader = new FileReader();
    reader.onload = (event) => initImage(event.target.result);
    reader.readAsDataURL(e.dataTransfer.files[0]);
  }
});

function loadDemoImage() {
  const svgData = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600">
    <defs>
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1e293b"/>
        <stop offset="100%" stop-color="#3b82f6"/>
      </linearGradient>
    </defs>
    <rect width="900" height="600" fill="url(#grad)"/>
    <circle cx="450" cy="300" r="150" fill="rgba(255,255,255,0.1)" stroke="#60a5fa" stroke-width="6"/>
    <text x="450" y="285" fill="#ffffff" font-family="system-ui" font-size="42" font-weight="bold" text-anchor="middle">Shafiart</text>
    <text x="450" y="330" fill="#93c5fd" font-family="system-ui" font-size="20" text-anchor="middle">Smart Canvas Image Editor</text>
  </svg>`;
  initImage('data:image/svg+xml;base64,' + btoa(svgData));
}

function initImage(src) {
  originalImageSrc = src;
  img.onload = () => {
    canvas.width = Math.round(img.width);
    canvas.height = Math.round(img.height);
    imageAspectRatio = canvas.width / canvas.height;
    ctx.drawImage(img, 0, 0);
    document.getElementById('resizeW').value = canvas.width;
    document.getElementById('resizeH').value = canvas.height;
    updateDimLabel();
    dropZone.classList.add('hidden');
    historyStack = [];
    redoStack = [];
    pushHistory();
  };
  img.src = src;
}

// Startup: check chrome storage for right-clicked image
window.addEventListener('DOMContentLoaded', () => {
  const yearEl = document.getElementById('currentYear');
  if (yearEl) yearEl.innerText = new Date().getFullYear();
  
  const urlParams = new URLSearchParams(window.location.search);
  let imageParam = urlParams.get('img');

  if (imageParam) {
    // 1. Strip leading/trailing single or double quotes
    imageParam = imageParam.replace(/^['"]|['"]$/g, '').trim();

    // 2. Decode the parameter
    let decodedUrl = decodeURIComponent(imageParam);

    // 3. Auto-prepend 'file://' protocol if no protocol (://) exists
    if (!decodedUrl.includes('://')) {
      // If it starts with a slash (absolute path), prefix with file:// -> file:///mnt/...
      // Otherwise, ensure it's formatted as a proper file URI
      decodedUrl = decodedUrl.startsWith('/') ? `file://${decodedUrl}` : `file:///${decodedUrl}`;
    }

    console.log("Processed Image URL:", decodedUrl);
    
    if (typeof initImage === 'function') {
      initImage(decodedUrl);
    } else {
      console.error("initImage function is not defined!");
    }
  } else {
    // 4. Fallback to Chrome storage (standard right-click menu flow)
    chrome.storage.local.get(['canvasEditorImage'], (result) => {
      if (result.canvasEditorImage) {
        initImage(result.canvasEditorImage);
        chrome.storage.local.remove(['canvasEditorImage']);
      }
    });
  }
});

function updateDimLabel() {
  document.getElementById('canvasDimLabel').innerText = `${Math.round(canvas.width)} x ${Math.round(canvas.height)} px`;
}

// History Management
function pushHistory() {
  if (historyStack.length >= MAX_HISTORY) historyStack.shift();
  historyStack.push(canvas.toDataURL());
  redoStack = [];
  updateHistoryButtons();
}

function undo() {
  if (historyStack.length <= 1) return;
  redoStack.push(historyStack.pop());
  restoreState(historyStack[historyStack.length - 1]);
  updateHistoryButtons();
}

function redo() {
  if (redoStack.length === 0) return;
  const nextState = redoStack.pop();
  historyStack.push(nextState);
  restoreState(nextState);
  updateHistoryButtons();
}

function restoreState(dataUrl) {
  const tempImg = new Image();
  tempImg.onload = () => {
    canvas.width = Math.round(tempImg.width);
    canvas.height = Math.round(tempImg.height);
    imageAspectRatio = canvas.width / canvas.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tempImg, 0, 0);
    document.getElementById('resizeW').value = canvas.width;
    document.getElementById('resizeH').value = canvas.height;
    updateDimLabel();
  };
  tempImg.src = dataUrl;
}

function updateHistoryButtons() {
  document.getElementById('undoBtn').disabled = historyStack.length <= 1;
  document.getElementById('redoBtn').disabled = redoStack.length === 0;
}

// Aspect Ratio Linked Inputs
const resizeWInput = document.getElementById('resizeW');
const resizeHInput = document.getElementById('resizeH');
const aspectLockCheckbox = document.getElementById('aspectLock');
let isResizingAspect = false;

resizeWInput.addEventListener('input', () => {
  if (isResizingAspect || !aspectLockCheckbox.checked) return;
  const newW = parseFloat(resizeWInput.value);
  if (!isNaN(newW) && newW > 0 && imageAspectRatio > 0) {
    isResizingAspect = true;
    resizeHInput.value = Math.round(newW / imageAspectRatio);
    isResizingAspect = false;
  }
});

resizeHInput.addEventListener('input', () => {
  if (isResizingAspect || !aspectLockCheckbox.checked) return;
  const newH = parseFloat(resizeHInput.value);
  if (!isNaN(newH) && newH > 0 && imageAspectRatio > 0) {
    isResizingAspect = true;
    resizeWInput.value = Math.round(newH * imageAspectRatio);
    isResizingAspect = false;
  }
});

// Event Bindings for Controls
document.getElementById('toolSelect').addEventListener('change', (e) => {
  currentTool = e.target.value;
  ['Crop', 'Highlighter', 'Text', 'Shape'].forEach(t => {
    document.getElementById(`panel${t}`).style.display = (t.toLowerCase() === currentTool) ? 'block' : 'none';
  });

  if (currentTool === 'crop') {
    cleanCropSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    isCroppingActive = false;
  } else if (isCroppingActive) {
    cancelCrop();
  }
});

document.getElementById('shapeType').addEventListener('change', toggleShapeControls);
function toggleShapeControls() {
  const st = document.getElementById('shapeType').value;
  document.getElementById('groupCornerRadius').style.display = (st === 'roundRect') ? 'block' : 'none';
  document.getElementById('groupLineWidth').style.display = (st !== 'line') ? 'block' : 'none';
  document.getElementById('groupBorderColor').style.display = 'block';
  document.getElementById('groupFillColor').style.display = (st === 'line') ? 'none' : 'block';
}
toggleShapeControls();

document.getElementById('confirmCropBtn').addEventListener('click', applyCrop);
document.getElementById('cancelCropBtn').addEventListener('click', cancelCrop);
document.getElementById('rotMinus90').addEventListener('click', () => rotateImage(-90));
document.getElementById('rotPlus90').addEventListener('click', () => rotateImage(90));

document.getElementById('customAngle').addEventListener('input', (e) => {
  document.getElementById('angleVal').innerText = e.target.value;
});
document.getElementById('customAngle').addEventListener('change', (e) => {
  rotateImage(parseInt(e.target.value));
  e.target.value = 0;
  document.getElementById('angleVal').innerText = '0';
});

document.getElementById('resizeBtn').addEventListener('click', applyResize);
document.getElementById('grayscaleBtn').addEventListener('click', applyGrayscale);
document.getElementById('undoBtn').addEventListener('click', undo);
document.getElementById('redoBtn').addEventListener('click', redo);
document.getElementById('copyBtn').addEventListener('click', copyImageToClipboard);
document.getElementById('resetBtn').addEventListener('click', () => { if (originalImageSrc) initImage(originalImageSrc); });
document.getElementById('downloadBtn').addEventListener('click', saveImage);

// Input ranges live display updates
document.getElementById('highlighterSize').addEventListener('input', (e) => {
  document.getElementById('highlighterSizeVal').innerText = e.target.value;
});
document.getElementById('highlighterOpacity').addEventListener('input', (e) => {
  document.getElementById('highlighterOpacityVal').innerText = e.target.value;
});
document.getElementById('shapeRadius').addEventListener('input', (e) => {
  document.getElementById('radiusVal').innerText = e.target.value;
});
document.getElementById('shapeBorderWidth').addEventListener('input', (e) => {
  document.getElementById('shapeBorderWidthVal').innerText = e.target.value;
});

// Canvas Coordinate Mapping
function getCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

let snapshot = null;

canvas.onmousedown = (e) => {
  const coords = getCanvasCoords(e);
  startX = coords.x;
  startY = coords.y;

  if (currentTool === 'text') {
    drawText(startX, startY);
    return;
  }

  isDrawing = true;

  if (currentTool === 'crop') {
    isCroppingActive = true;
    cropRect = { x: startX, y: startY, w: 0, h: 0 };
    if (!cleanCropSnapshot) {
      cleanCropSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }
  } else {
    snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
  }
};

canvas.onmousemove = (e) => {
  if (!isDrawing) return;

  const coords = getCanvasCoords(e);

  if (currentTool === 'highlighter') {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = selectedHighlighterColor;
    ctx.lineWidth = parseInt(document.getElementById('highlighterSize').value);
    ctx.globalAlpha = parseInt(document.getElementById('highlighterOpacity').value) / 100;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
    ctx.restore();
    startX = coords.x;
    startY = coords.y;
  } else if (currentTool === 'shape') {
    ctx.putImageData(snapshot, 0, 0);
    drawShapePreview(startX, startY, coords.x, coords.y);
  } else if (currentTool === 'crop' && isCroppingActive) {
    ctx.putImageData(cleanCropSnapshot, 0, 0);
    cropRect.w = coords.x - startX;
    cropRect.h = coords.y - startY;
    
    ctx.save();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    let rx = cropRect.w < 0 ? startX + cropRect.w : startX;
    let ry = cropRect.h < 0 ? startY + cropRect.h : startY;
    let rw = Math.abs(cropRect.w);
    let rh = Math.abs(cropRect.h);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
    ctx.fillRect(rx, ry, rw, rh);
    ctx.restore();
  }
};

canvas.onmouseup = () => {
  if (isDrawing) {
    isDrawing = false;
    if (currentTool !== 'crop') {
      pushHistory();
    }
  }
};

function drawText(x, y) {
  const text = document.getElementById('textContent').value;
  const size = document.getElementById('textSize').value;
  const font = document.getElementById('textFont').value;
  const color = document.getElementById('textColor').value;

  ctx.save();
  ctx.font = `${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.fillText(text, x, y);
  ctx.restore();
  pushHistory();
}

function drawShapePreview(x1, y1, x2, y2) {
  const st = document.getElementById('shapeType').value;
  const borderWidth = parseInt(document.getElementById('shapeBorderWidth').value);
  const borderColor = document.getElementById('shapeBorderColor').value;
  const fillColor = document.getElementById('shapeFillColor').value;
  const fillOpacity = parseFloat(document.getElementById('shapeFillOpacity').value);

  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = borderWidth;
  
  const r = parseInt(fillColor.slice(1,3), 16);
  const g = parseInt(fillColor.slice(3,5), 16);
  const b = parseInt(fillColor.slice(5,7), 16);
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${fillOpacity})`;

  if (st === 'rect') {
    ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
  } else if (st === 'roundRect') {
    const radius = parseInt(document.getElementById('shapeRadius').value);
    const w = x2 - x1;
    const h = y2 - y1;
    ctx.beginPath();
    ctx.roundRect(x1, y1, w, h, radius);
    ctx.fill();
    ctx.stroke();
  } else if (st === 'circle') {
    const rx = (x2 - x1) / 2;
    const ry = (y2 - y1) / 2;
    const cx = x1 + rx;
    const cy = y1 + ry;
    ctx.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), 0, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  } else if (st === 'line') {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = borderWidth;
    ctx.stroke();
  }
  ctx.restore();
}

function applyCrop() {
  if (!isCroppingActive || !cleanCropSnapshot) return;

  let rx = Math.round(cropRect.w < 0 ? startX + cropRect.w : startX);
  let ry = Math.round(cropRect.h < 0 ? startY + cropRect.h : startY);
  let rw = Math.round(Math.abs(cropRect.w));
  let rh = Math.round(Math.abs(cropRect.h));

  rx = Math.max(0, Math.min(rx, cleanCropSnapshot.width));
  ry = Math.max(0, Math.min(ry, cleanCropSnapshot.height));
  rw = Math.min(rw, cleanCropSnapshot.width - rx);
  rh = Math.min(rh, cleanCropSnapshot.height - ry);

  if (rw < 10 || rh < 10) { cancelCrop(); return; }

  ctx.putImageData(cleanCropSnapshot, 0, 0);

  const croppedData = ctx.getImageData(rx, ry, rw, rh);
  canvas.width = rw;
  canvas.height = rh;
  imageAspectRatio = canvas.width / canvas.height;
  ctx.putImageData(croppedData, 0, 0);
  document.getElementById('resizeW').value = rw;
  document.getElementById('resizeH').value = rh;
  
  isCroppingActive = false;
  cleanCropSnapshot = null;
  currentTool = 'none';
  document.getElementById('toolSelect').value = 'none';
  ['Crop', 'Highlighter', 'Text', 'Shape'].forEach(t => document.getElementById(`panel${t}`).style.display = 'none');
  updateDimLabel();
  pushHistory();
}

function cancelCrop() {
  isCroppingActive = false;
  if (cleanCropSnapshot) {
    ctx.putImageData(cleanCropSnapshot, 0, 0);
    cleanCropSnapshot = null;
  }
}

function rotateImage(deg) {
  const rad = (deg * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const w = canvas.width;
  const h = canvas.height;
  const nw = Math.round(w * cos + h * sin);
  const nh = Math.round(w * sin + h * cos);

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = w;
  tempCanvas.height = h;
  tempCanvas.getContext('2d').drawImage(canvas, 0, 0);

  canvas.width = nw;
  canvas.height = nh;
  imageAspectRatio = canvas.width / canvas.height;
  ctx.clearRect(0, 0, nw, nh);
  ctx.save();
  ctx.translate(nw / 2, nh / 2);
  ctx.rotate(rad);
  ctx.drawImage(tempCanvas, -w / 2, -h / 2);
  ctx.restore();

  document.getElementById('resizeW').value = nw;
  document.getElementById('resizeH').value = nh;
  updateDimLabel();
  pushHistory();
}

function applyResize() {
  const w = Math.round(parseFloat(document.getElementById('resizeW').value));
  const h = Math.round(parseFloat(document.getElementById('resizeH').value));
  if (!w || !h || w <= 0 || h <= 0) return;

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;
  tempCanvas.getContext('2d').drawImage(canvas, 0, 0);

  canvas.width = w;
  canvas.height = h;
  imageAspectRatio = canvas.width / canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(tempCanvas, 0, 0, w, h);
  document.getElementById('resizeW').value = w;
  document.getElementById('resizeH').value = h;
  updateDimLabel();
  pushHistory();
}

function applyGrayscale() {
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    let avg = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
    d[i] = avg; d[i + 1] = avg; d[i + 2] = avg;
  }
  ctx.putImageData(imgData, 0, 0);
  pushHistory();
}

function copyImageToClipboard() {
  canvas.toBlob(async (blob) => {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      const btn = document.getElementById('copyBtn');
      const originalText = btn.innerText;
      btn.innerText = 'Copied!';
      btn.style.background = '#10b981';
      btn.style.color = '#fff';
      setTimeout(() => {
        btn.innerText = originalText;
        btn.style.background = '';
        btn.style.color = '';
      }, 2000);
    } catch (err) {
      alert('Failed to copy image to clipboard.');
    }
  }, 'image/png');
}

function saveImage() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  
  const filename = `shafiart-${yyyy}-${mm}-${dd}-${hh}-${min}-${ss}.png`;

  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

