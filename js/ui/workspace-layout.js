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
                    if (el) {
                        el.style.setProperty('--layer-panel-height', parseInt(layerHeight) + 'px');
                        el.style.height = parseInt(layerHeight) + 'px';
                    }
                }

                const layerWidth = localStorage.getItem('desu_layer_panel_width');
                if (layerWidth && !isNaN(parseInt(layerWidth))) {
                    const el = document.getElementById('layer-panel');
                    if (el) {
                        el.style.setProperty('--layer-panel-width', parseInt(layerWidth) + 'px');
                        el.style.width = parseInt(layerWidth) + 'px';
                    }
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
                            layerPanel.style.removeProperty('--layer-panel-width');
                            layerPanel.style.width = '';
                            const h = localStorage.getItem('desu_layer_panel_height');
                            const finalH = (h && !isNaN(parseInt(h))) ? parseInt(h) : 280;
                            layerPanel.style.setProperty('--layer-panel-height', finalH + 'px');
                            layerPanel.style.height = finalH + 'px';
                        }
                    } else {
                        wrapper.classList.add('is-side-by-side');
                        if (layerPanel) {
                            layerPanel.style.removeProperty('height');
                            layerPanel.style.removeProperty('--layer-panel-height');
                            layerPanel.style.height = '';
                            const w = localStorage.getItem('desu_layer_panel_width');
                            const finalW = (w && !isNaN(parseInt(w))) ? parseInt(w) : 240;
                            layerPanel.style.setProperty('--layer-panel-width', finalW + 'px');
                            layerPanel.style.width = finalW + 'px';
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
            const rightWrapper = document.getElementById('right-panels-wrapper');
            const drawerEl = document.getElementById('btm-drawer');

            // Splitter 1: Canvas to Right Panels
            const splitterRight = document.getElementById('splitter-canvas-right');
            if (splitterRight && rightWrapper) {
                this.initDraggableSplitter(
                    splitterRight,
                    () => ({ initialW: rightWrapper.offsetWidth }),
                    (deltaX, deltaY, data) => {
                        const newW = Math.max(220, Math.min(window.innerWidth - 300, data.initialW - deltaX));
                        rightWrapper.style.width = newW + 'px';
                        rightWrapper.style.setProperty('--right-panels-width', newW + 'px');
                        data.finalVal = newW;
                    },
                    (data) => {
                        if (data && data.finalVal) {
                            try { localStorage.setItem('desu_right_panels_width', data.finalVal); } catch(e){}
                        }
                        this.notifyCanvasResize();
                    }
                );
            }

            // Splitter 2: Layer Panel to AI Controls (Area 4 & Area 5)
            const splitterInner = document.getElementById('splitter-layer-controls');
            const layerPanel = document.getElementById('layer-panel');
            if (splitterInner && layerPanel) {
                this.initDraggableSplitter(
                    splitterInner,
                    () => ({
                        initialH: layerPanel.offsetHeight,
                        initialW: layerPanel.offsetWidth,
                        wrapperH: rightWrapper ? rightWrapper.offsetHeight : window.innerHeight,
                        wrapperW: rightWrapper ? rightWrapper.offsetWidth : 500
                    }),
                    (deltaX, deltaY, data) => {
                        if (this.isStackMode) {
                            const maxH = Math.max(100, data.wrapperH - 120);
                            const newH = Math.max(80, Math.min(maxH, data.initialH + deltaY));
                            layerPanel.style.height = newH + 'px';
                            layerPanel.style.setProperty('--layer-panel-height', newH + 'px');
                            data.finalVal = newH;
                        } else {
                            const maxW = Math.max(140, data.wrapperW - 160);
                            const newW = Math.max(120, Math.min(maxW, data.initialW + deltaX));
                            layerPanel.style.width = newW + 'px';
                            layerPanel.style.setProperty('--layer-panel-width', newW + 'px');
                            data.finalVal = newW;
                        }
                    },
                    (data) => {
                        if (data && data.finalVal) {
                            try {
                                if (this.isStackMode) {
                                    localStorage.setItem('desu_layer_panel_height', data.finalVal);
                                } else {
                                    localStorage.setItem('desu_layer_panel_width', data.finalVal);
                                }
                            } catch(e){}
                        }
                    }
                );
            }

            // Splitter 3: Left Flyout Area to Canvas
            const splitterLeft = document.getElementById('splitter-left-canvas');
            if (splitterLeft) {
                this.initDraggableSplitter(
                    splitterLeft,
                    () => {
                        const visible = document.querySelector('.left_area:not([style*="display: none"])');
                        return { el: visible, initialW: visible ? visible.offsetWidth : 0 };
                    },
                    (deltaX, deltaY, data) => {
                        if (!data.el) return;
                        const newW = Math.max(140, Math.min(650, data.initialW + deltaX));
                        data.el.style.width = newW + 'px';
                        data.el.style.minWidth = newW + 'px';
                        data.el.style.maxWidth = newW + 'px';
                        data.finalVal = newW;
                    },
                    (data) => {
                        if (data && data.finalVal) {
                            try { localStorage.setItem('desu_left_area_width', data.finalVal); } catch(e){}
                        }
                        this.notifyCanvasResize();
                    }
                );
            }

            // Splitter 4: Drawer Top Resizer (when docked to Bottom)
            const splitterDrawerTop = document.getElementById('splitter-drawer-top');
            if (splitterDrawerTop && drawerEl) {
                this.initDraggableSplitter(
                    splitterDrawerTop,
                    () => ({ initialH: drawerEl.offsetHeight }),
                    (deltaX, deltaY, data) => {
                        if (this.drawerDockMode !== 'bottom') return;
                        const newH = Math.max(160, Math.min(window.innerHeight * 0.85, data.initialH - deltaY));
                        drawerEl.style.setProperty('--drawer-bottom-height', newH + 'px');
                        drawerEl.style.height = newH + 'px';
                        data.finalVal = newH;
                    },
                    (data) => {
                        if (data && data.finalVal) {
                            try { localStorage.setItem('desu_drawer_height', data.finalVal); } catch(e){}
                        }
                    }
                );
            }

            // Splitter 5: Drawer Left Resizer (when docked to Right)
            const splitterDrawerLeft = document.getElementById('splitter-drawer-left');
            if (splitterDrawerLeft && drawerEl) {
                this.initDraggableSplitter(
                    splitterDrawerLeft,
                    () => ({ initialW: drawerEl.offsetWidth }),
                    (deltaX, deltaY, data) => {
                        if (this.drawerDockMode !== 'right') return;
                        const newW = Math.max(280, Math.min(window.innerWidth * 0.85, data.initialW - deltaX));
                        drawerEl.style.setProperty('--drawer-right-width', newW + 'px');
                        drawerEl.style.width = newW + 'px';
                        data.finalVal = newW;
                    },
                    (data) => {
                        if (data && data.finalVal) {
                            try { localStorage.setItem('desu_drawer_width', data.finalVal); } catch(e){}
                        }
                    }
                );
            }
        },

        initDraggableSplitter(splitterEl, getInitData, onMove, onEnd) {
            if (!splitterEl) return;

            splitterEl.addEventListener('pointerdown', (e) => {
                if (e.button !== undefined && e.button !== 0) return;

                e.preventDefault();
                e.stopPropagation();

                const initData = getInitData ? getInitData() : {};
                const startX = e.clientX;
                const startY = e.clientY;

                splitterEl.classList.add('is-active');
                document.body.classList.add('is-layout-dragging');

                try {
                    splitterEl.setPointerCapture(e.pointerId);
                } catch (err) {}

                const handlePointerMove = (moveEvent) => {
                    moveEvent.preventDefault();
                    const deltaX = moveEvent.clientX - startX;
                    const deltaY = moveEvent.clientY - startY;
                    if (onMove) onMove(deltaX, deltaY, initData);
                };

                const handlePointerUp = (upEvent) => {
                    try {
                        splitterEl.releasePointerCapture(upEvent.pointerId);
                    } catch (err) {}

                    splitterEl.classList.remove('is-active');
                    document.body.classList.remove('is-layout-dragging');

                    window.removeEventListener('pointermove', handlePointerMove, { capture: true });
                    window.removeEventListener('pointerup', handlePointerUp, { capture: true });
                    window.removeEventListener('pointercancel', handlePointerUp, { capture: true });

                    if (onEnd) onEnd(initData);
                };

                window.addEventListener('pointermove', handlePointerMove, { capture: true, passive: false });
                window.addEventListener('pointerup', handlePointerUp, { capture: true });
                window.addEventListener('pointercancel', handlePointerUp, { capture: true });
            });
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => window.WorkspaceLayout.init());
    } else {
        window.WorkspaceLayout.init();
    }
})();
