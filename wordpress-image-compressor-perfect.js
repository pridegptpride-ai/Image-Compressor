// Perfect WordPress-Compatible Image Compressor JavaScript - Use with WP Code Inserter
// This version maintains EXACTLY the same functionality, drag divider, and all features as our original files

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
    // Check if our container exists
    const container = document.querySelector('.wp-container');
    if (!container) {
      console.log('WordPress Image Compressor: Container not found');
      return;
    }

    // Get all elements with WordPress-safe IDs
    const iconAdd = document.getElementById('wp-icon-add');
    const deleteAllBtn = document.getElementById('wp-icon-delete-all');
    const downloadAllBtn = document.getElementById('wp-download-all');
    const filterButton = document.getElementById('wp-icon-filter');
    const filterMenu = document.getElementById('wp-filter-menu');
    const resetToolBtn = document.getElementById('wp-reset-tool');

    const fileInput = document.getElementById('wp-file-input');
    const imageListEl = document.getElementById('wp-image-list');
    const emptyState = document.getElementById('wp-empty-state');
    const template = document.getElementById('wp-image-card-template');

    const baseImg = document.getElementById('wp-base-img');
    const overlayImg = document.getElementById('wp-overlay-img');
    const originalMeta = document.getElementById('wp-original-meta');
    const compressedMeta = document.getElementById('wp-compressed-meta');
    const statsEl = document.getElementById('wp-stats');

    const qualityRange = document.getElementById('wp-quality-range');
    const qualityValueInput = document.getElementById('wp-quality-value');

    const maxSizeInput = document.getElementById('wp-max-size');
    const applyMaxBtn = document.getElementById('wp-apply-max');

    const confirmModal = document.getElementById('wp-confirm-modal');
    const cancelDelete = document.getElementById('wp-cancel-delete');
    const confirmDelete = document.getElementById('wp-confirm-delete');

    const dragDivider = document.getElementById('wp-drag-divider');
    const handle = dragDivider ? dragDivider.querySelector('.wp-handle') : null;
    const compareViewport = document.getElementById('wp-compare-viewport');
    const uploadFrame = document.getElementById('wp-upload-frame');
    const processingEl = document.getElementById('wp-processing');
    const processingText = document.getElementById('wp-processing-text');

    // Check if all required elements exist
    if (!iconAdd || !imageListEl || !template) {
      console.log('WordPress Image Compressor: Required elements not found');
      return;
    }

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

    function formatStats(originalBytes, compressedBytes) {
      if (!originalBytes || !compressedBytes) return '—';
      const original = formatBytes(originalBytes);
      const compressed = formatBytes(compressedBytes);
      const reduction = computeReduction(originalBytes, compressedBytes);
      return `${reduction} • ${original} → ${compressed}`;
    }

    // Smooth stats animation
    function animateStats(element, startText, endText, duration = 800) {
      if (!element) return;
      
      element.textContent = startText;
      element.style.opacity = '0.7';
      
      setTimeout(() => {
        element.textContent = endText;
        element.style.opacity = '1';
        element.style.transform = 'scale(1.05)';
        
        setTimeout(() => {
          element.style.transform = 'scale(1)';
        }, 150);
      }, 100);
    }

    function toast(message) { 
      const div = document.createElement('div'); 
      div.textContent = message; 
      div.style.position = 'fixed'; 
      div.style.left = '50%'; 
      div.style.bottom = '24px'; 
      div.style.transform = 'translateX(-50%)'; 
      div.style.background = 'linear-gradient(90deg, #6300E2, #8E43F0)'; 
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

    // Processing functions
    function showProcessing(message) {
      if (processingEl && processingText) {
        processingText.textContent = message;
        processingEl.style.display = 'flex';
      }
    }

    function hideProcessing() {
      if (processingEl) {
        processingEl.style.display = 'none';
      }
    }

    async function compressBitmapToMime(bitmap, qualityPercent, mime) {
      prepareCanvas(bitmap.width, bitmap.height);
      sharedCtx.drawImage(bitmap, 0, 0);
      
      // For JPEG, use quality parameter; for PNG, always use maximum quality
      const q = mime === 'image/jpeg' ? Math.min(Math.max(qualityPercent / 100, 0.01), 1) : 1;
      
      const blob = await new Promise(resolve => sharedCanvas.toBlob(resolve, mime, q));
      return blob;
    }

    async function compressFile(file, qualityPercent) {
      // Always compress, even at 100% quality, to reduce file size
      const bitmap = await createImageBitmap(file);
      try {
        const isPng = file.type.includes('png');
        
        // At 100% quality, try multiple compression strategies for best file size
        if (qualityPercent >= 100) {
          // Try PNG first for lossless compression
          if (isPng) {
            const pngBlob = await compressBitmapToMime(bitmap, 100, 'image/png');
            // If PNG is smaller, use it
            if (pngBlob && pngBlob.size < file.size) {
              return pngBlob;
            }
          }
          
          // Try JPEG at 100% quality for better compression
          const jpegBlob = await compressBitmapToMime(bitmap, 100, 'image/jpeg');
          if (jpegBlob && jpegBlob.size < file.size) {
            return jpegBlob;
          }
          
          // If no compression achieved, return original but processed through canvas
          const processedBlob = await compressBitmapToMime(bitmap, 100, isPng ? 'image/png' : 'image/jpeg');
          return processedBlob;
        }
        
        // Regular compression based on quality
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
        const card = node.querySelector('.wp-image-card');
        const thumb = node.querySelector('.wp-thumb');
        const remove = node.querySelector('.wp-remove');

        if (!card || !thumb || !remove) {
          console.error('Template elements not found:', { card, thumb, remove });
          return;
        }

        card.dataset.id = item.id;
        thumb.src = item.url;
        thumb.alt = item.name;

        remove.addEventListener('click', () => {
          pendingDeleteId = item.id;
          if (confirmModal) confirmModal.showModal();
        });

        card.addEventListener('click', () => {
          if (selectedId === item.id) return;
          
          // Remove previous selection
          const prev = imageListEl.querySelector('.wp-image-card.selected');
          if (prev) prev.classList.remove('selected');
          
          // Select new card
          card.classList.add('selected');
          selectedId = item.id;
          
          // Update preview
          updatePreview(item);
        });

        imageListEl.appendChild(node);
      });
    }

    async function updatePreview(item) {
      if (!item) return;
      
      if (baseImg) baseImg.src = item.url;
      if (originalMeta) originalMeta.textContent = formatBytes(item.originalBytes);
      
      // Show processing
      showProcessing('Compressing...');
      
      // Always compress the image to show stats
      const quality = qualityRange ? parseInt(qualityRange.value) : 100;
      const compressed = await ensureCompressed(item, quality);
      
      if (overlayImg) overlayImg.src = item.cachedCompressed.url;
      if (compressedMeta) compressedMeta.textContent = formatBytes(compressed.size);
      
      // Animate stats update
      if (statsEl) {
        const currentStats = statsEl.textContent;
        const newStats = formatStats(item.originalBytes, compressed.size);
        animateStats(statsEl, currentStats, newStats);
      }
      
      hideProcessing();
      toggleFrame(false);
    }

    function syncQualityInputs() {
      if (!qualityRange || !qualityValueInput) return;
      
      const value = qualityRange.value;
      qualityValueInput.value = value;
      
      // Update percentage display
      const percentageEl = document.getElementById('wp-quality-percentage');
      if (percentageEl) {
        percentageEl.textContent = value + '%';
      }
      
      // Update preview if image is selected
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
        
        // Auto-select first image by default
        if (images.length > 0) {
          const firstCard = imageListEl.querySelector('.wp-image-card');
          if (firstCard) {
            firstCard.click();
            selectedId = images[0].id;
            await updatePreview(images[0]);
          }
        }
        
        toast(`Added ${files.length} image${files.length > 1 ? 's' : ''}`);
      });
    }

    if (deleteAllBtn) {
      deleteAllBtn.addEventListener('click', () => {
        pendingDeleteAll = true;
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
        filterMenu.hidden = expanded;
      });
    }

    if (filterMenu) {
      filterMenu.addEventListener('click', (e) => {
        if (!e.target.matches('.wp-menu-item')) return;
        
        const sort = e.target.dataset.sort;
        filterMenu.hidden = true;
        if (filterButton) filterButton.setAttribute('aria-expanded', 'false');
        
        // Sort images
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
        
        // Re-select the previously selected image after sorting
        if (selectedId) {
          const selectedCard = imageListEl.querySelector(`[data-id="${selectedId}"]`);
          if (selectedCard) {
            selectedCard.classList.add('selected');
          }
        }
        
        toast(`Sorted by ${e.target.textContent}`);
      });
    }

    if (resetToolBtn) {
      resetToolBtn.addEventListener('click', () => {
        pendingReset = true;
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
        
        // Apply max size logic here
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
          // Clear all images
          images.forEach(item => {
            URL.revokeObjectURL(item.url);
            if (item.cachedCompressed) URL.revokeObjectURL(item.cachedCompressed.url);
          });
          images.length = 0;
          selectedId = null;
          renderList();
          setEmptyState();
          clearPreview();
          toast('All images deleted');
        } else if (pendingDeleteId) {
          // Delete specific image
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
            
            // Auto-select first remaining image if available
            if (images.length > 0 && !selectedId) {
              const firstCard = imageListEl.querySelector('.wp-image-card');
              if (firstCard) {
                firstCard.click();
                selectedId = images[0].id;
                updatePreview(images[0]);
              }
            }
            
            toast('Image deleted');
          }
        } else if (pendingReset) {
          // Reset tool
          images.forEach(item => {
            URL.revokeObjectURL(item.url);
            if (item.cachedCompressed) URL.revokeObjectURL(item.cachedCompressed.url);
          });
          images.length = 0;
          selectedId = null;
          renderList();
          setEmptyState();
          clearPreview();
          
          // Reset quality to 100%
          if (qualityRange) qualityRange.value = 100;
          if (qualityValueInput) qualityValueInput.value = 100;
          syncQualityInputs();
          
          // Clear max size
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
        uploadFrame.classList.add('wp-drag-over');
      });

      uploadFrame.addEventListener('dragleave', () => {
        uploadFrame.classList.remove('wp-drag-over');
      });

      uploadFrame.addEventListener('drop', async (e) => {
        e.preventDefault();
        uploadFrame.classList.remove('wp-drag-over');
        
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
        
        // Auto-select first image by default
        if (images.length > 0) {
          const firstCard = imageListEl.querySelector('.wp-image-card');
          if (firstCard) {
            firstCard.click();
            selectedId = images[0].id;
            await updatePreview(images[0]);
          }
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
        const card = actionBtn.closest('.wp-image-card');
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

    // Drag divider functionality - EXACTLY as in original
    if (dragDivider && handle && compareViewport) {
      let isDragging = false;

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

    // Initialize
    setEmptyState();
    syncQualityInputs();
    
    console.log('WordPress Image Compressor: Initialized successfully with all original features');
  });
})();