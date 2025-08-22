(() => {
  const fileInput = document.getElementById('file-input');
  const deleteAllBtn = document.getElementById('delete-all');
  const imageListEl = document.getElementById('image-list');
  const emptyState = document.getElementById('empty-state');
  const template = document.getElementById('image-card-template');

  const baseImg = document.getElementById('base-img');
  const overlayImg = document.getElementById('overlay-img');
  const originalMeta = document.getElementById('original-meta');
  const compressedMeta = document.getElementById('compressed-meta');
  const statsEl = document.getElementById('stats');

  const qualityRange = document.getElementById('quality-range');
  const qualityValue = document.getElementById('quality-value');

  const maxSizeInput = document.getElementById('max-size');
  const applyMaxBtn = document.getElementById('apply-max');

  const confirmModal = document.getElementById('confirm-modal');
  const cancelDelete = document.getElementById('cancel-delete');
  const confirmDelete = document.getElementById('confirm-delete');
  const modalTitle = confirmModal.querySelector('h3');
  const modalDesc = confirmModal.querySelector('p');

  const dragDivider = document.getElementById('drag-divider');
  const compareViewport = document.getElementById('compare-viewport');
  const placeholderBtn = document.getElementById('placeholder');
  const processingEl = document.getElementById('processing');
  const processingText = document.getElementById('processing-text');

  /** State */
  /** @type {{id:string, file:File, url:string, originalBytes:number, name:string, type:string}[]} */
  const images = [];
  let selectedId = null;
  let currentCompressedBlob = null;
  let pendingDeleteAll = false;
  let pendingDeleteId = null;

  function generateId() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(2)} MB`;
  }

  function computeReduction(originalBytes, compressedBytes) {
    if (!originalBytes || !compressedBytes) return '—';
    const reduction = (1 - compressedBytes / originalBytes) * 100;
    return `${reduction.toFixed(1)}% smaller`;
  }

  function setEmptyState() {
    const has = images.length > 0;
    emptyState.style.display = has ? 'none' : '';
    deleteAllBtn.disabled = !has;
  }

  function togglePlaceholder(show) {
    placeholderBtn.style.display = show ? '' : 'none';
    compareViewport.style.display = show ? 'none' : '';
  }

  function clearPreview() {
    baseImg.src = '';
    overlayImg.src = '';
    originalMeta.textContent = '—';
    compressedMeta.textContent = '—';
    statsEl.textContent = '—';
    currentCompressedBlob = null;
    togglePlaceholder(true);
  }

  function selectImage(id) {
    selectedId = id;
    const item = images.find(i => i.id === id);
    if (!item) return;

    baseImg.src = item.url; // left side = original
    originalMeta.textContent = `${item.name} • ${formatBytes(item.originalBytes)}`;
    togglePlaceholder(false);

    // Recompute compressed overlay
    compressSelected(parseInt(qualityRange.value, 10));

    // Highlight selected card
    imageListEl.querySelectorAll('.image-card').forEach(card => {
      card.classList.toggle('selected', card.dataset.id === id);
    });
  }

  async function compressBlobToQuality(blob, qualityPercent) {
    const imgBitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = imgBitmap.width;
    canvas.height = imgBitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(imgBitmap, 0, 0);

    const mimeType = blob.type.includes('png') ? 'image/png' : 'image/jpeg';
    const quality = mimeType === 'image/jpeg' ? Math.min(Math.max(qualityPercent / 100, 0.01), 1) : 1;

    const newBlob = await new Promise(resolve => canvas.toBlob(resolve, mimeType, quality));
    return newBlob || blob;
  }

  async function compressSelected(qualityPercent) {
    const selected = images.find(i => i.id === selectedId);
    if (!selected) { clearPreview(); return; }

    showProcessing('Compressing image...');
    const compressed = await compressBlobToQuality(selected.file, qualityPercent);
    hideProcessing();

    currentCompressedBlob = compressed;
    const compressedUrl = URL.createObjectURL(compressed);
    overlayImg.src = compressedUrl; // right side = compressed

    compressedMeta.textContent = `${selected.name.replace(/(\.[^.]+)$/,'-compressed$1')} • ${formatBytes(compressed.size)}`;
    statsEl.textContent = `${computeReduction(selected.originalBytes, compressed.size)} • Original: ${formatBytes(selected.originalBytes)} → Compressed: ${formatBytes(compressed.size)}`;
  }

  async function compressToMaxSize(maxKB) {
    const selected = images.find(i => i.id === selectedId);
    if (!selected) return;
    const targetBytes = maxKB * 1024;

    showProcessing('Optimizing to target size...');
    let low = 5, high = 100, best = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const mid = Math.round((low + high) / 2);
      const blob = await compressBlobToQuality(selected.file, mid);
      if (blob.size <= targetBytes) {
        best = {blob, q: mid};
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }
    hideProcessing();

    const candidate = best ? best.blob : await compressBlobToQuality(selected.file, parseInt(qualityRange.value,10));
    currentCompressedBlob = candidate;
    const url = URL.createObjectURL(candidate);
    overlayImg.src = url;
    compressedMeta.textContent = `${selected.name.replace(/(\.[^.]+)$/,'-compressed$1')} • ${formatBytes(candidate.size)}`;
    statsEl.textContent = `${computeReduction(selected.originalBytes, candidate.size)} • Original: ${formatBytes(selected.originalBytes)} → Compressed: ${formatBytes(candidate.size)}`;

    if (best) {
      qualityRange.value = String(best.q);
      qualityValue.textContent = `${best.q}%`;
    }
  }

  function addFiles(fileList) {
    const files = Array.from(fileList).filter(f => f && f.type.startsWith('image/'));
    if (!files.length) return;

    for (const file of files) {
      const id = generateId();
      const url = URL.createObjectURL(file);
      images.push({ id, file, url, originalBytes: file.size, name: file.name, type: file.type });

      const node = template.content.firstElementChild.cloneNode(true);
      node.dataset.id = id;
      const img = node.querySelector('img.thumb');
      img.src = url;
      img.alt = file.name;

      node.querySelector('.remove').addEventListener('click', (e) => {
        e.stopPropagation();
        pendingDeleteAll = false;
        pendingDeleteId = id;
        modalTitle.textContent = 'Delete this image?';
        modalDesc.textContent = 'This will remove the selected image from the list.';
        if (typeof confirmModal.showModal === 'function') confirmModal.showModal();
      });

      node.addEventListener('click', () => selectImage(id));

      node.querySelector('[data-action="copy"]').addEventListener('click', async (e) => {
        e.stopPropagation();
        await copyImage(id);
      });

      node.querySelector('[data-action="download"]').addEventListener('click', (e) => {
        e.stopPropagation();
        downloadImage(id);
      });

      imageListEl.prepend(node);
    }

    setEmptyState();
    selectImage(images[images.length - 1].id);
  }

  function removeImage(id) {
    const idx = images.findIndex(i => i.id === id);
    if (idx === -1) return;

    URL.revokeObjectURL(images[idx].url);
    const card = imageListEl.querySelector(`.image-card[data-id="${id}"]`);
    if (card) card.remove();

    const removedSelected = images[idx].id === selectedId;
    images.splice(idx, 1);

    if (!images.length) {
      selectedId = null;
      clearPreview();
      setEmptyState();
      return;
    }

    if (removedSelected) {
      selectImage(images[0].id);
    }
    setEmptyState();
  }

  function removeAllImages() {
    images.forEach(i => URL.revokeObjectURL(i.url));
    images.splice(0, images.length);
    imageListEl.innerHTML = '';
    selectedId = null;
    clearPreview();
    setEmptyState();
  }

  async function copyImage(id) {
    const imgItem = images.find(i => i.id === id);
    if (!imgItem) return;

    const blobToCopy = (selectedId === id && currentCompressedBlob) ? currentCompressedBlob : imgItem.file;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ [blobToCopy.type]: blobToCopy })
      ]);
      toast('Image copied to clipboard');
    } catch (err) {
      const fallbackBlob = await compressBlobToQuality(blobToCopy, 100);
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ [fallbackBlob.type]: fallbackBlob })
        ]);
        toast('Image copied to clipboard');
      } catch (e) {
        toast('Copy not supported in this browser');
      }
    }
  }

  function downloadImage(id) {
    const imgItem = images.find(i => i.id === id);
    if (!imgItem) return;
    const blob = (selectedId === id && currentCompressedBlob) ? currentCompressedBlob : imgItem.file;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const name = imgItem.name.replace(/(\.[^.]+)$/, '-compressed$1');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Toast helper
  function toast(message) {
    const div = document.createElement('div');
    div.textContent = message;
    div.style.position = 'fixed';
    div.style.left = '50%';
    div.style.bottom = '24px';
    div.style.transform = 'translateX(-50%)';
    div.style.background = 'linear-gradient(90deg, var(--primary), var(--secondary))';
    div.style.color = '#fff';
    div.style.padding = '10px 14px';
    div.style.borderRadius = '12px';
    div.style.boxShadow = 'var(--shadow)';
    div.style.zIndex = '9999';
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 2000);
  }

  // Processing overlay controls
  function showProcessing(text){ processingText.textContent = text || 'Processing...'; processingEl.style.display = 'flex'; }
  function hideProcessing(){ processingEl.style.display = 'none'; }

  // Divider with pointer events; adjust CSS var only (prevents blinking)
  let isDragging = false;
  function setSplitFromClientX(clientX) {
    const rect = compareViewport.getBoundingClientRect();
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    const pct = (x / rect.width) * 100;
    compareViewport.style.setProperty('--split', pct + '%');
  }
  function onPointerMove(e){ if (!isDragging) return; setSplitFromClientX(e.clientX); }
  dragDivider.addEventListener('pointerdown', (e) => {
    isDragging = true; dragDivider.setPointerCapture(e.pointerId); setSplitFromClientX(e.clientX);
  });
  compareViewport.addEventListener('pointerdown', (e) => {
    isDragging = true; compareViewport.setPointerCapture(e.pointerId); setSplitFromClientX(e.clientX);
  });
  window.addEventListener('pointerup', () => { isDragging = false; });
  window.addEventListener('pointermove', onPointerMove);

  // Upload triggers
  fileInput.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files && files.length) addFiles(files);
    // allow repeated uploads of same files
    e.target.value = '';
  });

  placeholderBtn.addEventListener('click', () => fileInput.click());
  // Drag & drop on placeholder/frame
  placeholderBtn.addEventListener('dragover', (e) => { e.preventDefault(); });
  placeholderBtn.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
      addFiles(e.dataTransfer.files);
    }
  });

  deleteAllBtn.addEventListener('click', () => {
    pendingDeleteAll = true;
    pendingDeleteId = null;
    modalTitle.textContent = 'Delete all images?';
    modalDesc.textContent = 'This action will remove all uploaded images.';
    if (typeof confirmModal.showModal === 'function') {
      confirmModal.showModal();
    } else {
      if (confirm('Delete all images?')) removeAllImages();
    }
  });
  cancelDelete.addEventListener('click', () => confirmModal.close());
  confirmDelete.addEventListener('click', () => {
    if (pendingDeleteAll) removeAllImages();
    if (pendingDeleteId) removeImage(pendingDeleteId);
    pendingDeleteAll = false; pendingDeleteId = null;
    confirmModal.close();
  });

  qualityRange.addEventListener('input', () => {
    const q = parseInt(qualityRange.value, 10);
    qualityValue.textContent = `${q}%`;
    compressSelected(q);
  });

  applyMaxBtn.addEventListener('click', () => {
    const maxKB = parseInt(maxSizeInput.value, 10);
    if (!maxKB || maxKB <= 0) { toast('Enter a valid max size in KB'); return; }
    compressToMaxSize(maxKB);
  });

  // Global drag-and-drop support
  document.addEventListener('dragover', (e) => { e.preventDefault(); });
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
      addFiles(e.dataTransfer.files);
    }
  });

  // Initial state
  togglePlaceholder(true);
  setEmptyState();
})();