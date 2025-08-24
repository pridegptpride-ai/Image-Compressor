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
      console.log('iconAdd:', iconAdd);
      console.log('imageListEl:', imageListEl);
      console.log('template:', template);
      return;
    }

    console.log('Template content:', template.content);
    console.log('Template first child:', template.content.firstElementChild);

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
      return `${reduction} • Original: ${original} → Compressed: ${compressed}`;
    }

    // Smooth stats animation
    function animateStats(element, startText, endText, duration = 800) {
      if (!element) return;
      
      element.textContent = startText;
      element.style.opacity = '0.7';
      
      setTimeout(() => {
        element.textContent = endText;
        element.style.opacity = '1';
        element.style.transform = 'none';
      }, 100);
    }

    function toast(message) { 
      console.log('Toast message:', message); // Debug log
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
      div.style.fontWeight = '600';
      div.style.whiteSpace = 'nowrap';
      div.style.minWidth = '200px';
      div.style.textAlign = 'center';
      document.body.appendChild(div); 
      console.log('Toast element created and added to DOM'); // Debug log
      setTimeout(() => {
        div.remove();
        console.log('Toast element removed from DOM'); // Debug log
      }, 3000); // Increased duration to 3 seconds for better visibility
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
        processingText.textContent = message || 'Processing...';
        processingEl.style.display = 'flex';
      }
    }

    function hideProcessing() {
      if (processingEl) {
        processingEl.style.display = 'none';
      }
    }

    // EXACTLY as in original tool
    async function compressBitmapToMime(bitmap, qualityPercent, mime) {
      prepareCanvas(bitmap.width, bitmap.height);
      sharedCtx.drawImage(bitmap, 0, 0);
      
      // For JPEG, use quality parameter; for PNG, always use maximum quality
      // PNG compression is lossless and quality parameter doesn't affect file size
      const q = mime === 'image/jpeg' ? Math.min(Math.max(qualityPercent / 100, 0.01), 1) : 1;
      
      const blob = await new Promise(resolve => sharedCanvas.toBlob(resolve, mime, q));
      return blob;
    }

    // EXACTLY as in original tool
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
          
          // If no compression achieved, return original
          return file;
        } else {
          // For lower quality, use standard compression
          const mimeType = isPng && qualityPercent < 100 ? 'image/jpeg' : (isPng ? 'image/png' : 'image/jpeg');
          const blob = await compressBitmapToMime(bitmap, qualityPercent, mimeType);
          return blob || file;
        }
      } finally { 
        try { 
          bitmap.close && bitmap.close(); 
        } catch {} 
      }
    }

    // EXACTLY as in original tool
    async function ensureCompressed(item, quality) {
      // Use cache if same quality
      if (item.cachedCompressed && item.cachedCompressed.quality === quality) return item.cachedCompressed;
      
      showProcessing('Compressing image...');
      const trial = await compressFile(item.file, quality);
      hideProcessing();
      
      // Always use the compressed version, even if it's the same size
      // This ensures consistent behavior and proper file format handling
      const resultBlob = trial || item.file;
      
      if (item.cachedCompressed && item.cachedCompressed.url) URL.revokeObjectURL(item.cachedCompressed.url);
      const url = URL.createObjectURL(resultBlob);
      item.cachedCompressed = { quality, blob: resultBlob, url };
      return item.cachedCompressed;
    }

    // EXACTLY as in original tool
    function updateStats(item, compressedBlob) { 
      if (compressedMeta) compressedMeta.textContent = `${item.name.replace(/(\.[^.]+)$/,'-compressed$1')} • ${formatBytes(compressedBlob.size)}`; 
      if (statsEl) statsEl.textContent = `${computeReduction(item.originalBytes, compressedBlob.size)} • Original: ${formatBytes(item.originalBytes)} → Compressed: ${formatBytes(compressedBlob.size)}`; 
    }

    // EXACTLY as in original tool
    async function selectImage(id) { 
      selectedId = id; 
      const item = getSelected(); 
      if (!item) return; 
      
      if (baseImg) baseImg.src = item.url; 
      if (originalMeta) originalMeta.textContent = `${item.name} • ${formatBytes(item.originalBytes)}`; 
      toggleFrame(false); 
      
      const quality = qualityRange ? parseInt(qualityRange.value, 10) : 50; 
      const c = await ensureCompressed(item, quality); 
      
      if (overlayImg) overlayImg.src = c.url; 
      updateStats(item, c.blob); 
      
      // Update selection in UI
      if (imageListEl) {
        imageListEl.querySelectorAll('.wp-image-card').forEach(card => { 
          card.classList.toggle('selected', card.dataset.id === id); 
        }); 
      }
    }

    function renderList() {
      // Clear the list completely to prevent duplicate buttons
      if (imageListEl) {
        imageListEl.innerHTML = '';
      }
      
      if (images.length === 0) {
        return;
      }
      
      images.forEach((item, index) => {
        // Use the proper template structure as in original
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

        // Add click handler for image selection
        card.addEventListener('click', () => {
          selectImage(item.id);
        });

        // Add remove button handler
        remove.addEventListener('click', (e) => {
          e.stopPropagation();
          pendingDeleteAll = false;
          pendingDeleteId = item.id;
          if (confirmModal) confirmModal.showModal();
        });

        if (imageListEl) {
          imageListEl.appendChild(node);
        }
      });
    }

    function setEmptyAndRender() { 
      setEmptyState(); 
      renderList(); 
      if (images.length) selectImage(images[images.length - 1].id); 
      else clearPreview(); 
    }

    function syncQualityInputs(val) { 
      const v = Math.max(1, Math.min(100, parseInt(val || '50', 10))); 
      if (qualityRange) qualityRange.value = String(v); 
      if (qualityValueInput) qualityValueInput.value = String(v); 
      
      // Update percentage display
      const percentageEl = document.getElementById('wp-quality-percentage');
      if (percentageEl) {
        percentageEl.textContent = v + '%';
      }
      
      const current = getSelected(); 
      if (current) ensureCompressed(current, v).then(c => { 
        if (overlayImg) overlayImg.src = c.url; 
        updateStats(current, c.blob); 
      }); 
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

        showProcessing('Uploading...');

        for (const file of files) {
          if (!file.type.startsWith('image/')) continue;
          
          const id = generateId();
          const url = URL.createObjectURL(file);
          
          const imageItem = {
            id,
            file,
            url,
            originalBytes: file.size,
            name: file.name,
            type: file.type
          };
          
          images.push(imageItem);
        }

        hideProcessing();
        setEmptyAndRender(); // This will auto-select the last uploaded image
        fileInput.value = '';
        
        toast(`Uploaded ${files.length} image${files.length > 1 ? 's' : ''}`);
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
        showProcessing('Downloading all...');
        
        for (const item of images) {
          const compressed = await ensureCompressed(item, quality);
          const link = document.createElement('a');
          link.href = URL.createObjectURL(compressed.blob);
          link.download = item.name.replace(/(\.[^.]+)$/, '-compressed$1');
          link.click();
          URL.revokeObjectURL(link.href);
        }
        
        hideProcessing();
        toast(`Downloaded ${images.length} compressed image${images.length > 1 ? 's' : ''}`);
      });
    }

    if (filterButton && filterMenu) {
      filterButton.addEventListener('click', () => {
        const expanded = filterButton.getAttribute('aria-expanded') === 'true';
        filterButton.setAttribute('aria-expanded', !expanded);
        filterMenu.hidden = expanded;
      });
      
      // Close filter menu when clicking outside
      document.addEventListener('click', (e) => {
        if (!filterButton.contains(e.target) && !filterMenu.contains(e.target)) {
          filterMenu.hidden = true;
          filterButton.setAttribute('aria-expanded', 'false');
        }
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
      qualityRange.addEventListener('input', (e) => {
        const value = e.target.value;
        syncQualityInputs(value);
      });
    }

    if (qualityValueInput) {
      qualityValueInput.addEventListener('input', () => {
        if (!qualityValueInput.value) return;
        const value = qualityValueInput.value;
        syncQualityInputs(value);
      });
    }

    if (applyMaxBtn && maxSizeInput) {
      applyMaxBtn.addEventListener('click', async () => {
        const maxSize = parseInt(maxSizeInput.value);
        if (isNaN(maxSize) || maxSize < 1) {
          toast('Enter valid KB');
          return;
        }
        
        const item = getSelected();
        if (!item) {
          toast('Select an image');
          return;
        }
        
        const targetBytes = Math.round(maxSize * 1024);
        
        // If target >= original, keep original
        if (targetBytes >= item.file.size) {
          if (item.cachedCompressed && item.cachedCompressed.url) URL.revokeObjectURL(item.cachedCompressed.url);
          const url = item.url;
          item.cachedCompressed = { quality: 100, blob: item.file, url };
          if (overlayImg) overlayImg.src = url;
          if (qualityRange) qualityRange.value = '100';
          if (qualityValueInput) qualityValueInput.value = '100';
          updateStats(item, item.file);
          toast('Optimized');
          return;
        }
        
        showProcessing('Optimizing...');
        
        try {
          const tolerance = Math.max(1024, Math.round(targetBytes * 0.02));
          const bitmap = await createImageBitmap(item.file);
          
          async function searchForTarget(mime) {
            let low = 1, high = 100;
            let bestBelow = null, bestAbove = null;
            
            for (let i = 0; i < 12; i++) {
              const mid = Math.round((low + high) / 2);
              const blob = await compressBitmapToMime(bitmap, mid, mime);
              const diff = Math.abs(blob.size - targetBytes);
              
              if (diff <= tolerance) return { q: mid, blob };
              
              if (blob.size <= targetBytes) {
                if (!bestBelow || blob.size > bestBelow.blob.size) bestBelow = { q: mid, blob };
                high = mid - 1;
              } else {
                if (!bestAbove || blob.size < bestAbove.blob.size) bestAbove = { q: mid, blob };
                low = mid + 1;
              }
              
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
          
          if (chosen) {
            const url = URL.createObjectURL(chosen.blob);
            if (item.cachedCompressed && item.cachedCompressed.url) URL.revokeObjectURL(item.cachedCompressed.url);
            item.cachedCompressed = { quality: chosen.q, blob: chosen.blob, url };
            
            if (overlayImg) overlayImg.src = url;
            if (qualityRange) qualityRange.value = String(chosen.q);
            if (qualityValueInput) qualityValueInput.value = String(chosen.q);
            updateStats(item, chosen.blob);
            
            toast('Optimized');
          } else {
            toast('Failed to optimize');
          }
          
          bitmap.close();
        } catch (err) {
          console.error('Optimization error:', err);
          toast('Optimization failed');
        }
        
        hideProcessing();
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
                selectImage(images[0].id);
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
          
          // Reset quality to 50%
          if (qualityRange) qualityRange.value = 50;
          if (qualityValueInput) qualityValueInput.value = 50;
          syncQualityInputs(50);
          
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

        showProcessing('Uploading...');

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

        hideProcessing();
        setEmptyAndRender(); // This will auto-select the last uploaded image
        
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
            
            // Try modern clipboard API first
            if (navigator.clipboard && navigator.clipboard.write) {
              try {
                await navigator.clipboard.write([
                  new ClipboardItem({
                    [compressed.blob.type]: compressed.blob
                  })
                ]);
                toast('Image copied to clipboard successfully!');
                return; // Success, exit early
              } catch (clipboardErr) {
                console.log('Modern clipboard failed, trying fallback:', clipboardErr);
              }
            }
            
            // Fallback: Try to copy image data to clipboard
            try {
              // Create a canvas and draw the image
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              const img = new Image();
              
              img.onload = async () => {
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                
                try {
                  // Try to copy the canvas as image
                  canvas.toBlob(async (blob) => {
                    if (navigator.clipboard && navigator.clipboard.write) {
                      await navigator.clipboard.write([
                        new ClipboardItem({
                          [blob.type]: blob
                        })
                      ]);
                      toast('Image copied to clipboard successfully!');
                    } else {
                      // Final fallback: copy image URL
                      const url = URL.createObjectURL(blob);
                      const tempInput = document.createElement('input');
                      tempInput.value = url;
                      document.body.appendChild(tempInput);
                      tempInput.select();
                      document.execCommand('copy');
                      document.body.removeChild(tempInput);
                      URL.revokeObjectURL(url);
                      toast('Image URL copied to clipboard!');
                    }
                  }, compressed.blob.type);
                } catch (err) {
                  console.error('Canvas copy failed:', err);
                  toast('Copy failed, image downloaded instead');
                  // Download as final fallback
                  const link = document.createElement('a');
                  link.href = URL.createObjectURL(compressed.blob);
                  link.download = item.name.replace(/(\.[^.]+)$/, '-compressed$1');
                  link.click();
                  URL.revokeObjectURL(link.href);
                }
              };
              
              img.src = URL.createObjectURL(compressed.blob);
              
            } catch (fallbackErr) {
              console.error('Fallback copy failed:', fallbackErr);
              toast('Copy failed, image downloaded instead');
              // Download as final fallback
              const link = document.createElement('a');
              link.href = URL.createObjectURL(compressed.blob);
              link.download = item.name.replace(/(\.[^.]+)$/, '-compressed$1');
              link.click();
              URL.revokeObjectURL(link.href);
            }
            
          } catch (err) {
            console.error('Copy error:', err);
            toast('Failed to copy image');
          }
        } else if (action === 'download') {
          const compressed = await ensureCompressed(item, quality);
          const link = document.createElement('a');
          link.href = URL.createObjectURL(compressed.blob);
          link.download = item.name.replace(/(\.[^.]+)$/, '-compressed$1');
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
    syncQualityInputs(50);
    
    console.log('WordPress Image Compressor: Initialized successfully with all original features');
  });
})();