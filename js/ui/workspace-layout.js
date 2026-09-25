/**
 * Workspace Layout Management:
 * 1. Resizable Splitters
 * 2. Collapse/Expand Right Sidebar
 * 3. Stacked vs Side-by-side for Layer & AI Panels
 * 4. Region 6 Docking (Bottom vs Right) & View (Grid vs Filmstrip)
 */
(function() {
    window.WorkspaceLayout = {
        // State flags
        isRightCollapsed: false,
        isStackMode: true, // Default to stacked for compact view
        drawerDockMode: 'bottom', // 'bottom' | 'right'
        drawerViewMode: 'single', // 'single' | 'grid'

        init() {
            this.loadStoredPreferences();
            this.applyClasses();
            this.setupSplitters();
            this.setupShortcuts();
        },

        loadStoredPreferences() {
            try {
                const stack = localStorage.getItem('desu_layout_is_stacked');
                if (stack !== null) this.isStackMode = (stack === 'true');

                const collapsed = localStorage.getItem('desu_layout_is_collapsed');
                if (collapsed !== null) this.isRightCollapsed = (collapsed === 'true');

                const dock = localStorage.getItem('desu_drawer_dock_mode');
                if (dock === 'right' || dock === 'bottom') this.drawerDockMode = dock;

                const view = localStorage.getItem('desu_drawer_view_mode');
                if (view === 'grid' || view === 'single') this.drawerViewMode = view;

                // Load custom widths/heights
                const rightWidth = localStorage.getItem('desu_right_panels_width');
                if (rightWidth) {
                    const el = document.getElementById('right-panels-wrapper');
                    if (el) el.style.width = rightWidth + 'px';
                }

                const layerHeight = localStorage.getItem('desu_layer_panel_height');
                if (layerHeight) {
                    const el = document.getElementById('layer-panel');
                    if (el) el.style.height = layerHeight + 'px';
                }

                const layerWidth = localStorage.getItem('desu_layer_panel_width');
                if (layerWidth) {
                    const el = document.getElementById('layer-panel');
                    if (el) el.style.width = layerWidth + 'px';
                }
            } catch (e) {
                console.warn('WorkspaceLayout: failed to load preferences', e);
            }
        },

        applyClasses() {
            const head = document.getElementById('head-id');
            const wrapper = document.getElementById('right-panels-wrapper');
            const drawer = document.getElementById('btm-drawer');

            if (wrapper) {
                wrapper.classList.remove('is-stacked', 'is-side-by-side', 'is-collapsed');
                if (this.isRightCollapsed) {
                    wrapper.classList.add('is-collapsed');
                    if (head) head.classList.add('is-right-collapsed');
                } else {
                    if (head) head.classList.remove('is-right-collapsed');
                    if (this.isStackMode) {
                        wrapper.classList.add('is-stacked');
                    } else {
                        wrapper.classList.add('is-side-by-side');
                    }
                }
            }

            if (drawer) {
                drawer.classList.remove('dock-bottom', 'dock-right', 'view-grid', 'view-single');
                drawer.classList.add(`dock-${this.drawerDockMode}`);
                drawer.classList.add(`view-${this.drawerViewMode}`);
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

            const btnView = document.getElementById('btm-btn-toggle-view');
            if (btnView) {
                const label = btnView.querySelector('#btm-view-label');
                const icon = btnView.querySelector('.material-symbols-outlined');
                if (this.drawerViewMode === 'grid') {
                    if (label) label.textContent = '胶卷视图';
                    if (icon) icon.textContent = 'view_stream';
                    btnView.title = '切换为单行胶卷视图';
                } else {
                    if (label) label.textContent = '网格视图';
                    if (icon) icon.textContent = 'grid_view';
                    btnView.title = '切换为多行网格视图 (imagesorter.io 风格)';
                }
            }
        },

        // Toggle Stack mode vs Side-by-side
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

        // Toggle Right Sidebar Collapse
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

        // Toggle Region 6 Dock Mode (Bottom vs Right)
        toggleDrawerDockMode() {
            this.drawerDockMode = (this.drawerDockMode === 'bottom') ? 'right' : 'bottom';
            try {
                localStorage.setItem('desu_drawer_dock_mode', this.drawerDockMode);
            } catch (e) {}

            // When switching to right dock, automatically set grid view for better vertical fit
            if (this.drawerDockMode === 'right') {
                this.drawerViewMode = 'grid';
                try {
                    localStorage.setItem('desu_drawer_view_mode', 'grid');
                } catch (e) {}
            }

            this.applyClasses();
            if (typeof btmUpdateScrollButtons === 'function') btmUpdateScrollButtons();
            if (typeof createToast === 'function') {
                createToast('总览栏位置', this.drawerDockMode === 'right' ? '已吸附停靠至屏幕右侧' : '已吸附停靠至屏幕底部');
            }
        },

        // Toggle Region 6 View Mode (Single vs Grid)
        toggleDrawerViewMode() {
            this.drawerViewMode = (this.drawerViewMode === 'single') ? 'grid' : 'single';
            try {
                localStorage.setItem('desu_drawer_view_mode', this.drawerViewMode);
            } catch (e) {}
            this.applyClasses();
            if (typeof btmUpdateScrollButtons === 'function') btmUpdateScrollButtons();
            if (typeof createToast === 'function') {
                createToast('总览栏视图', this.drawerViewMode === 'grid' ? '已切换为：多行网格展示' : '已切换为：单行胶卷展示');
            }
        },

        notifyCanvasResize() {
            setTimeout(() => {
                window.dispatchEvent(new Event('resize'));
                if (typeof adjustCanvasSize === 'function') adjustCanvasSize();
            }, 50);
        },

        setupShortcuts() {
            window.addEventListener('keydown', (e) => {
                // Alt + ] to toggle right sidebar
                if (e.altKey && (e.key === ']' || e.code === 'BracketRight')) {
                    e.preventDefault();
                    this.toggleRightPanels();
                }
            });
        },

        setupSplitters() {
            // Splitter 1: Canvas to Right Panels
            const splitterRight = document.getElementById('splitter-canvas-right');
            const rightWrapper = document.getElementById('right-panels-wrapper');
            if (splitterRight && rightWrapper) {
                this.initDraggableSplitter(splitterRight, 'horizontal-drag', (delta) => {
                    const currentW = rightWrapper.offsetWidth;
                    const newW = Math.max(240, Math.min(850, currentW - delta));
                    rightWrapper.style.width = newW + 'px';
                    return newW;
                }, (finalVal) => {
                    try { localStorage.setItem('desu_right_panels_width', finalVal); } catch(e){}
                    this.notifyCanvasResize();
                });
            }

            // Splitter 2: Layer Panel to Controls (Inside Right Panels)
            const splitterInner = document.getElementById('splitter-layer-controls');
            const layerPanel = document.getElementById('layer-panel');
            if (splitterInner && layerPanel) {
                this.initDraggableSplitter(splitterInner, 'inner-drag', (deltaX, deltaY) => {
                    if (this.isStackMode) {
                        // Vertical resize in stacked mode
                        const currentH = layerPanel.offsetHeight;
                        const newH = Math.max(100, Math.min(window.innerHeight - 200, currentH + deltaY));
                        layerPanel.style.height = newH + 'px';
                        return newH;
                    } else {
                        // Horizontal resize in side-by-side mode
                        const currentW = layerPanel.offsetWidth;
                        const newW = Math.max(160, Math.min(460, currentW + deltaX));
                        layerPanel.style.width = newW + 'px';
                        return newW;
                    }
                }, (finalVal) => {
                    try {
                        if (this.isStackMode) {
                            localStorage.setItem('desu_layer_panel_height', finalVal);
                        } else {
                            localStorage.setItem('desu_layer_panel_width', finalVal);
                        }
                    } catch(e){}
                });
            }

            // Splitter 3: Left Flyout Area to Canvas
            const splitterLeft = document.getElementById('splitter-left-canvas');
            if (splitterLeft) {
                this.initDraggableSplitter(splitterLeft, 'horizontal-drag', (delta) => {
                    const visibleLeftArea = document.querySelector('.left_area:not([style*="display: none"])');
                    if (visibleLeftArea) {
                        const currentW = visibleLeftArea.offsetWidth;
                        const newW = Math.max(180, Math.min(600, currentW + delta));
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
        },

        initDraggableSplitter(splitterEl, type, onDrag, onEnd) {
            let startX = 0;
            let startY = 0;
            let isDragging = false;

            const onMouseMove = (e) => {
                if (!isDragging) return;
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;
                startX = e.clientX;
                startY = e.clientY;
                onDrag(deltaX, deltaY);
            };

            const onMouseUp = () => {
                if (!isDragging) return;
                isDragging = false;
                splitterEl.classList.remove('is-active');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
                if (onEnd) onEnd();
            };

            splitterEl.addEventListener('mousedown', (e) => {
                e.preventDefault();
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                splitterEl.classList.add('is-active');
                document.body.style.cursor = (type === 'horizontal-drag' || !this.isStackMode) ? 'col-resize' : 'row-resize';
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
