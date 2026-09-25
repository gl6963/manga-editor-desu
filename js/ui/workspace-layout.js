/**
 * Workspace Layout Management:
 * 1. Resizable Splitters (Left/Canvas/Right/Layer/Controls/Drawer)
 * 2. Collapse/Expand Right Sidebar
 * 3. Stacked vs Side-by-side for Layer & AI Panels
 * 4. Region 6 Docking (Bottom vs Right) & Always Multi-Row Grid & Drawer Resizers
 */
(function() {
    window.WorkspaceLayout = {
        // State flags
        isRightCollapsed: false,
        isStackMode: true, // Default to stacked for compact view
        drawerDockMode: 'bottom', // 'bottom' | 'right'

        init() {
            this.loadStoredPreferences();
            this.applyClasses();
            this.setupSplitters();
            this.setupShortcuts();
            this.setupLeftAreaObserver();
        },

        loadStoredPreferences() {
            try {
                const stack = localStorage.getItem('desu_layout_is_stacked');
                if (stack !== null) this.isStackMode = (stack === 'true');

                const collapsed = localStorage.getItem('desu_layout_is_collapsed');
                if (collapsed !== null) this.isRightCollapsed = (collapsed === 'true');

                const dock = localStorage.getItem('desu_drawer_dock_mode');
                if (dock === 'right' || dock === 'bottom') this.drawerDockMode = dock;

                // Load custom widths/heights
                const rightWidth = localStorage.getItem('desu_right_panels_width');
                if (rightWidth && !isNaN(parseInt(rightWidth))) {
                    const el = document.getElementById('right-panels-wrapper');
                    if (el) el.style.width = parseInt(rightWidth) + 'px';
                }

                const layerHeight = localStorage.getItem('desu_layer_panel_height');
                if (layerHeight && !isNaN(parseInt(layerHeight))) {
                    const el = document.getElementById('layer-panel');
                    if (el) el.style.height = parseInt(layerHeight) + 'px';
                }

                const layerWidth = localStorage.getItem('desu_layer_panel_width');
                if (layerWidth && !isNaN(parseInt(layerWidth))) {
                    const el = document.getElementById('layer-panel');
                    if (el) el.style.width = parseInt(layerWidth) + 'px';
                }

                const drawerHeight = localStorage.getItem('desu_drawer_height');
                if (drawerHeight && !isNaN(parseInt(drawerHeight))) {
                    const el = document.getElementById('btm-drawer');
                    if (el) {
                        el.style.setProperty('--drawer-bottom-height', parseInt(drawerHeight) + 'px');
                        el.style.height = parseInt(drawerHeight) + 'px';
                    }
                }

                const drawerWidth = localStorage.getItem('desu_drawer_width');
                if (drawerWidth && !isNaN(parseInt(drawerWidth))) {
                    const el = document.getElementById('btm-drawer');
                    if (el) {
                        el.style.setProperty('--drawer-right-width', parseInt(drawerWidth) + 'px');
                        el.style.width = parseInt(drawerWidth) + 'px';
                    }
                }
            } catch (e) {
                console.warn('WorkspaceLayout: failed to load preferences', e);
            }
        },

        applyClasses() {
            const head = document.getElementById('head-id');
            const wrapper = document.getElementById('right-panels-wrapper');
            const drawer = document.getElementById('btm-drawer');
            const layerPanel = document.getElementById('layer-panel');

            if (wrapper) {
                wrapper.classList.remove('is-stacked', 'is-side-by-side', 'is-collapsed');
                if (this.isRightCollapsed) {
                    wrapper.classList.add('is-collapsed');
                    if (head) head.classList.add('is-right-collapsed');
                } else {
                    if (head) head.classList.remove('is-right-collapsed');
                    if (this.isStackMode) {
                        wrapper.classList.add('is-stacked');
                        if (layerPanel) {
                            layerPanel.style.removeProperty('width');
                            layerPanel.style.width = '';
                            const h = localStorage.getItem('desu_layer_panel_height');
                            if (h && !isNaN(parseInt(h))) {
                                layerPanel.style.height = parseInt(h) + 'px';
                            } else {
                                layerPanel.style.removeProperty('height');
                                layerPanel.style.height = '';
                            }
                        }
                    } else {
                        wrapper.classList.add('is-side-by-side');
                        if (layerPanel) {
                            layerPanel.style.removeProperty('height');
                            layerPanel.style.height = '';
                            const w = localStorage.getItem('desu_layer_panel_width');
                            if (w && !isNaN(parseInt(w))) {
                                layerPanel.style.width = parseInt(w) + 'px';
                            } else {
                                layerPanel.style.removeProperty('width');
                                layerPanel.style.width = '';
                            }
                        }
                    }
                }
            }

            if (drawer) {
                drawer.classList.remove('dock-bottom', 'dock-right', 'view-single');
                drawer.classList.add(`dock-${this.drawerDockMode}`);
                drawer.classList.add('view-grid'); // Region 6 is always multi-row grid

                if (this.drawerDockMode === 'bottom') {
                    // Completely clear all right-dock inline styling
                    drawer.style.removeProperty('width');
                    drawer.style.removeProperty('top');
                    drawer.style.removeProperty('bottom');
                    drawer.style.removeProperty('right');
                    drawer.style.removeProperty('max-width');
                    drawer.style.removeProperty('min-width');
                    drawer.style.width = '';
                    drawer.style.left = '';
                    drawer.style.right = '';
                    drawer.style.top = '';

                    const h = localStorage.getItem('desu_drawer_height');
                    const finalH = (h && !isNaN(parseInt(h))) ? parseInt(h) : 360;
                    drawer.style.setProperty('--drawer-bottom-height', finalH + 'px');
                    drawer.style.height = finalH + 'px';
                } else {
                    // Completely clear all bottom-dock inline styling
                    drawer.style.removeProperty('height');
                    drawer.style.removeProperty('left');
                    drawer.style.removeProperty('max-height');
                    drawer.style.removeProperty('min-height');
                    drawer.style.height = '';
                    drawer.style.left = '';

                    const w = localStorage.getItem('desu_drawer_width');
                    const finalW = (w && !isNaN(parseInt(w))) ? parseInt(w) : 400;
                    drawer.style.setProperty('--drawer-right-width', finalW + 'px');
                    drawer.style.width = finalW + 'px';
                }
            }

            this.updateButtonLabels();
            this.notifyCanvasResize();
        },

        updateButtonLabels() {
            const btnStack = document.getElementById('btn-toggle-stack-mode');
            if (btnStack) {
                btnStack.title = this.isStackMode ? '切换为并排双列 (当前: 上下堆叠)' : '切换为上下堆叠 (当前: 并排双列)';
                const icon = btnStack.querySelector('.material-symbols-outlined, .material-icons');
                if (icon) icon.textContent = this.isStackMode ? 'view_column' : 'view_agenda';
            }

            const btnDock = document.getElementById('btm-btn-toggle-dock');
            if (btnDock) {
                const label = btnDock.querySelector('#btm-dock-label');
                const icon = btnDock.querySelector('.material-symbols-outlined');
                if (this.drawerDockMode === 'right') {
                    if (label) label.textContent = '靠底停靠';
                    if (icon) icon.textContent = 'dock_to_bottom';
                    btnDock.title = '切换到屏幕底部停靠';
                } else {
                    if (label) label.textContent = '靠右停靠';
                    if (icon) icon.textContent = 'dock_to_right';
                    btnDock.title = '切换到屏幕右侧停靠';
                }
            }
        },

        toggleStackMode() {
            this.isStackMode = !this.isStackMode;
            try {
                localStorage.setItem('desu_layout_is_stacked', this.isStackMode.toString());
            } catch (e) {}
            this.applyClasses();
            if (typeof createToast === 'function') {
                createToast('布局切换', this.isStackMode ? '右侧已切换为：单列上下堆叠' : '右侧已切换为：双列横向并排');
            }
        },

        toggleRightPanels() {
            this.isRightCollapsed = !this.isRightCollapsed;
            try {
                localStorage.setItem('desu_layout_is_collapsed', this.isRightCollapsed.toString());
            } catch (e) {}
            this.applyClasses();
            if (typeof createToast === 'function') {
                createToast('工作区', this.isRightCollapsed ? '右侧工作栏已折叠（全屏画板）' : '右侧工作栏已展开');
            }
        },

        toggleDrawerDockMode() {
            this.drawerDockMode = (this.drawerDockMode === 'bottom') ? 'right' : 'bottom';
            try {
                localStorage.setItem('desu_drawer_dock_mode', this.drawerDockMode);
            } catch (e) {}

            this.applyClasses();
            if (typeof btmUpdateScrollButtons === 'function') btmUpdateScrollButtons();
            if (typeof createToast === 'function') {
                createToast('总览栏位置', this.drawerDockMode === 'right' ? '已吸附停靠至屏幕右侧' : '已吸附停靠至屏幕底部');
            }
        },

        notifyCanvasResize() {
            setTimeout(() => {
                window.dispatchEvent(new Event('resize'));
                if (typeof adjustCanvasSize === 'function') adjustCanvasSize();
            }, 60);
        },

        setupShortcuts() {
            window.addEventListener('keydown', (e) => {
                if (e.altKey && (e.key === ']' || e.code === 'BracketRight')) {
                    e.preventDefault();
                    this.toggleRightPanels();
                }
            });
        },

        setupLeftAreaObserver() {
            const head = document.getElementById('head-id');
            if (head) {
                const checkLeftArea = () => {
                    const visible = document.querySelector('.left_area:not([style*="display: none"])');
                    if (visible) {
                        head.classList.add('has-left-area-open');
                    } else {
                        head.classList.remove('has-left-area-open');
                    }
                };
                const observer = new MutationObserver(checkLeftArea);
                observer.observe(head, { attributes: true, subtree: true, attributeFilter: ['style'] });
                checkLeftArea();
            }
        },

        setupSplitters() {
            // Splitter 1: Canvas to Right Panels
            const splitterRight = document.getElementById('splitter-canvas-right');
            const rightWrapper = document.getElementById('right-panels-wrapper');
            if (splitterRight && rightWrapper) {
                this.initDraggableSplitter(splitterRight, 'horizontal-drag', (deltaX) => {
                    const currentW = rightWrapper.offsetWidth;
                    const newW = Math.max(220, Math.min(window.innerWidth - 300, currentW - deltaX));
                    rightWrapper.style.width = newW + 'px';
                    return newW;
                }, (finalVal) => {
                    if (finalVal) {
                        try { localStorage.setItem('desu_right_panels_width', finalVal); } catch(e){}
                    }
                    this.notifyCanvasResize();
                });
            }

            // Splitter 2: Layer Panel to Controls (Inside Right Panels)
            const splitterInner = document.getElementById('splitter-layer-controls');
            const layerPanel = document.getElementById('layer-panel');
            if (splitterInner && layerPanel) {
                this.initDraggableSplitter(splitterInner, 'inner-drag', (deltaX, deltaY) => {
                    if (this.isStackMode) {
                        const currentH = layerPanel.offsetHeight;
                        const newH = Math.max(100, Math.min(window.innerHeight - 200, currentH + deltaY));
                        layerPanel.style.height = newH + 'px';
                        return newH;
                    } else {
                        const currentW = layerPanel.offsetWidth;
                        const newW = Math.max(160, Math.min(rightWrapper ? rightWrapper.offsetWidth - 160 : 460, currentW + deltaX));
                        layerPanel.style.width = newW + 'px';
                        return newW;
                    }
                }, (finalVal) => {
                    if (finalVal) {
                        try {
                            if (this.isStackMode) {
                                localStorage.setItem('desu_layer_panel_height', finalVal);
                            } else {
                                localStorage.setItem('desu_layer_panel_width', finalVal);
                            }
                        } catch(e){}
                    }
                });
            }

            // Splitter 3: Left Flyout Area to Canvas
            const splitterLeft = document.getElementById('splitter-left-canvas');
            if (splitterLeft) {
                this.initDraggableSplitter(splitterLeft, 'horizontal-drag', (deltaX) => {
                    const visibleLeftArea = document.querySelector('.left_area:not([style*="display: none"])');
                    if (visibleLeftArea) {
                        const currentW = visibleLeftArea.offsetWidth;
                        const newW = Math.max(160, Math.min(650, currentW + deltaX));
                        visibleLeftArea.style.width = newW + 'px';
                        visibleLeftArea.style.minWidth = newW + 'px';
                        visibleLeftArea.style.maxWidth = newW + 'px';
                        return newW;
                    }
                    return null;
                }, (finalVal) => {
                    if (finalVal) {
                        try { localStorage.setItem('desu_left_area_width', finalVal); } catch(e){}
                    }
                    this.notifyCanvasResize();
                });
            }

            // Splitter 4: Drawer Top Resizer (when docked to Bottom)
            const splitterDrawerTop = document.getElementById('splitter-drawer-top');
            const drawerEl = document.getElementById('btm-drawer');
            if (splitterDrawerTop && drawerEl) {
                this.initDraggableSplitter(splitterDrawerTop, 'row-resize', (deltaX, deltaY) => {
                    if (this.drawerDockMode !== 'bottom') return null;
                    const currentH = drawerEl.offsetHeight;
                    const newH = Math.max(160, Math.min(window.innerHeight * 0.85, currentH - deltaY));
                    drawerEl.style.setProperty('--drawer-bottom-height', newH + 'px');
                    drawerEl.style.height = newH + 'px';
                    return newH;
                }, (finalVal) => {
                    if (finalVal) {
                        try { localStorage.setItem('desu_drawer_height', finalVal); } catch(e){}
                    }
                });
            }

            // Splitter 5: Drawer Left Resizer (when docked to Right)
            const splitterDrawerLeft = document.getElementById('splitter-drawer-left');
            if (splitterDrawerLeft && drawerEl) {
                this.initDraggableSplitter(splitterDrawerLeft, 'col-resize', (deltaX) => {
                    if (this.drawerDockMode !== 'right') return null;
                    const currentW = drawerEl.offsetWidth;
                    const newW = Math.max(280, Math.min(window.innerWidth * 0.85, currentW - deltaX));
                    drawerEl.style.setProperty('--drawer-right-width', newW + 'px');
                    drawerEl.style.width = newW + 'px';
                    return newW;
                }, (finalVal) => {
                    if (finalVal) {
                        try { localStorage.setItem('desu_drawer_width', finalVal); } catch(e){}
                    }
                });
            }
        },

        initDraggableSplitter(splitterEl, type, onDrag, onEnd) {
            let startX = 0;
            let startY = 0;
            let isDragging = false;
            let lastVal = null;

            const onMouseMove = (e) => {
                if (!isDragging) return;
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;
                startX = e.clientX;
                startY = e.clientY;
                lastVal = onDrag(deltaX, deltaY);
            };

            const onMouseUp = () => {
                if (!isDragging) return;
                isDragging = false;
                splitterEl.classList.remove('is-active');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
                if (onEnd) onEnd(lastVal);
            };

            splitterEl.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                splitterEl.classList.add('is-active');
                if (type === 'horizontal-drag' || type === 'col-resize' || (type === 'inner-drag' && !this.isStackMode)) {
                    document.body.style.cursor = 'col-resize';
                } else {
                    document.body.style.cursor = 'row-resize';
                }
                document.body.style.userSelect = 'none';
                window.addEventListener('mousemove', onMouseMove);
                window.addEventListener('mouseup', onMouseUp);
            });
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => window.WorkspaceLayout.init());
    } else {
        window.WorkspaceLayout.init();
    }
})();
