document.addEventListener('DOMContentLoaded', () => {
    // ---- DOM Elements ----
    const fileInput = document.getElementById('file-input');
    const uploadBtn = document.getElementById('upload-btn');
    const themeToggle = document.getElementById('theme-toggle');
    const downloadBtn = document.getElementById('download-btn');
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    
    const workspace = document.getElementById('workspace');
    const emptyState = document.getElementById('empty-state');
    const dropZone = document.getElementById('drop-zone');
    const canvasWrapper = document.getElementById('canvas-wrapper');
    const canvas = document.getElementById('main-canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    const leftSidebar = document.getElementById('left-sidebar');
    const rightSidebar = document.getElementById('right-sidebar');
    const toolBtns = document.querySelectorAll('.tool-btn');
    const panelSections = document.querySelectorAll('.panel-section');
    const loadingOverlay = document.getElementById('loading-overlay');
    const toastContainer = document.getElementById('toast-container');

    // ---- App State ----
    let baseImg = new Image();
    let isImageLoaded = false;
    
    let state = {
        filters: { brightness: 100, contrast: 100, saturate: 100, grayscale: 0, sepia: 0, blur: 0, 'hue-rotate': 0 },
        transform: { rotate: 0, flipX: 1, flipY: 1 },
        drawings: [], // { type, ...data }
    };
    
    let history = [];
    let historyIndex = -1;

    // Viewport & Zoom
    let visualZoom = 1;
    let panX = 0;
    let panY = 0;
    let isPanning = false;
    let startPanX = 0;
    let startPanY = 0;

    // Tools state
    let activeTool = null; // 'brush', 'eraser', 'text', 'shapes', 'crop'
    let isDrawing = false;
    let currentPath = null;
    let currentShape = null;
    let startX = 0;
    let startY = 0;

    // ---- Initialization ----
    initTheme();

    // ---- Event Listeners: Header & Upload ----
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileUpload);
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            fileInput.files = e.dataTransfer.files;
            handleFileUpload();
        }
    });

    themeToggle.addEventListener('click', toggleTheme);
    undoBtn.addEventListener('click', undo);
    redoBtn.addEventListener('click', redo);
    
    // ---- Event Listeners: Sidebars ----
    toolBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tool = btn.dataset.tool;
            toolBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            panelSections.forEach(panel => panel.classList.remove('active'));
            document.getElementById(`panel-${tool}`).classList.add('active');
            
            if (!rightSidebar.classList.contains('hidden')) {
                // already open, just switched tab
            } else {
                rightSidebar.classList.remove('hidden');
            }
            
            // Set active mode
            if (tool === 'draw') activateDrawMode();
            else if (tool === 'text') activateTextMode();
            else if (tool === 'shapes') activateShapeMode();
            else activeTool = null;
        });
    });

    // ---- Handlers ----
    function handleFileUpload() {
        const file = fileInput.files[0];
        if (!file) return;
        if (!file.type.match('image.*')) {
            showToast('Please upload a valid image file', 'error');
            return;
        }

        showLoading(true);
        const reader = new FileReader();
        reader.onload = (e) => {
            baseImg.src = e.target.result;
            baseImg.onload = () => {
                isImageLoaded = true;
                emptyState.classList.add('hidden');
                canvasWrapper.classList.remove('hidden');
                rightSidebar.classList.remove('hidden');
                downloadBtn.disabled = false;
                
                // Initialize canvas dimensions
                canvas.width = baseImg.width;
                canvas.height = baseImg.height;
                
                // Reset state
                state.filters = { brightness: 100, contrast: 100, saturate: 100, grayscale: 0, sepia: 0, blur: 0, 'hue-rotate': 0 };
                state.transform = { rotate: 0, flipX: 1, flipY: 1 };
                state.drawings = [];
                visualZoom = 1;
                updateZoomDisplay();
                resetSliders();
                
                saveState();
                renderCanvas();
                showLoading(false);
                showToast('Image loaded successfully', 'success');
            };
        };
        reader.readAsDataURL(file);
    }

    // ---- Rendering Engine ----
    function renderCanvas() {
        if (!isImageLoaded) return;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        ctx.save();
        
        // Move to center to apply transforms correctly
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(state.transform.rotate * Math.PI / 180);
        ctx.scale(state.transform.flipX, state.transform.flipY);
        
        // Apply filters
        ctx.filter = `
            brightness(${state.filters.brightness}%)
            contrast(${state.filters.contrast}%)
            saturate(${state.filters.saturate}%)
            grayscale(${state.filters.grayscale}%)
            sepia(${state.filters.sepia}%)
            blur(${state.filters.blur}px)
            hue-rotate(${state.filters['hue-rotate']}deg)
        `;
        
        // Draw base image centered
        ctx.drawImage(baseImg, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
        
        ctx.restore();
        
        // Draw all saved drawings/shapes on top
        state.drawings.forEach(drawItem => {
            renderDrawingItem(drawItem);
        });

        // Draw current path/shape if drawing
        if (currentPath) renderDrawingItem(currentPath);
        if (currentShape) renderDrawingItem(currentShape);
    }

    function renderDrawingItem(item) {
        ctx.save();
        if (item.type === 'path' || item.type === 'eraser') {
            ctx.beginPath();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = item.size;
            if (item.type === 'eraser') {
                ctx.globalCompositeOperation = 'destination-out';
                ctx.strokeStyle = 'rgba(0,0,0,1)';
            } else {
                ctx.globalCompositeOperation = 'source-over';
                ctx.strokeStyle = item.color;
            }
            
            for (let i = 0; i < item.points.length; i++) {
                if (i === 0) ctx.moveTo(item.points[i].x, item.points[i].y);
                else ctx.lineTo(item.points[i].x, item.points[i].y);
            }
            ctx.stroke();
        } 
        else if (item.type === 'text') {
            ctx.font = `${item.italic ? 'italic ' : ''}${item.bold ? 'bold ' : ''}${item.size}px ${item.font}`;
            ctx.fillStyle = item.color;
            ctx.textBaseline = 'middle';
            ctx.fillText(item.text, item.x, item.y);
        }
        else if (item.type === 'shape') {
            ctx.beginPath();
            ctx.lineWidth = item.width;
            ctx.strokeStyle = item.color;
            ctx.fillStyle = item.fillColor;
            
            if (item.shape === 'rectangle') {
                ctx.rect(item.x, item.y, item.w, item.h);
            } else if (item.shape === 'circle') {
                const radius = Math.sqrt(item.w*item.w + item.h*item.h);
                ctx.arc(item.x, item.y, radius, 0, 2 * Math.PI);
            } else if (item.shape === 'line') {
                ctx.moveTo(item.x, item.y);
                ctx.lineTo(item.x + item.w, item.y + item.h);
            } else if (item.shape === 'triangle') {
                ctx.moveTo(item.x + item.w/2, item.y);
                ctx.lineTo(item.x + item.w, item.y + item.h);
                ctx.lineTo(item.x, item.y + item.h);
                ctx.closePath();
            }
            
            if (item.fill && item.shape !== 'line') ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    }

    // ---- History Management (Undo / Redo) ----
    function saveState() {
        // Deep copy state
        const stateCopy = {
            filters: { ...state.filters },
            transform: { ...state.transform },
            drawings: JSON.parse(JSON.stringify(state.drawings)) // Deep copy
        };
        
        // Remove future states if we are not at the end
        if (historyIndex < history.length - 1) {
            history = history.slice(0, historyIndex + 1);
        }
        
        history.push(stateCopy);
        historyIndex++;
        updateHistoryButtons();
    }

    function undo() {
        if (historyIndex > 0) {
            historyIndex--;
            loadState(history[historyIndex]);
        }
    }

    function redo() {
        if (historyIndex < history.length - 1) {
            historyIndex++;
            loadState(history[historyIndex]);
        }
    }

    function loadState(savedState) {
        state = {
            filters: { ...savedState.filters },
            transform: { ...savedState.transform },
            drawings: JSON.parse(JSON.stringify(savedState.drawings))
        };
        updateUIFromState();
        renderCanvas();
        updateHistoryButtons();
    }

    function updateHistoryButtons() {
        undoBtn.disabled = historyIndex <= 0;
        redoBtn.disabled = historyIndex >= history.length - 1;
    }

    // ---- Filter Controls ----
    const filterSliders = document.querySelectorAll('.custom-slider[data-filter]');
    filterSliders.forEach(slider => {
        slider.addEventListener('input', (e) => {
            const filter = e.target.dataset.filter;
            state.filters[filter] = e.target.value;
            e.target.parentElement.querySelector('.value').innerText = 
                e.target.value + (filter === 'blur' ? 'px' : filter === 'hue-rotate' ? 'deg' : '%');
            renderCanvas();
        });
        
        slider.addEventListener('change', () => {
            saveState();
        });
    });

    document.getElementById('reset-filters').addEventListener('click', () => {
        state.filters = { brightness: 100, contrast: 100, saturate: 100, grayscale: 0, sepia: 0, blur: 0, 'hue-rotate': 0 };
        resetSliders();
        renderCanvas();
        saveState();
    });

    function resetSliders() {
        filterSliders.forEach(slider => {
            const filter = slider.dataset.filter;
            slider.value = state.filters[filter];
            slider.parentElement.querySelector('.value').innerText = 
                slider.value + (filter === 'blur' ? 'px' : filter === 'hue-rotate' ? 'deg' : '%');
        });
    }

    function updateUIFromState() {
        resetSliders();
        // zoom isn't strictly saved in image state but visual. Keep visual zoom as is.
    }

    // ---- Transform Controls ----
    const transformBtns = document.querySelectorAll('.transform-actions button[data-action]');
    transformBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            if (action === 'rotate-left') state.transform.rotate -= 90;
            else if (action === 'rotate-right') state.transform.rotate += 90;
            else if (action === 'flip-x') state.transform.flipX *= -1;
            else if (action === 'flip-y') state.transform.flipY *= -1;
            else if (action === 'zoom-in') zoomCanvas(0.1);
            else if (action === 'zoom-out') zoomCanvas(-0.1);
            
            if (!action.startsWith('zoom')) {
                renderCanvas();
                saveState();
            }
        });
    });

    function zoomCanvas(amount) {
        visualZoom += amount;
        if (visualZoom < 0.1) visualZoom = 0.1;
        if (visualZoom > 5) visualZoom = 5;
        applyVisualTransform();
        updateZoomDisplay();
    }

    function updateZoomDisplay() {
        document.getElementById('zoom-value-display').innerText = Math.round(visualZoom * 100) + '%';
    }

    function applyVisualTransform() {
        canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${visualZoom})`;
    }

    // Panning (Middle mouse button or space+drag could be implemented, let's keep it simple with right click or wheel)
    canvasWrapper.addEventListener('wheel', (e) => {
        if(e.ctrlKey) {
            e.preventDefault();
            zoomCanvas(e.deltaY < 0 ? 0.1 : -0.1);
        } else if (activeTool === null) {
            // Pan with wheel if no tool
            panY -= e.deltaY;
            panX -= e.deltaX;
            applyVisualTransform();
        }
    });

    // ---- Drawing & Canvas Interaction ----
    function getMousePos(e) {
        const rect = canvas.getBoundingClientRect();
        // Adjust for scale
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    canvas.addEventListener('mousedown', (e) => {
        if (!isImageLoaded) return;
        if (activeTool === 'brush' || activeTool === 'eraser') {
            isDrawing = true;
            const pos = getMousePos(e);
            currentPath = {
                type: activeTool,
                points: [pos],
                color: document.getElementById('draw-color').value,
                size: parseInt(document.getElementById('draw-size').value)
            };
        } else if (activeTool === 'shapes') {
            isDrawing = true;
            const pos = getMousePos(e);
            startX = pos.x;
            startY = pos.y;
            currentShape = {
                type: 'shape',
                shape: document.querySelector('.shape-btn.active')?.dataset.shape || 'rectangle',
                x: startX,
                y: startY,
                w: 0,
                h: 0,
                color: document.getElementById('shape-color').value,
                width: parseInt(document.getElementById('shape-width').value),
                fill: document.getElementById('shape-fill').checked,
                fillColor: document.getElementById('shape-fill-color').value
            };
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!isDrawing) return;
        const pos = getMousePos(e);

        if (activeTool === 'brush' || activeTool === 'eraser') {
            currentPath.points.push(pos);
            renderCanvas();
        } else if (activeTool === 'shapes') {
            currentShape.w = pos.x - startX;
            currentShape.h = pos.y - startY;
            renderCanvas();
        }
    });

    window.addEventListener('mouseup', () => {
        if (isDrawing) {
            isDrawing = false;
            if (activeTool === 'brush' || activeTool === 'eraser') {
                if (currentPath && currentPath.points.length > 0) {
                    state.drawings.push(currentPath);
                }
                currentPath = null;
            } else if (activeTool === 'shapes') {
                if (currentShape && (currentShape.w !== 0 || currentShape.h !== 0)) {
                    state.drawings.push(currentShape);
                }
                currentShape = null;
            }
            renderCanvas();
            saveState();
        }
    });

    // Text tool placement
    canvas.addEventListener('click', (e) => {
        if (!isImageLoaded) return;
        if (activeTool === 'text') {
            const textVal = document.getElementById('text-input').value;
            if (!textVal.trim()) {
                showToast('Please enter text in the properties panel first', 'error');
                return;
            }
            const pos = getMousePos(e);
            state.drawings.push({
                type: 'text',
                text: textVal,
                x: pos.x,
                y: pos.y,
                font: document.getElementById('font-family').value,
                size: parseInt(document.getElementById('text-size').value),
                color: document.getElementById('text-color').value,
                bold: document.getElementById('text-bold').classList.contains('active'),
                italic: document.getElementById('text-italic').classList.contains('active')
            });
            renderCanvas();
            saveState();
            document.getElementById('text-input').value = ''; // clear input
        }
    });

    // ---- Mode Activators ----
    function activateDrawMode() {
        activeTool = document.querySelector('.tool-mode-btn.active').dataset.mode;
    }
    
    document.querySelectorAll('.tool-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tool-mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeTool = btn.dataset.mode;
        });
    });

    function activateTextMode() {
        activeTool = 'text';
    }

    function activateShapeMode() {
        activeTool = 'shapes';
    }

    document.querySelectorAll('.shape-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.shape-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Sub-tool properties sync
    document.getElementById('draw-size').addEventListener('input', (e) => {
        document.getElementById('draw-size-val').innerText = e.target.value + 'px';
    });
    document.getElementById('text-size').addEventListener('input', (e) => {
        document.getElementById('text-size-val').innerText = e.target.value + 'px';
    });
    document.getElementById('shape-width').addEventListener('input', (e) => {
        document.getElementById('shape-width-val').innerText = e.target.value + 'px';
    });
    document.getElementById('text-bold').addEventListener('click', (e) => {
        e.currentTarget.classList.toggle('active');
    });
    document.getElementById('text-italic').addEventListener('click', (e) => {
        e.currentTarget.classList.toggle('active');
    });
    document.getElementById('shape-fill').addEventListener('change', (e) => {
        if(e.target.checked) document.getElementById('shape-fill-color-group').classList.remove('hidden');
        else document.getElementById('shape-fill-color-group').classList.add('hidden');
    });
    
    // Add Text Button in panel (puts it in center)
    document.getElementById('add-text-btn').addEventListener('click', () => {
        if (!isImageLoaded) return;
        const textVal = document.getElementById('text-input').value;
        if (!textVal.trim()) {
            showToast('Please enter text', 'error');
            return;
        }
        state.drawings.push({
            type: 'text',
            text: textVal,
            x: canvas.width / 2,
            y: canvas.height / 2,
            font: document.getElementById('font-family').value,
            size: parseInt(document.getElementById('text-size').value),
            color: document.getElementById('text-color').value,
            bold: document.getElementById('text-bold').classList.contains('active'),
            italic: document.getElementById('text-italic').classList.contains('active')
        });
        renderCanvas();
        saveState();
        document.getElementById('text-input').value = ''; 
    });

    // ---- Resize Tool ----
    document.getElementById('apply-resize-btn').addEventListener('click', () => {
        if (!isImageLoaded) return;
        const newW = parseInt(document.getElementById('resize-w').value);
        const newH = parseInt(document.getElementById('resize-h').value);
        
        if (!newW || !newH || newW <= 0 || newH <= 0) {
            showToast('Invalid dimensions', 'error');
            return;
        }

        // To safely resize, we bake the current canvas, resize, and set as new base Image
        showLoading(true);
        setTimeout(() => {
            // First get the fully rendered current image
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = newW;
            tempCanvas.height = newH;
            const tCtx = tempCanvas.getContext('2d');
            
            // Draw current canvas onto temp canvas with new size
            tCtx.drawImage(canvas, 0, 0, newW, newH);
            
            const newSrc = tempCanvas.toDataURL('image/png');
            
            const newImg = new Image();
            newImg.onload = () => {
                baseImg = newImg;
                canvas.width = newW;
                canvas.height = newH;
                
                // Reset states since we baked it
                state.filters = { brightness: 100, contrast: 100, saturate: 100, grayscale: 0, sepia: 0, blur: 0, 'hue-rotate': 0 };
                state.transform = { rotate: 0, flipX: 1, flipY: 1 };
                state.drawings = [];
                
                resetSliders();
                renderCanvas();
                saveState();
                showLoading(false);
                showToast('Image resized', 'success');
            };
            newImg.src = newSrc;
        }, 100);
    });

    // Auto aspect ratio sync for resize
    const resizeW = document.getElementById('resize-w');
    const resizeH = document.getElementById('resize-h');
    const aspectCb = document.getElementById('maintain-aspect');
    
    // Set initial values when tool is clicked
    document.querySelector('.tool-btn[data-tool="resize"]').addEventListener('click', () => {
        if (isImageLoaded) {
            resizeW.value = canvas.width;
            resizeH.value = canvas.height;
        }
    });

    resizeW.addEventListener('input', () => {
        if (aspectCb.checked && isImageLoaded) {
            const ratio = canvas.height / canvas.width;
            resizeH.value = Math.round(resizeW.value * ratio);
        }
    });
    resizeH.addEventListener('input', () => {
        if (aspectCb.checked && isImageLoaded) {
            const ratio = canvas.width / canvas.height;
            resizeW.value = Math.round(resizeH.value * ratio);
        }
    });


    // ---- Keyboard Shortcuts ----
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'z') {
            e.preventDefault();
            undo();
        } else if (e.ctrlKey && e.key === 'y') {
            e.preventDefault();
            redo();
        } else if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            if (isImageLoaded) showExportModal();
        }
    });

    // ---- Export Modal ----
    const exportModal = document.getElementById('export-modal');
    downloadBtn.addEventListener('click', showExportModal);
    document.querySelector('.close-modal').addEventListener('click', hideExportModal);
    document.getElementById('cancel-export').addEventListener('click', hideExportModal);
    
    const exportQualitySlider = document.getElementById('export-quality');
    exportQualitySlider.addEventListener('input', (e) => {
        document.getElementById('quality-val').innerText = e.target.value + '%';
    });
    
    document.getElementById('export-format').addEventListener('change', (e) => {
        if (e.target.value === 'image/png') {
            document.getElementById('export-quality-group').classList.add('hidden');
        } else {
            document.getElementById('export-quality-group').classList.remove('hidden');
        }
    });

    document.getElementById('confirm-export').addEventListener('click', () => {
        const format = document.getElementById('export-format').value;
        const quality = parseInt(exportQualitySlider.value) / 100;
        const filename = document.getElementById('export-filename').value || 'edited-image';
        
        const ext = format === 'image/jpeg' ? 'jpg' : format === 'image/webp' ? 'webp' : 'png';
        const link = document.createElement('a');
        link.download = `${filename}.${ext}`;
        link.href = canvas.toDataURL(format, quality);
        link.click();
        
        hideExportModal();
        showToast('Image exported successfully', 'success');
    });

    function showExportModal() {
        exportModal.classList.add('active');
    }
    function hideExportModal() {
        exportModal.classList.remove('active');
    }

    // ---- Utilities ----
    function toggleTheme() {
        const html = document.documentElement;
        const current = html.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        html.setAttribute('data-theme', next);
        localStorage.setItem('pixelForgeTheme', next);
        themeToggle.querySelector('i').className = next === 'dark' ? 'bx bx-moon' : 'bx bx-sun';
    }

    function initTheme() {
        const saved = localStorage.getItem('pixelForgeTheme') || 'dark';
        document.documentElement.setAttribute('data-theme', saved);
        themeToggle.querySelector('i').className = saved === 'dark' ? 'bx bx-moon' : 'bx bx-sun';
    }

    function showLoading(show) {
        if (show) loadingOverlay.classList.remove('hidden');
        else loadingOverlay.classList.add('hidden');
    }

    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i class='bx ${type === 'success' ? 'bx-check-circle' : 'bx-error-circle'}'></i>
            <span>${message}</span>
        `;
        toastContainer.appendChild(toast);
        
        // Trigger animation
        setTimeout(() => toast.classList.add('show'), 10);
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
});
