(() => {
  const iconAdd = document.getElementById('icon-add');
  const deleteAllBtn = document.getElementById('icon-delete-all');
  const downloadAllBtn = document.getElementById('download-all');
  const filterButton = document.getElementById('icon-filter');
  const filterMenu = document.getElementById('filter-menu');
  const resetToolBtn = document.getElementById('reset-tool');

  const fileInput = document.getElementById('file-input');
  const imageListEl = document.getElementById('image-list');
  const emptyState = document.getElementById('empty-state');
  const template = document.getElementById('image-card-template');

  const baseImg = document.getElementById('base-img');
  const overlayImg = document.getElementById('overlay-img');
  const originalMeta = document.getElementById('original-meta');
  const compressedMeta = document.getElementById('compressed-meta');
  const statsEl = document.getElementById('stats');

  const qualityRange = document.getElementById('quality-range');
  const qualityValueInput = document.getElementById('quality-value');

  const maxSizeInput = document.getElementById('max-size');
  const applyMaxBtn = document.getElementById('apply-max');

  const confirmModal = document.getElementById('confirm-modal');
  const cancelDelete = document.getElementById('cancel-delete');
  const confirmDelete = document.getElementById('confirm-delete');
  const modalTitle = confirmModal.querySelector('h3');
  const modalDesc = confirmModal.querySelector('p');

  const dragDivider = document.getElementById('drag-divider');
  const handle = dragDivider.querySelector('.handle');
  const compareViewport = document.getElementById('compare-viewport');
  const uploadFrame = document.getElementById('upload-frame');
  const processingEl = document.getElementById('processing');
  const processingText = document.getElementById('processing-text');

  /** State */
  /** @type {{id:string, file:File, url:string, originalBytes:number, name:string, type:string, cachedCompressed?:{quality:number, blob:Blob, url:string}}[]} */
  const images = [];
  let selectedId = null;
  let pendingDeleteAll = false;
  let pendingDeleteId = null;
  let pendingReset = false;

  // Shared canvas
  let sharedCanvas = document.createElement('canvas');
  let sharedCtx = sharedCanvas.getContext('2d');
  function prepareCanvas(width, height){
    if (sharedCanvas.width !== width) sharedCanvas.width = width;
    if (sharedCanvas.height !== height) sharedCanvas.height = height;
    sharedCtx.clearRect(0,0,sharedCanvas.width,sharedCanvas.height);
  }

  function generateId() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
  function formatBytes(bytes) { if (bytes < 1024) return `${bytes} B`; const kb = bytes / 1024; if (kb < 1024) return `${kb.toFixed(1)} KB`; const mb = kb / 1024; return `${mb.toFixed(2)} MB`; }
  function computeReduction(originalBytes, compressedBytes) { if (!originalBytes || !compressedBytes) return '—'; const reduction = (1 - compressedBytes / originalBytes) * 100; return `${reduction.toFixed(1)}% smaller`; }

  function toast(message) { const div = document.createElement('div'); div.textContent = message; div.style.position = 'fixed'; div.style.left = '50%'; div.style.bottom = '24px'; div.style.transform = 'translateX(-50%)'; div.style.background = 'linear-gradient(90deg, var(--primary), var(--secondary))'; div.style.color = '#fff'; div.style.padding = '10px 14px'; div.style.borderRadius = '12px'; div.style.boxShadow = 'var(--shadow)'; div.style.zIndex = '9999'; document.body.appendChild(div); setTimeout(() => div.remove(), 1800); }

  function setEmptyState() { const has = images.length > 0; emptyState.style.display = has ? 'none' : ''; deleteAllBtn.disabled = !has; deleteAllBtn.style.display = has ? '' : 'none'; downloadAllBtn.disabled = !has; }
  function toggleFrame(showFrame) { uploadFrame.style.display = showFrame ? '' : 'none'; compareViewport.style.display = showFrame ? 'none' : ''; }

  function clearPreview() { baseImg.src = ''; overlayImg.src = ''; originalMeta.textContent = '—'; compressedMeta.textContent = '—'; statsEl.textContent = '—'; toggleFrame(true); }

  function getSelected() { return images.find(i => i.id === selectedId); }

  async function compressBitmapToMime(bitmap, qualityPercent, mime) {
    prepareCanvas(bitmap.width, bitmap.height);
    sharedCtx.drawImage(bitmap, 0, 0);
    const q = mime === 'image/jpeg' ? Math.min(Math.max(qualityPercent / 100, 0.01), 1) : 1;
    const blob = await new Promise(resolve => sharedCanvas.toBlob(resolve, mime, q));
    return blob;
  }

  async function compressFile(file, qualityPercent) {
    // Avoid size inflation: at 100 quality, keep original
    if (qualityPercent >= 100) return file;
    const bitmap = await createImageBitmap(file);
    try {
      const isPng = file.type.includes('png');
      // For PNG, compress to JPEG when quality < 100; otherwise keep original handled above
      const mimeType = isPng ? 'image/jpeg' : 'image/jpeg';
      const blob = await compressBitmapToMime(bitmap, qualityPercent, mimeType);
      return blob || file;
    } finally { try { bitmap.close && bitmap.close(); } catch {} }
  }

  function showProcessing(text){ processingText.textContent = text || 'Processing...'; processingEl.style.display = 'flex'; }
  function hideProcessing(){ processingEl.style.display = 'none'; }

  async function ensureCompressed(item, quality) {
    // Use cache if same quality
    if (item.cachedCompressed && item.cachedCompressed.quality === quality) return item.cachedCompressed;
    let resultBlob;
    if (quality >= 100) {
      resultBlob = item.file; // use original
    } else {
      showProcessing('Compressing image...');
      const trial = await compressFile(item.file, quality);
      hideProcessing();
      // Prefer smaller of original vs recompressed
      resultBlob = trial && trial.size < item.file.size ? trial : item.file;
      if (resultBlob === item.file) quality = 100;
    }
    if (item.cachedCompressed && item.cachedCompressed.url) URL.revokeObjectURL(item.cachedCompressed.url);
    const url = URL.createObjectURL(resultBlob);
    item.cachedCompressed = { quality, blob: resultBlob, url };
    return item.cachedCompressed;
  }

  function updateStats(item, compressedBlob) { compressedMeta.textContent = `${item.name.replace(/(\.[^.]+)$/,'-compressed$1')} • ${formatBytes(compressedBlob.size)}`; statsEl.textContent = `${computeReduction(item.originalBytes, compressedBlob.size)} • Original: ${formatBytes(item.originalBytes)} → Compressed: ${formatBytes(compressedBlob.size)}`; }

  async function selectImage(id) { selectedId = id; const item = getSelected(); if (!item) return; baseImg.src = item.url; originalMeta.textContent = `${item.name} • ${formatBytes(item.originalBytes)}`; toggleFrame(false); const quality = parseInt(qualityRange.value, 10); const c = await ensureCompressed(item, quality); overlayImg.src = c.url; updateStats(item, c.blob); imageListEl.querySelectorAll('.image-card').forEach(card => { card.classList.toggle('selected', card.dataset.id === id); }); }

  async function toPngBlobFromFile(file) { const bitmap = await createImageBitmap(file); try { return await compressBitmapToMime(bitmap, 100, 'image/png'); } finally { try { bitmap.close && bitmap.close(); } catch {} } }
  async function toSameTypeBlob(file) { const bitmap = await createImageBitmap(file); try { return await compressBitmapToMime(bitmap, 100, file.type || 'image/png'); } finally { try { bitmap.close && bitmap.close(); } catch {} } }

  function renderList() { 
    // Clear the list completely to prevent duplicate buttons
    imageListEl.replaceChildren();
    
    for (const item of images) { 
      const node = template.content.firstElementChild.cloneNode(true); 
      node.dataset.id = item.id; 
      
      // Set thumbnail
      const thumb = node.querySelector('img.thumb');
      thumb.src = item.url; 
      thumb.alt = item.name; 
      
      // Add click handler for image selection
      node.addEventListener('click', () => selectImage(item.id)); 
      
      // Add remove button handler
      const removeBtn = node.querySelector('.remove');
      removeBtn.addEventListener('click', (e) => { 
        e.stopPropagation(); 
        pendingDeleteAll = false; 
        pendingDeleteId = item.id; 
        modalTitle.textContent = 'Delete this image?'; 
        modalDesc.textContent = 'This will remove the selected image from the list.'; 
        if (typeof confirmModal.showModal === 'function') confirmModal.showModal(); 
      }); 
      
      // Append the node
      imageListEl.append(node); 
    } 
  }

  function sortList(mode) { if (mode === 'az') images.sort((a,b) => a.name.localeCompare(b.name)); else if (mode === 'za') images.sort((a,b) => b.name.localeCompare(a.name)); else if (mode === 'big') images.sort((a,b) => b.originalBytes - a.originalBytes); else if (mode === 'small') images.sort((a,b) => a.originalBytes - b.originalBytes); renderList(); toast('Sorted'); }

  function setEmptyAndRender() { setEmptyState(); renderList(); if (images.length) selectImage(images[images.length - 1].id); else clearPreview(); }

  function addFiles(fileList) { if (!fileList || !fileList.length) return; showProcessing('Uploading...'); const files = Array.from(fileList).filter(f => f && f.type.startsWith('image/')); for (const file of files) { const id = generateId(); const url = URL.createObjectURL(file); images.push({ id, file, url, originalBytes: file.size, name: file.name, type: file.type }); } hideProcessing(); setEmptyAndRender(); toast('Uploaded'); }

  function removeImage(id) { const idx = images.findIndex(i => i.id === id); if (idx === -1) return; const item = images[idx]; URL.revokeObjectURL(item.url); if (item.cachedCompressed) URL.revokeObjectURL(item.cachedCompressed.url); images.splice(idx, 1); setEmptyAndRender(); toast('Deleted'); }

  function removeAllImages() { images.forEach(i => { URL.revokeObjectURL(i.url); if (i.cachedCompressed) URL.revokeObjectURL(i.cachedCompressed.url); }); images.splice(0, images.length); setEmptyAndRender(); toast('Deleted all'); }

  async function downloadAll() { if (!images.length) return; showProcessing('Downloading all...'); for (const it of images) { const quality = parseInt(qualityRange.value, 10); const c = await ensureCompressed(it, quality); const a = document.createElement('a'); a.href = URL.createObjectURL(c.blob); a.download = it.name.replace(/(\.[^.]+)$/, '-compressed$1'); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); } hideProcessing(); toast('Downloaded'); }

  function syncQualityInputs(val) { const v = Math.max(1, Math.min(100, parseInt(val || '100', 10))); qualityRange.value = String(v); qualityValueInput.value = String(v); const current = getSelected(); if (current) ensureCompressed(current, v).then(c => { overlayImg.src = c.url; updateStats(current, c.blob); }); }

  async function applyMaxSize() {
    const kb = parseFloat(maxSizeInput.value);
    if (!kb || kb <= 0) { toast('Enter valid KB'); return; }
    const item = getSelected(); if (!item) { toast('Select an image'); return; }
    const targetBytes = Math.round(kb * 1024);
    // If target >= original, keep original
    if (targetBytes >= item.file.size) {
      if (item.cachedCompressed && item.cachedCompressed.url) URL.revokeObjectURL(item.cachedCompressed.url);
      const url = item.url;
      item.cachedCompressed = { quality: 100, blob: item.file, url };
      overlayImg.src = url;
      qualityRange.value = '100';
      qualityValueInput.value = '100';
      updateStats(item, item.file);
      toast('Optimized');
      return;
    }
    showProcessing('Optimizing...');
    const tolerance = Math.max(1024, Math.round(targetBytes * 0.02));
    const bitmap = await createImageBitmap(item.file);
    try {
      async function searchForTarget(mime) {
        let low = 1, high = 100;
        let bestBelow = null, bestAbove = null;
        for (let i = 0; i < 12; i++) {
          const mid = Math.round((low + high) / 2);
          const blob = await compressBitmapToMime(bitmap, mid, mime);
          const diff = Math.abs(blob.size - targetBytes);
          if (diff <= tolerance) return { q: mid, blob };
          if (blob.size <= targetBytes) { if (!bestBelow || blob.size > bestBelow.blob.size) bestBelow = { q: mid, blob }; high = mid - 1; }
          else { if (!bestAbove || blob.size < bestAbove.blob.size) bestAbove = { q: mid, blob }; low = mid + 1; }
          await new Promise(r => setTimeout(r, 0));
        }
        return bestBelow || bestAbove;
      }
      const originalMime = item.file.type.includes('png') ? 'image/png' : 'image/jpeg';
      let chosen = await searchForTarget(originalMime);
      if (chosen && chosen.blob.size > targetBytes && originalMime === 'image/png') {
        const jpegTry = await searchForTarget('image/jpeg');
        if (jpegTry && (!chosen || jpegTry.blob.size < chosen.blob.size)) chosen = jpegTry;
      }
      const url = URL.createObjectURL(chosen.blob);
      if (item.cachedCompressed && item.cachedCompressed.url) URL.revokeObjectURL(item.cachedCompressed.url);
      item.cachedCompressed = { quality: chosen.q, blob: chosen.blob, url };
      overlayImg.src = url;
      qualityRange.value = String(chosen.q);
      qualityValueInput.value = String(chosen.q);
      updateStats(item, chosen.blob);
      const ok = chosen.blob.size <= targetBytes + tolerance;
      toast(ok ? 'Optimized' : 'Optimized to best possible');
    } finally { try { bitmap.close && bitmap.close(); } catch {} hideProcessing(); }
  }

  // Divider drag
  let isDragging = false, rafId = null, pendingX = null; function setSplitFromClientX(clientX) { const rect = compareViewport.getBoundingClientRect(); const x = Math.min(Math.max(clientX - rect.left, 0), rect.width); const pct = (x / rect.width) * 100; compareViewport.style.setProperty('--split', pct + '%'); } function scheduleSplitUpdate(clientX){ pendingX = clientX; if (rafId) return; rafId = requestAnimationFrame(() => { setSplitFromClientX(pendingX); rafId = null; }); } function onPointerMove(e){ if (!isDragging) return; scheduleSplitUpdate(e.clientX); } handle.addEventListener('pointerdown', (e) => { isDragging = true; handle.setPointerCapture(e.pointerId); scheduleSplitUpdate(e.clientX); e.stopPropagation(); }); window.addEventListener('pointerup', () => { isDragging = false; }); window.addEventListener('pointermove', onPointerMove);

  // Filter menu events
  filterButton.addEventListener('click', () => { const isHidden = filterMenu.hasAttribute('hidden'); if (isHidden) { filterMenu.removeAttribute('hidden'); filterButton.setAttribute('aria-expanded','true'); } else { filterMenu.setAttribute('hidden',''); filterButton.setAttribute('aria-expanded','false'); } }); filterMenu.addEventListener('click', (e) => { const target = e.target.closest('.menu-item'); if (!target) return; const mode = target.getAttribute('data-sort'); sortList(mode); filterMenu.setAttribute('hidden',''); filterButton.setAttribute('aria-expanded','false'); }); document.addEventListener('click', (e) => { if (!filterMenu.contains(e.target) && e.target !== filterButton) { filterMenu.setAttribute('hidden',''); filterButton.setAttribute('aria-expanded','false'); } }, true);

  // Events
  iconAdd.addEventListener('click', () => fileInput.click()); fileInput.addEventListener('change', (e) => { const files = e.target.files; if (files && files.length) addFiles(files); e.target.value = ''; }); deleteAllBtn.addEventListener('click', () => { pendingDeleteAll = true; pendingDeleteId = null; modalTitle.textContent = 'Delete all images?'; modalDesc.textContent = 'This action will remove all uploaded images.'; if (typeof confirmModal.showModal === 'function') confirmModal.showModal(); else if (confirm('Delete all images?')) removeAllImages(); }); cancelDelete.addEventListener('click', () => confirmModal.close()); confirmDelete.addEventListener('click', () => { if (pendingDeleteAll) removeAllImages(); if (pendingDeleteId) removeImage(pendingDeleteId); pendingDeleteAll = false; pendingDeleteId = null; confirmModal.close(); }); downloadAllBtn.addEventListener('click', downloadAll); qualityRange.addEventListener('input', () => syncQualityInputs(qualityRange.value)); qualityValueInput.addEventListener('change', () => syncQualityInputs(qualityValueInput.value)); applyMaxBtn.addEventListener('click', applyMaxSize);

  resetToolBtn.addEventListener('click', () => { modalTitle.textContent = 'Reset tool?'; modalDesc.textContent = 'This will remove all images and reset all settings.'; pendingReset = true; pendingDeleteAll = false; pendingDeleteId = null; if (typeof confirmModal.showModal === 'function') confirmModal.showModal(); else if (confirm('Reset tool?')) { images.splice(0, images.length); setEmptyAndRender(); resetUIControls(); toast('Reset'); } });
  cancelDelete.addEventListener('click', () => { pendingReset = false; confirmModal.close(); });
  confirmDelete.addEventListener('click', () => { if (pendingReset) { images.forEach(i => { URL.revokeObjectURL(i.url); if (i.cachedCompressed) URL.revokeObjectURL(i.cachedCompressed.url); }); images.splice(0, images.length); setEmptyAndRender(); resetUIControls(); toast('Reset'); pendingReset = false; confirmModal.close(); return; } });

  // Drag and drop support
  const enableDrop = (el) => { el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag-over'); }); el.addEventListener('dragleave', () => { el.classList.remove('drag-over'); }); el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('drag-over'); if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { addFiles(e.dataTransfer.files); } }); };
  uploadFrame.addEventListener('click', () => fileInput.click()); enableDrop(uploadFrame); enableDrop(compareViewport); compareViewport.addEventListener('click', () => { if (!images.length) fileInput.click(); });

  // Event delegation for copy and download buttons
  imageListEl.addEventListener('click', async (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    
    const action = target.getAttribute('data-action');
    const imageCard = target.closest('.image-card');
    if (!imageCard) return;
    
    const imageId = imageCard.dataset.id;
    const item = images.find(i => i.id === imageId);
    if (!item) return;
    
    e.stopPropagation();
    
    if (action === 'copy') {
      try {
        const quality = parseInt(qualityRange.value, 10);
        const c = await ensureCompressed(item, quality);
        await navigator.clipboard.write([
          new ClipboardItem({ [c.blob.type]: c.blob })
        ]);
        toast('Copied');
      } catch (err) {
        try {
          const fallback = await toSameTypeBlob(item.file);
          await navigator.clipboard.write([
            new ClipboardItem({ [fallback.type]: fallback })
          ]);
          toast('Copied');
        } catch (err2) {
          try {
            const png = await toPngBlobFromFile(item.file);
            await navigator.clipboard.write([
              new ClipboardItem({ [png.type]: png })
            ]);
            toast('Copied');
          } catch (err3) {
            toast('Copy not supported');
          }
        }
      }
    } else if (action === 'download') {
      try {
        const quality = parseInt(qualityRange.value, 10);
        const c = await ensureCompressed(item, quality);
        showProcessing('Downloading...');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(c.blob);
        a.download = item.name.replace(/(\.[^.]+)$/, '-compressed$1');
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => {
          URL.revokeObjectURL(a.href);
          hideProcessing();
          toast('Downloaded');
        }, 600);
      } catch (err) {
        hideProcessing();
        toast('Download failed');
      }
    }
  });

  // Init defaults
  syncQualityInputs(100); toggleFrame(true); setEmptyState();
})();