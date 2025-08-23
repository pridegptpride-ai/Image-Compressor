(() => {
  const iconAdd = document.getElementById('icon-add');
  const deleteAllBtn = document.getElementById('icon-delete-all');
  const downloadAllBtn = document.getElementById('download-all');
  const filterSelect = document.getElementById('filter-select');

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
  const qualityDecrease = document.getElementById('quality-decrease');
  const qualityIncrease = document.getElementById('quality-increase');

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

  function generateId() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
  function formatBytes(bytes) { if (bytes < 1024) return `${bytes} B`; const kb = bytes / 1024; if (kb < 1024) return `${kb.toFixed(1)} KB`; const mb = kb / 1024; return `${mb.toFixed(2)} MB`; }
  function computeReduction(originalBytes, compressedBytes) { if (!originalBytes || !compressedBytes) return '—'; const reduction = (1 - compressedBytes / originalBytes) * 100; return `${reduction.toFixed(1)}% smaller`; }

  function setEmptyState() {
    const has = images.length > 0;
    emptyState.style.display = has ? 'none' : '';
    deleteAllBtn.disabled = !has;
    deleteAllBtn.style.display = has ? '' : 'none';
    downloadAllBtn.disabled = !has;
  }
  function toggleFrame(showFrame) { uploadFrame.style.display = showFrame ? '' : 'none'; compareViewport.style.display = showFrame ? 'none' : ''; }

  function clearPreview() {
    baseImg.src = '';
    overlayImg.src = '';
    originalMeta.textContent = '—';
    compressedMeta.textContent = '—';
    statsEl.textContent = '—';
    toggleFrame(true);
  }

  function getSelected() { return images.find(i => i.id === selectedId); }

  async function compressFile(file, qualityPercent) {
    // Ensure highest quality by default; only reduce when requested
    const imgBitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = imgBitmap.width;
    canvas.height = imgBitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(imgBitmap, 0, 0);

    const isPng = file.type.includes('png');
    const mimeType = isPng ? 'image/png' : 'image/jpeg';
    const q = isPng ? 1 : Math.min(Math.max(qualityPercent / 100, 0.01), 1);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, mimeType, q));
    return blob || file;
  }

  async function ensureCompressed(item, quality) {
    if (item.cachedCompressed && item.cachedCompressed.quality === quality) return item.cachedCompressed;
    showProcessing('Compressing image...');
    const blob = await compressFile(item.file, quality);
    hideProcessing();
    if (item.cachedCompressed && item.cachedCompressed.url) URL.revokeObjectURL(item.cachedCompressed.url);
    const url = URL.createObjectURL(blob);
    item.cachedCompressed = { quality, blob, url };
    return item.cachedCompressed;
  }

  async function selectImage(id) {
    selectedId = id;
    const item = getSelected();
    if (!item) return;

    baseImg.src = item.url;
    originalMeta.textContent = `${item.name} • ${formatBytes(item.originalBytes)}`;
    toggleFrame(false);

    const quality = parseInt(qualityRange.value, 10);
    const c = await ensureCompressed(item, quality);
    overlayImg.src = c.url;
    compressedMeta.textContent = `${item.name.replace(/(\.[^.]+)$/,'-compressed$1')} • ${formatBytes(c.blob.size)}`;
    statsEl.textContent = `${computeReduction(item.originalBytes, c.blob.size)} • Original: ${formatBytes(item.originalBytes)} → Compressed: ${formatBytes(c.blob.size)}`;

    imageListEl.querySelectorAll('.image-card').forEach(card => { card.classList.toggle('selected', card.dataset.id === id); });
  }

  function renderList() {
    imageListEl.innerHTML = '';
    for (const item of images) {
      const node = template.content.firstElementChild.cloneNode(true);
      node.dataset.id = item.id;
      node.querySelector('img.thumb').src = item.url;
      node.querySelector('img.thumb').alt = item.name;

      node.addEventListener('click', () => selectImage(item.id));

      node.querySelector('.remove').addEventListener('click', (e) => {
        e.stopPropagation();
        pendingDeleteAll = false;
        pendingDeleteId = item.id;
        modalTitle.textContent = 'Delete this image?';
        modalDesc.textContent = 'This will remove the selected image from the list.';
        if (typeof confirmModal.showModal === 'function') confirmModal.showModal();
      });

      node.querySelector('[data-action="copy"]').addEventListener('click', async (e) => {
        e.stopPropagation();
        const it = images.find(i => i.id === item.id);
        const quality = parseInt(qualityRange.value, 10);
        const c = await ensureCompressed(it, quality);
        try {
          await navigator.clipboard.write([ new ClipboardItem({ [c.blob.type]: c.blob }) ]);
          toast('Compressed image copied');
        } catch {
          toast('Copy not supported in this browser');
        }
      });

      node.querySelector('[data-action="download"]').addEventListener('click', async (e) => {
        e.stopPropagation();
        const it = images.find(i => i.id === item.id);
        const quality = parseInt(qualityRange.value, 10);
        const c = await ensureCompressed(it, quality);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(c.blob);
        a.download = it.name.replace(/(\.[^.]+)$/, '-compressed$1');
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      });

      imageListEl.prepend(node);
    }
  }

  function sortList(mode) {
    if (mode === 'az') images.sort((a,b) => a.name.localeCompare(b.name));
    else if (mode === 'za') images.sort((a,b) => b.name.localeCompare(a.name));
    else if (mode === 'big') images.sort((a,b) => b.originalBytes - a.originalBytes);
    else if (mode === 'small') images.sort((a,b) => a.originalBytes - b.originalBytes);
    renderList();
  }

  function setEmptyAndRender() { setEmptyState(); renderList(); if (images.length) selectImage(images[images.length - 1].id); else clearPreview(); }

  function addFiles(fileList) {
    const files = Array.from(fileList).filter(f => f && f.type.startsWith('image/'));
    if (!files.length) return;
    for (const file of files) {
      const id = generateId();
      const url = URL.createObjectURL(file);
      images.push({ id, file, url, originalBytes: file.size, name: file.name, type: file.type });
    }
    setEmptyAndRender();
  }

  function removeImage(id) {
    const idx = images.findIndex(i => i.id === id);
    if (idx === -1) return;
    const item = images[idx];
    URL.revokeObjectURL(item.url);
    if (item.cachedCompressed) URL.revokeObjectURL(item.cachedCompressed.url);
    images.splice(idx, 1);
    setEmptyAndRender();
  }

  function removeAllImages() {
    images.forEach(i => { URL.revokeObjectURL(i.url); if (i.cachedCompressed) URL.revokeObjectURL(i.cachedCompressed.url); });
    images.splice(0, images.length);
    setEmptyAndRender();
  }

  async function downloadAll() {
    if (!images.length) return;
    const zipNamePrefix = 'compressed-';
    // Fallback simple sequential downloads if JSZip not used: trigger multiple downloads
    for (const it of images) {
      const quality = parseInt(qualityRange.value, 10);
      const c = await ensureCompressed(it, quality);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(c.blob);
      a.download = it.name.replace(/(\.[^.]+)$/, '-compressed$1');
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
  }

  // Quality controls
  function syncQualityInputs(val) {
    const v = Math.max(1, Math.min(100, parseInt(val || '100', 10)));
    qualityRange.value = String(v);
    qualityValueInput.value = String(v);
    const current = getSelected();
    if (current) ensureCompressed(current, v).then(c => {
      overlayImg.src = c.url;
      compressedMeta.textContent = `${current.name.replace(/(\.[^.]+)$/,'-compressed$1')} • ${formatBytes(c.blob.size)}`;
      statsEl.textContent = `${computeReduction(current.originalBytes, c.blob.size)} • Original: ${formatBytes(current.originalBytes)} → Compressed: ${formatBytes(c.blob.size)}`;
    });
  }

  // Divider drag
  let isDragging = false, rafId = null, pendingX = null;
  function setSplitFromClientX(clientX) { const rect = compareViewport.getBoundingClientRect(); const x = Math.min(Math.max(clientX - rect.left, 0), rect.width); const pct = (x / rect.width) * 100; compareViewport.style.setProperty('--split', pct + '%'); }
  function scheduleSplitUpdate(clientX){ pendingX = clientX; if (rafId) return; rafId = requestAnimationFrame(() => { setSplitFromClientX(pendingX); rafId = null; }); }
  function onPointerMove(e){ if (!isDragging) return; scheduleSplitUpdate(e.clientX); }
  handle.addEventListener('pointerdown', (e) => { isDragging = true; handle.setPointerCapture(e.pointerId); scheduleSplitUpdate(e.clientX); e.stopPropagation(); });
  window.addEventListener('pointerup', () => { isDragging = false; });
  window.addEventListener('pointermove', onPointerMove);

  // Events
  iconAdd.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => { const files = e.target.files; if (files && files.length) addFiles(files); e.target.value = ''; });

  filterSelect.addEventListener('change', (e) => { sortList(e.target.value); });

  deleteAllBtn.addEventListener('click', () => {
    pendingDeleteAll = true; pendingDeleteId = null; modalTitle.textContent = 'Delete all images?'; modalDesc.textContent = 'This action will remove all uploaded images.';
    if (typeof confirmModal.showModal === 'function') confirmModal.showModal(); else if (confirm('Delete all images?')) removeAllImages();
  });
  cancelDelete.addEventListener('click', () => confirmModal.close());
  confirmDelete.addEventListener('click', () => { if (pendingDeleteAll) removeAllImages(); if (pendingDeleteId) removeImage(pendingDeleteId); pendingDeleteAll = false; pendingDeleteId = null; confirmModal.close(); });

  downloadAllBtn.addEventListener('click', downloadAll);

  qualityRange.addEventListener('input', () => syncQualityInputs(qualityRange.value));
  qualityValueInput.addEventListener('change', () => syncQualityInputs(qualityValueInput.value));
  qualityDecrease.addEventListener('click', () => syncQualityInputs(parseInt(qualityRange.value,10) - 1));
  qualityIncrease.addEventListener('click', () => syncQualityInputs(parseInt(qualityRange.value,10) + 1));

  // Drag and drop support
  const enableDrop = (el) => { el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag-over'); }); el.addEventListener('dragleave', () => { el.classList.remove('drag-over'); }); el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('drag-over'); if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { addFiles(e.dataTransfer.files); } }); };
  uploadFrame.addEventListener('click', () => fileInput.click());
  enableDrop(uploadFrame);
  enableDrop(compareViewport);
  compareViewport.addEventListener('click', () => { if (!images.length) fileInput.click(); });

  // Init defaults
  syncQualityInputs(100);
  toggleFrame(true);
  setEmptyState();
})();