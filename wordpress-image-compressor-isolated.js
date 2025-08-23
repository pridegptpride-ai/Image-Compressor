// Ultra-Isolated WordPress Image Compressor JavaScript - Use with WP Code Inserter
// This version uses completely isolated IDs and won't conflict with WordPress

(function() {
  'use strict';
  
  // Wait for DOM to be ready
  function ready(fn) {
    if (document.readyState !== 'loading') {
      fn();
    } else if (document.addEventListener) {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      document.attachEvent('onreadystatechange', function() {
        if (document.readyState !== 'loading') {
          fn();
        }
      });
    }
  }

  ready(function() {
    // Check if our isolated container exists
    const container = document.getElementById('isolated-image-compressor');
    if (!container) {
      console.log('Isolated Image Compressor: Container not found');
      return;
    }

    // Get all elements with isolated IDs
    const iconAdd = document.getElementById('isolated-icon-add');
    const deleteAllBtn = document.getElementById('isolated-icon-delete-all');
    const downloadAllBtn = document.getElementById('isolated-download-all');
    const filterButton = document.getElementById('isolated-icon-filter');
    const filterMenu = document.getElementById('isolated-filter-menu');
    const resetToolBtn = document.getElementById('isolated-reset-tool');

    const fileInput = document.getElementById('isolated-file-input');
    const imageListEl = document.getElementById('isolated-image-list');
    const emptyState = document.getElementById('isolated-empty-state');
    const template = document.getElementById('isolated-image-card-template');

    const baseImg = document.getElementById('isolated-base-img');
    const overlayImg = document.getElementById('isolated-overlay-img');
    const originalMeta = document.getElementById('isolated-original-meta');
    const compressedMeta = document.getElementById('isolated-compressed-meta');
    const statsEl = document.getElementById('isolated-stats');

    const qualityRange = document.getElementById('isolated-quality-range');
    const qualityValueInput = document.getElementById('isolated-quality-value');

    const maxSizeInput = document.getElementById('isolated-max-size');
    const applyMaxBtn = document.getElementById('isolated-apply-max');

    const confirmModal = document.getElementById('isolated-confirm-modal');
    const cancelDelete = document.getElementById('isolated-cancel-delete');
    const confirmDelete = document.getElementById('isolated-confirm-delete');
    const modalTitle = document.getElementById('isolated-modal-title');
    const modalDesc = document.getElementById('isolated-modal-desc');

    const dragDivider = document.getElementById('isolated-drag-divider');
    const compareViewport = document.getElementById('isolated-compare-viewport');
    const uploadFrame = document.getElementById('isolated-upload-frame');
    const processingEl = document.getElementById('isolated-processing');
    const processingText = document.getElementById('isolated-processing-text');

    // Check if all required elements exist
    if (!iconAdd || !imageListEl || !template) {
      console.log('Isolated Image Compressor: Required elements not found');
      return;
    }

    /** State */
    const images = [];
    let selectedId = null;
    let pendingDeleteAll = false;
    let pendingDeleteId = null;
    let pendingReset = false;

    // Shared canvas
    let sharedCanvas = document.createElement('canvas');
    let sharedCtx = sharedCanvas.getContext('2d');
    
    function prepareCanvas(width, height) {
      if (sharedCanvas.width !== width) sharedCanvas.width = width;
      if (sharedCanvas.height !== height) sharedCanvas.height = height;
      sharedCtx.clearRect(0, 0, sharedCanvas.width, sharedCanvas.height);
    }

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

    function toast(message) { 
      const div = document.createElement('div'); 
      div.textContent = message; 
      div.style.position = 'fixed'; 
      div.style.left = '50%'; 
      div.style.bottom = '24px'; 
      div.style.transform = 'translateX(-50%)'; 
      div.style.background = 'linear-gradient(90deg, #6300e2, #8e43f0)'; 
      div.style.color = '#fff'; 
      div.style.padding = '10px 14px'; 
      div.style.borderRadius = '12px'; 
      div.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; 
      div.style.zIndex = '9999'; 
      div.style.fontFamily = 'inherit';
      div.style.fontSize = '14px';
      document.body.appendChild(div); 
      setTimeout(() => div.remove(), 1800); 
    }

    function setEmptyState() { 
      const has = images.length > 0; 
      if (emptyState) emptyState.style.display = has ? 'none' : ''; 
      if (deleteAllBtn) deleteAllBtn.disabled = !has; 
      if (deleteAllBtn) deleteAllBtn.style.display = has ? '' : 'none'; 
      if (downloadAllBtn) downloadAllBtn.disabled = !has; 
    }
    
    function toggleFrame(showFrame) { 
      if (uploadFrame) uploadFrame.style.display = showFrame ? '' : 'none'; 
      if (compareViewport) compareViewport.style.display = showFrame ? 'none' : ''; 
    }

    function clearPreview() { 
      if (baseImg) baseImg.src = ''; 
      if (overlayImg) overlayImg.src = ''; 
      if (originalMeta) originalMeta.textContent = '—'; 
      if (compressedMeta) compressedMeta.textContent = '—'; 
      if (statsEl) statsEl.textContent = '—'; 
      toggleFrame(true); 
    }

    function getSelected() { 
      return images.find(i => i.id === selectedId); 
    }

    async function compressBitmapToMime(bitmap, qualityPercent, mime) {
      prepareCanvas(bitmap.width, bitmap.height);
      sharedCtx.drawImage(bitmap, 0, 0);
      
      const q = mime === 'image/jpeg' ? Math.min(Math.max(qualityPercent / 100, 0.01), 1) : 1;
      
      const blob = await new Promise(resolve => sharedCanvas.toBlob(resolve, mime, q));
      return blob;
    }

    async function compressFile(file, qualityPercent) {
      const bitmap = await createImageBitmap(file);
      try {
        const isPng = file.type.includes('png');
        
        if (qualityPercent >= 100) {
          if (isPng) {
            const pngBlob = await compressBitmapToMime(bitmap, 100, 'image/png');
            if (pngBlob && pngBlob.size < file.size) {
              return pngBlob;
            }
          }
          
          const jpegBlob = await compressBitmapToMime(bitmap, 100, 'image/jpeg');
          if (jpegBlob && jpegBlob.size < file.size) {
            return jpegBlob;
          }
        }
        
        const mime = isPng ? 'image/png' : 'image/jpeg';
        const blob = await compressBitmapToMime(bitmap, qualityPercent, mime);
        return blob;
      } finally {
        bitmap.close();
      }
    }

    async function ensureCompressed(item, quality) {
      if (item.cachedCompressed && item.cachedCompressed.quality === quality) {
        return item.cachedCompressed.blob;
      }
      
      const compressed = await compressFile(item.file, quality);
      item.cachedCompressed = { quality, blob: compressed, url: URL.createObjectURL(compressed) };
      return compressed;
    }

    function renderList() {
      imageListEl.innerHTML = '';
      images.forEach(item => {
        const node = template.content.cloneNode(true);
        const card = node.querySelector('.isolated-image-card');
        const thumb = node.querySelector('.isolated-thumb');
        const name = node.querySelector('.isolated-name');
        const size = node.querySelector('.isolated-size');
        const type = node.querySelector('.isolated-type');
        const reduction = node.querySelector('.isolated-reduction');
        const remove = node.querySelector('.isolated-remove');

        card.dataset.id = item.id;
        thumb.src = item.url;
        name.textContent = item.name;
        size.textContent = formatBytes(item.originalBytes);
        type.textContent = item.type.split('/')[1].toUpperCase();

        if (item.cachedCompressed) {
          reduction.textContent = computeReduction(item.originalBytes, item.cachedCompressed.blob.size);
        } else {
          reduction.textContent = '—';
        }

        remove.addEventListener('click', () => {
          pendingDeleteId = item.id;
          if (modalTitle) modalTitle.textContent = 'Delete Image';
          if (modalDesc) modalDesc.textContent = `Are you sure you want to delete "${item.name}"?`;
          if (confirmModal) confirmModal.showModal();
        });

        card.addEventListener('click', () => {
          if (selectedId === item.id) return;
          
          const prev = imageListEl.querySelector('.isolated-image-card.selected');
          if (prev) prev.classList.remove('selected');
          
          card.classList.add('selected');
          selectedId = item.id;
          
          updatePreview(item);
        });

        imageListEl.appendChild(node);
      });
    }

    function updatePreview(item) {
      if (!item) return;
      
      if (baseImg) baseImg.src = item.url;
      if (originalMeta) originalMeta.textContent = formatBytes(item.originalBytes);
      
      if (item.cachedCompressed) {
        if (overlayImg) overlayImg.src = item.cachedCompressed.url;
        if (compressedMeta) compressedMeta.textContent = formatBytes(item.cachedCompressed.blob.size);
        if (statsEl) statsEl.textContent = computeReduction(item.originalBytes, item.cachedCompressed.blob.size);
      } else {
        if (overlayImg) overlayImg.src = item.url;
        if (compressedMeta) compressedMeta.textContent = '—';
        if (statsEl) statsEl.textContent = '—';
      }
      
      toggleFrame(false);
    }

    function syncQualityInputs() {
      if (!qualityRange || !qualityValueInput) return;
      
      const value = qualityRange.value;
      qualityValueInput.value = value;
      
      const percentageEl = document.getElementById('isolated-quality-percentage');
      if (percentageEl) {
        percentageEl.textContent = value + '%';
      }
      
      const selected = getSelected();
      if (selected) {
        updatePreview(selected);
      }
    }

    // Event Listeners
    if (iconAdd) {
      iconAdd.addEventListener('click', () => {
        if (fileInput) fileInput.click();
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        for (const file of files) {
          if (!file.type.startsWith('image/')) continue;
          
          const id = generateId();
          const url = URL.createObjectURL(file);
          
          images.push({
            id,
            file,
            url,
            originalBytes: file.size,
            name: file.name,
            type: file.type
          });
        }

        renderList();
        setEmptyState();
        fileInput.value = '';
        
        if (images.length === 1) {
          const firstCard = imageListEl.querySelector('.isolated-image-card');
          if (firstCard) firstCard.click();
        }
        
        toast(`Added ${files.length} image${files.length > 1 ? 's' : ''}`);
      });
    }

    if (deleteAllBtn) {
      deleteAllBtn.addEventListener('click', () => {
        pendingDeleteAll = true;
        if (modalTitle) modalTitle.textContent = 'Delete All Images';
        if (modalDesc) modalDesc.textContent = `Are you sure you want to delete all ${images.length} images?`;
        if (confirmModal) confirmModal.showModal();
      });
    }

    if (downloadAllBtn) {
      downloadAllBtn.addEventListener('click', async () => {
        if (!qualityRange) return;
        
        const quality = parseInt(qualityRange.value);
        
        for (const item of images) {
          const compressed = await ensureCompressed(item, quality);
          const link = document.createElement('a');
          link.href = URL.createObjectURL(compressed);
          link.download = `compressed_${item.name}`;
          link.click();
          URL.revokeObjectURL(link.href);
        }
        
        toast(`Downloaded ${images.length} compressed image${images.length > 1 ? 's' : ''}`);
      });
    }

    if (filterButton && filterMenu) {
      filterButton.addEventListener('click', () => {
        const expanded = filterButton.getAttribute('aria-expanded') === 'true';
        filterButton.setAttribute('aria-expanded', !expanded);
        filterMenu.style.display = expanded ? 'none' : 'block';
      });
    }

    if (filterMenu) {
      filterMenu.addEventListener('click', (e) => {
        if (!e.target.matches('.isolated-menu-item')) return;
        
        const sort = e.target.dataset.sort;
        filterMenu.style.display = 'none';
        if (filterButton) filterButton.setAttribute('aria-expanded', 'false');
        
        if (sort === 'az') {
          images.sort((a, b) => a.name.localeCompare(b.name));
        } else if (sort === 'za') {
          images.sort((a, b) => b.name.localeCompare(a.name));
        } else if (sort === 'big') {
          images.sort((a, b) => b.originalBytes - a.originalBytes);
        } else if (sort === 'small') {
          images.sort((a, b) => a.originalBytes - b.originalBytes);
        }
        
        renderList();
        toast(`Sorted by ${e.target.textContent}`);
      });
    }

    if (resetToolBtn) {
      resetToolBtn.addEventListener('click', () => {
        pendingReset = true;
        if (modalTitle) modalTitle.textContent = 'Reset Tool';
        if (modalDesc) modalDesc.textContent = 'Are you sure you want to reset? This will clear all images and settings.';
        if (confirmModal) confirmModal.showModal();
      });
    }

    if (qualityRange) {
      qualityRange.addEventListener('input', syncQualityInputs);
    }

    if (qualityValueInput) {
      qualityValueInput.addEventListener('input', () => {
        if (!qualityRange) return;
        qualityRange.value = qualityValueInput.value;
        syncQualityInputs();
      });
    }

    if (applyMaxBtn && maxSizeInput) {
      applyMaxBtn.addEventListener('click', () => {
        const maxSize = parseInt(maxSizeInput.value);
        if (isNaN(maxSize) || maxSize < 1) {
          toast('Please enter a valid file size');
          return;
        }
        
        toast(`Max file size set to ${maxSize} KB`);
      });
    }

    if (confirmModal) {
      confirmModal.addEventListener('click', (e) => {
        if (e.target === confirmModal) {
          confirmModal.close();
        }
      });
    }

    if (cancelDelete) {
      cancelDelete.addEventListener('click', () => {
        if (confirmModal) confirmModal.close();
        pendingDeleteAll = false;
        pendingDeleteId = null;
        pendingReset = false;
      });
    }

    if (confirmDelete) {
      confirmDelete.addEventListener('click', () => {
        if (pendingDeleteAll) {
          images.forEach(item => URL.revokeObjectURL(item.url));
          images.forEach(item => {
            if (item.cachedCompressed) URL.revokeObjectURL(item.cachedCompressed.url);
          });
          images.length = 0;
          selectedId = null;
          renderList();
          setEmptyState();
          clearPreview();
          toast('All images deleted');
        } else if (pendingDeleteId) {
          const index = images.findIndex(item => item.id === pendingDeleteId);
          if (index > -1) {
            const item = images[index];
            URL.revokeObjectURL(item.url);
            if (item.cachedCompressed) URL.revokeObjectURL(item.cachedCompressed.url);
            images.splice(index, 1);
            
            if (selectedId === pendingDeleteId) {
              selectedId = null;
              clearPreview();
            }
            
            renderList();
            setEmptyState();
            toast('Image deleted');
          }
        } else if (pendingReset) {
          images.forEach(item => URL.revokeObjectURL(item.url));
          images.forEach(item => {
            if (item.cachedCompressed) URL.revokeObjectURL(item.cachedCompressed.url);
          });
          images.length = 0;
          selectedId = null;
          renderList();
          setEmptyState();
          clearPreview();
          
          if (qualityRange) qualityRange.value = 100;
          if (qualityValueInput) qualityValueInput.value = 100;
          syncQualityInputs();
          
          if (maxSizeInput) maxSizeInput.value = '';
          
          toast('Tool reset successfully');
        }
        
        if (confirmModal) confirmModal.close();
        pendingDeleteAll = false;
        pendingDeleteId = null;
        pendingReset = false;
      });
    }

    // Drag and drop functionality
    if (uploadFrame) {
      uploadFrame.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadFrame.classList.add('drag-over');
      });

      uploadFrame.addEventListener('dragleave', () => {
        uploadFrame.classList.remove('drag-over');
      });

      uploadFrame.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadFrame.classList.remove('drag-over');
        
        const files = Array.from(e.dataTransfer.files);
        if (files.length === 0) return;

        for (const file of files) {
          if (!file.type.startsWith('image/')) continue;
          
          const id = generateId();
          const url = URL.createObjectURL(file);
          
          images.push({
            id,
            file,
            url,
            originalBytes: file.size,
            name: file.name,
            type: file.type
          });
        }

        renderList();
        setEmptyState();
        
        if (images.length === 1) {
          const firstCard = imageListEl.querySelector('.isolated-image-card');
          if (firstCard) firstCard.click();
        }
        
        toast(`Added ${files.length} image${files.length > 1 ? 's' : ''}`);
      });

      uploadFrame.addEventListener('click', () => {
        if (fileInput) fileInput.click();
      });
    }

    // Image list event delegation for copy/download
    if (imageListEl) {
      imageListEl.addEventListener('click', async (e) => {
        const actionBtn = e.target.closest('[data-action]');
        if (!actionBtn) return;

        const action = actionBtn.dataset.action;
        const card = actionBtn.closest('.isolated-image-card');
        if (!card) return;

        const id = card.dataset.id;
        const item = images.find(i => i.id === id);
        if (!item) return;

        if (!qualityRange) return;
        const quality = parseInt(qualityRange.value);

        if (action === 'copy') {
          try {
            const compressed = await ensureCompressed(item, quality);
            await navigator.clipboard.write([
              new ClipboardItem({
                [compressed.type]: compressed
              })
            ]);
            toast('Image copied to clipboard');
          } catch (err) {
            toast('Failed to copy image');
            console.error('Copy error:', err);
          }
        } else if (action === 'download') {
          const compressed = await ensureCompressed(item, quality);
          const link = document.createElement('a');
          link.href = URL.createObjectURL(compressed);
          link.download = `compressed_${item.name}`;
          link.click();
          URL.revokeObjectURL(link.href);
          toast('Image downloaded');
        }
      });
    }

    // Drag divider functionality
    if (dragDivider && compareViewport) {
      let isDragging = false;
      const handle = dragDivider.querySelector('div');

      if (handle) {
        handle.addEventListener('mousedown', () => {
          isDragging = true;
        });

        document.addEventListener('mousemove', (e) => {
          if (!isDragging) return;
          
          const rect = compareViewport.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
          
          compareViewport.style.setProperty('--split', percent + '%');
        });

        document.addEventListener('mouseup', () => {
          isDragging = false;
        });

        // Touch support
        handle.addEventListener('touchstart', () => {
          isDragging = true;
        });

        document.addEventListener('touchmove', (e) => {
          if (!isDragging) return;
          e.preventDefault();
          
          const touch = e.touches[0];
          const rect = compareViewport.getBoundingClientRect();
          const x = touch.clientX - rect.left;
          const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
          
          compareViewport.style.setProperty('--split', percent + '%');
        });

        document.addEventListener('touchend', () => {
          isDragging = false;
        });
      }
    }

    // Initialize
    setEmptyState();
    syncQualityInputs();
    
    console.log('Isolated Image Compressor: Initialized successfully');
  });
})();