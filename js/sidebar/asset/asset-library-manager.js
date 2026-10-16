/**
 * asset-library-manager.js
 * 素材库管理模块：
 * 1. 采用本地文件夹虚拟挂载 (File System Access API) 无损读取本地素材，不占页面内存；
 * 2. IDE 风格多层级文件夹树状目录，支持展开/收起、快速检索与分类过滤；
 * 3. 素材网格缩略图卡片展示，支持多选与批量管理；
 * 4. 支持 HTML5 原生拖拽直接上屏：拖入分镜格自动自适应裁剪入框，拖入空白处生成独立图层。
 */

const AssetLibraryManager = {
    DB_NAME: 'desu_asset_library_db',
    DB_STORE: 'handles',
    DB_KEY: 'active_root_handle',

    rootHandle: null,
    rootTree: null,
    activeFolderId: null,
    folderExpandedMap: new Map(), // folderId -> boolean
    allFilesList: [],
    searchQuery: '',
    batchMode: false,
    selectedFileIds: new Set(),
    objectUrlCache: new Map(), // fileId -> objectUrl
    activeDragItem: null,
    hoveredTargetFrame: null,
    sortMode: (function(){ try { return localStorage.getItem('desu_asset_sort_mode') || 'name-asc'; } catch(e){ return 'name-asc'; } })(),

    async init() {
        this.bindCanvasDropEvents();
        await this.tryRestoreSavedHandle();
        this.render();
    },

    // ==========================================
    // 1. IndexedDB 存储与持久化
    // ==========================================
    getDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.DB_NAME, 1);
            req.onupgradeneeded = () => {
                req.result.createObjectStore(this.DB_STORE);
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    async saveSavedHandle(handle) {
        try {
            const db = await this.getDB();
            const tx = db.transaction(this.DB_STORE, 'readwrite');
            tx.objectStore(this.DB_STORE).put(handle, this.DB_KEY);
        } catch (e) {
            console.warn("Failed to store directory handle in IndexedDB", e);
        }
    },

    async getSavedHandle() {
        try {
            const db = await this.getDB();
            return new Promise((resolve) => {
                const tx = db.transaction(this.DB_STORE, 'readonly');
                const req = tx.objectStore(this.DB_STORE).get(this.DB_KEY);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            });
        } catch (e) {
            return null;
        }
    },

    async clearSavedHandle() {
        try {
            const db = await this.getDB();
            const tx = db.transaction(this.DB_STORE, 'readwrite');
            tx.objectStore(this.DB_STORE).delete(this.DB_KEY);
        } catch (e) {}
    },

    async tryRestoreSavedHandle() {
        const saved = await this.getSavedHandle();
        if (saved && saved.queryPermission) {
            try {
                const perm = await saved.queryPermission({ mode: 'read' });
                if (perm === 'granted') {
                    await this.loadDirectory(saved, false);
                } else {
                    // 需要用户手势授权，保留 handle 并在 UI 显示重新连接
                    this.savedHandlePending = saved;
                }
            } catch (e) {
                console.warn("Query permission failed", e);
            }
        }
    },

    // ==========================================
    // 2. 文件夹选择与扫描
    // ==========================================
    async chooseDirectory() {
        if (window.showDirectoryPicker) {
            try {
                const handle = await window.showDirectoryPicker({
                    id: 'manga_editor_assets',
                    mode: 'read'
                });
                await this.saveSavedHandle(handle);
                await this.loadDirectory(handle, true);
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error("Directory picker error:", err);
                    this.triggerFallbackInput();
                }
            }
        } else {
            this.triggerFallbackInput();
        }
    },

    triggerFallbackInput() {
        let input = document.getElementById('asset-folder-input-fallback');
        if (!input) {
            input = document.createElement('input');
            input.id = 'asset-folder-input-fallback';
            input.type = 'file';
            input.webkitdirectory = true;
            input.directory = true;
            input.multiple = true;
            input.style.display = 'none';
            document.body.appendChild(input);
            input.onchange = (e) => this.handleFallbackFiles(e.target.files);
        }
        input.click();
    },

    handleFallbackFiles(fileList) {
        if (!fileList || fileList.length === 0) return;
        // 构建伪目录树
        const rootNode = {
            id: 'dir_root',
            name: '本地素材库',
            path: '',
            subdirs: [],
            files: [],
            isRoot: true
        };
        const dirMap = new Map();
        dirMap.set('', rootNode);

        const validExts = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'avif'];
        for (let i = 0; i < fileList.length; i++) {
            const f = fileList[i];
            const ext = f.name.split('.').pop().toLowerCase();
            if (!validExts.includes(ext)) continue;

            const pathParts = (f.webkitRelativePath || f.name).split('/');
            pathParts.pop(); // remove filename
            const dirPath = pathParts.join('/');

            if (!dirMap.has(dirPath)) {
                const dirNode = {
                    id: 'dir_' + Math.random().toString(36).substr(2, 9),
                    name: pathParts[pathParts.length - 1] || '文件夹',
                    path: dirPath,
                    subdirs: [],
                    files: []
                };
                dirMap.set(dirPath, dirNode);
                rootNode.subdirs.push(dirNode);
            }

            const targetDir = dirMap.get(dirPath);
            targetDir.files.push({
                id: 'file_' + Math.random().toString(36).substr(2, 9),
                name: f.name,
                ext: ext,
                file: f,
                path: f.webkitRelativePath || f.name
            });
        }

        this.rootHandle = { name: '本地文件夹' };
        this.rootTree = rootNode;
        this.activeFolderId = rootNode.id;
        this.collectAllFiles(rootNode);
        this.render();
    },

    async loadDirectory(dirHandle, promptIfNeeded = false) {
        if (promptIfNeeded && dirHandle.requestPermission) {
            const perm = await dirHandle.requestPermission({ mode: 'read' });
            if (perm !== 'granted') return;
        }

        const loading = (typeof OP_showLoading === 'function')
            ? OP_showLoading({ icon: 'process', step: 'Asset', substep: 'Scanning Folders', progress: 0 })
            : null;

        try {
            this.clearObjectUrls();
            this.rootHandle = dirHandle;
            this.savedHandlePending = null;
            this.rootTree = await this.scanDirectoryHandle(dirHandle, '', true);
            this.activeFolderId = this.rootTree.id;
            this.folderExpandedMap.set(this.rootTree.id, true);
            this.collectAllFiles(this.rootTree);
            this.render();

            if (typeof createToast === 'function') {
                createToast("素材库已加载", `成功挂载素材目录【${dirHandle.name}】，共发现 ${this.allFilesList.length} 张图片`);
            }
        } catch (err) {
            console.error("Failed to load directory", err);
            if (typeof createToastError === 'function') {
                createToastError("挂载失败", err.message);
            }
        } finally {
            if (loading && typeof OP_hideLoading === 'function') {
                OP_hideLoading(loading);
            }
        }
    },

    async scanDirectoryHandle(dirHandle, currentPath = '', isRoot = false) {
        const node = {
            id: 'dir_' + Math.random().toString(36).substr(2, 9),
            name: isRoot ? dirHandle.name : dirHandle.name,
            path: currentPath ? `${currentPath}/${dirHandle.name}` : dirHandle.name,
            handle: dirHandle,
            subdirs: [],
            files: [],
            isRoot: isRoot
        };

        const validExts = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'avif'];
        for await (const entry of dirHandle.values()) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '$RECYCLE.BIN') {
                continue;
            }
            if (entry.kind === 'directory') {
                const subNode = await this.scanDirectoryHandle(entry, node.path, false);
                node.subdirs.push(subNode);
            } else if (entry.kind === 'file') {
                const ext = entry.name.split('.').pop().toLowerCase();
                if (validExts.includes(ext)) {
                    node.files.push({
                        id: 'file_' + Math.random().toString(36).substr(2, 9),
                        name: entry.name,
                        ext: ext,
                        handle: entry,
                        path: `${node.path}/${entry.name}`,
                        dirId: node.id
                    });
                }
            }
        }

        // 自然数排序
        node.subdirs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        node.files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        return node;
    },

    collectAllFiles(node) {
        this.allFilesList = [];
        const traverse = (n) => {
            if (n.files) this.allFilesList.push(...n.files);
            if (n.subdirs) n.subdirs.forEach(traverse);
        };
        traverse(node);
    },

    async refresh() {
        if (!this.rootHandle) return;
        await this.loadDirectory(this.rootHandle, false);
    },

    closeDirectory() {
        this.clearObjectUrls();
        this.rootHandle = null;
        this.rootTree = null;
        this.activeFolderId = null;
        this.allFilesList = [];
        this.selectedFileIds.clear();
        this.batchMode = false;
        this.clearSavedHandle();
        this.render();
    },

    clearObjectUrls() {
        for (const url of this.objectUrlCache.values()) {
            try { URL.revokeObjectURL(url); } catch (e) {}
        }
        this.objectUrlCache.clear();
    },

    async getFileUrl(fileItem) {
        if (this.objectUrlCache.has(fileItem.id)) {
            return this.objectUrlCache.get(fileItem.id);
        }
        let url = '';
        try {
            if (fileItem.handle && fileItem.handle.getFile) {
                const f = await fileItem.handle.getFile();
                url = URL.createObjectURL(f);
            } else if (fileItem.file) {
                url = URL.createObjectURL(fileItem.file);
            }
            if (url) {
                this.objectUrlCache.set(fileItem.id, url);
            }
        } catch (e) {
            console.warn("Failed to get object URL for", fileItem.name, e);
        }
        return url;
    },

    findNodeById(node, id) {
        if (!node) return null;
        if (node.id === id) return node;
        if (node.subdirs) {
            for (const sub of node.subdirs) {
                const found = this.findNodeById(sub, id);
                if (found) return found;
            }
        }
        return null;
    },

    countTotalFilesInNode(node) {
        let count = (node.files ? node.files.length : 0);
        if (node.subdirs) {
            node.subdirs.forEach(sub => {
                count += this.countTotalFilesInNode(sub);
            });
        }
        return count;
    },

    // ==========================================
    // 3. UI 渲染体系
    // ==========================================
    render() {
        const container = document.getElementById('asset-library-container');
        if (!container) return;

        // 如果未挂载文件夹
        if (!this.rootTree) {
            container.innerHTML = `
                <div class="asset-lib-empty-box">
                    <div class="asset-lib-empty-icon"><i class="material-icons">photo_library</i></div>
                    <div class="asset-lib-empty-title">素材库尚未挂载文件夹</div>
                    <div class="asset-lib-empty-desc">
                        直接挂载您电脑上的本地素材文件夹，不占网页内存，按需快速取用，支持将素材直接拖拽至画板分镜格中。
                    </div>
                    ${this.savedHandlePending ? `
                        <button type="button" class="btn-asset-reconnect" id="btn-asset-reconnect">
                            <i class="material-icons">offline_pin</i>
                            <span>重新连接: ${this.savedHandlePending.name || '上次文件夹'}</span>
                        </button>
                    ` : ''}
                    <button type="button" class="btn-asset-primary" id="btn-asset-open-dir">
                        <i class="material-icons">folder_open</i>
                        <span>选择本地素材文件夹</span>
                    </button>
                </div>
            `;

            const openBtn = document.getElementById('btn-asset-open-dir');
            if (openBtn) openBtn.onclick = () => this.chooseDirectory();

            const reconnectBtn = document.getElementById('btn-asset-reconnect');
            if (reconnectBtn) {
                reconnectBtn.onclick = async () => {
                    await this.loadDirectory(this.savedHandlePending, true);
                };
            }
            return;
        }

        // 已挂载文件夹：渲染完整工作区
        container.innerHTML = `
            <div class="asset-lib-main">
                <!-- 顶部主操作条 -->
                <div class="asset-lib-top-bar">
                    <div class="asset-lib-folder-info" title="${this.rootTree.name} (${this.allFilesList.length} 张图片)">
                        <i class="material-icons">folder</i>
                        <span class="asset-lib-folder-name">${this.rootTree.name}</span>
                        <span class="asset-lib-badge">${this.allFilesList.length}</span>
                    </div>
                    <div class="asset-lib-actions">
                        <button type="button" class="asset-lib-btn-icon" id="btn-asset-refresh" title="刷新本地目录"><i class="material-icons">refresh</i></button>
                        <button type="button" class="asset-lib-btn-icon ${this.batchMode ? 'is-active' : ''}" id="btn-asset-batch" title="批量管理模式"><i class="material-icons">checklist</i></button>
                        <button type="button" class="asset-lib-btn-icon" id="btn-asset-change" title="更换文件夹"><i class="material-icons">folder_open</i></button>
                        <button type="button" class="asset-lib-btn-icon" id="btn-asset-close" title="关闭并断开连接"><i class="material-icons">close</i></button>
                    </div>
                </div>

                <!-- 搜索条 -->
                <div class="asset-search-row">
                    <i class="material-icons asset-search-icon">search</i>
                    <input type="text" id="asset-search-input" class="asset-search-input" placeholder="按图片名称搜索素材..." value="${this.escapeHtml(this.searchQuery)}">
                    ${this.searchQuery ? '<button type="button" class="asset-search-clear" id="btn-asset-search-clear">×</button>' : ''}
                </div>

                <!-- 批量控制栏 -->
                ${this.batchMode ? `
                    <div class="asset-batch-toolbar">
                        <div class="asset-batch-stat">已选 <strong>${this.selectedFileIds.size}</strong> 项</div>
                        <div class="asset-batch-btns">
                            <button type="button" class="asset-batch-btn" id="btn-asset-select-all">全选</button>
                            <button type="button" class="asset-batch-btn" id="btn-asset-select-invert">反选</button>
                            <button type="button" class="asset-batch-btn is-primary" id="btn-asset-batch-insert" ${this.selectedFileIds.size === 0 ? 'disabled' : ''}>
                                <i class="material-icons">file_download</i> 导入画板
                            </button>
                            <button type="button" class="asset-batch-btn is-close" id="btn-asset-batch-exit">退出</button>
                        </div>
                    </div>
                ` : ''}

                <!-- 树状文件夹层级目录 -->
                <div class="asset-tree-wrapper">
                    <div class="asset-tree-header" id="asset-tree-toggle-header">
                        <span class="asset-tree-title"><i class="material-icons">account_tree</i> 目录层级</span>
                        <span class="asset-tree-hint">点击文件夹切换分类</span>
                    </div>
                    <div class="asset-tree-content" id="asset-tree-content">
                        ${this.renderTreeHtml(this.rootTree)}
                    </div>
                </div>

                <!-- 分割调整条 -->
                <div class="asset-tree-resizer" id="asset-tree-resizer" title="上下拖动调整目录与图片展示区高度"></div>

                <!-- 素材网格卡片区 -->
                <div class="asset-grid-wrapper">
                    <div class="asset-grid-header">
                        <span class="asset-grid-title" id="asset-grid-current-title">
                            ${this.searchQuery ? `🔍 搜索结果 ("${this.escapeHtml(this.searchQuery)}")` : (this.getActiveNode() ? this.getActiveNode().name : '当前素材')}
                        </span>
                        <div class="asset-grid-header-tools">
                            <select id="asset-sort-select" class="asset-sort-select" title="素材排序方式">
                                <option value="name-asc" ${this.sortMode === 'name-asc' ? 'selected' : ''}>名称 ↑</option>
                                <option value="name-desc" ${this.sortMode === 'name-desc' ? 'selected' : ''}>名称 ↓</option>
                                <option value="type-asc" ${this.sortMode === 'type-asc' ? 'selected' : ''}>类型</option>
                                <option value="shuffle" ${this.sortMode === 'shuffle' ? 'selected' : ''}>随机 🔀</option>
                            </select>
                            <span class="asset-grid-count" id="asset-grid-count">0 张</span>
                        </div>
                    </div>
                    <div class="asset-grid" id="asset-grid">
                        <!-- Populated asynchronously -->
                    </div>
                </div>
            </div>
        `;

        this.bindEvents();
        this.renderGridItems();
    },

    renderTreeHtml(node, depth = 0) {
        const isRoot = node.isRoot;
        const isActive = (this.activeFolderId === node.id);
        const hasSubdirs = node.subdirs && node.subdirs.length > 0;
        const isExpanded = this.folderExpandedMap.get(node.id) !== false; // 默认展开
        const totalFiles = this.countTotalFilesInNode(node);

        let html = `
            <div class="asset-tree-node ${isActive ? 'is-active' : ''}" data-dir-id="${node.id}" style="padding-left: ${depth * 14 + 6}px;">
                <span class="asset-tree-arrow ${hasSubdirs ? (isExpanded ? 'is-open' : 'is-closed') : 'is-leaf'}" data-toggle-id="${node.id}">
                    ${hasSubdirs ? '<i class="material-icons">arrow_right</i>' : ''}
                </span>
                <span class="asset-tree-icon"><i class="material-icons">${isExpanded ? 'folder_open' : 'folder'}</i></span>
                <span class="asset-tree-label" title="${node.name}">${node.name}</span>
                <span class="asset-tree-badge">${totalFiles}</span>
            </div>
        `;

        if (hasSubdirs && isExpanded) {
            node.subdirs.forEach(sub => {
                html += this.renderTreeHtml(sub, depth + 1);
            });
        }
        return html;
    },

    getActiveNode() {
        if (!this.rootTree) return null;
        if (!this.activeFolderId) return this.rootTree;
        return this.findNodeById(this.rootTree, this.activeFolderId) || this.rootTree;
    },

    async renderGridItems() {
        const grid = document.getElementById('asset-grid');
        const countLabel = document.getElementById('asset-grid-count');
        if (!grid) return;

        let files = [];
        if (this.searchQuery.trim()) {
            const q = this.searchQuery.trim().toLowerCase();
            files = this.allFilesList.filter(f => f.name.toLowerCase().includes(q));
        } else {
            const node = this.getActiveNode();
            files = node ? node.files : [];
        }

        // 按照用户选择的排序规则排序
        files = files.slice();
        if (this.sortMode === 'name-desc') {
            files.sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' }));
        } else if (this.sortMode === 'type-asc') {
            files.sort((a, b) => (a.ext || '').localeCompare(b.ext || '') || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        } else if (this.sortMode === 'shuffle') {
            for (let i = files.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [files[i], files[j]] = [files[j], files[i]];
            }
        } else { // 'name-asc' 默认
            files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        }

        if (countLabel) {
            countLabel.textContent = `${files.length} 张`;
        }

        if (files.length === 0) {
            grid.innerHTML = `<div class="asset-grid-empty">${this.searchQuery ? '没有找到匹配的图片素材' : '当前文件夹中没有图片'}</div>`;
            return;
        }

        grid.innerHTML = '';
        const fragment = document.createDocumentFragment();

        for (const fileItem of files) {
            const card = document.createElement('div');
            card.className = `asset-card ${this.selectedFileIds.has(fileItem.id) ? 'is-selected' : ''}`;
            card.dataset.fileId = fileItem.id;
            card.draggable = true;
            card.title = `${fileItem.name}\n• 双击：直接导入当前画板\n• 拖动：拖至分镜格自适应入框`;

            card.innerHTML = `
                <div class="asset-card-thumb-wrap">
                    <img class="asset-card-thumb" alt="${this.escapeHtml(fileItem.name)}" loading="lazy" />
                    <span class="asset-card-ext">${fileItem.ext.toUpperCase()}</span>
                    <input type="checkbox" class="asset-card-checkbox" ${this.selectedFileIds.has(fileItem.id) ? 'checked' : ''} />
                </div>
                <div class="asset-card-name" title="${this.escapeHtml(fileItem.name)}">${this.escapeHtml(fileItem.name)}</div>
            `;

            // 异步提取或拉取 object URL
            this.getFileUrl(fileItem).then(url => {
                const img = card.querySelector('.asset-card-thumb');
                if (img && url) img.src = url;
            });

            // 拖拽开始
            card.addEventListener('dragstart', (e) => {
                this.activeDragItem = fileItem;
                e.dataTransfer.setData('text/plain', fileItem.name);
                e.dataTransfer.effectAllowed = 'copy';
                card.classList.add('is-dragging');
            });

            card.addEventListener('dragend', () => {
                card.classList.remove('is-dragging');
                this.activeDragItem = null;
                this.clearFrameHighlight();
            });

            // 双击快速导入
            card.addEventListener('dblclick', () => {
                this.insertItemToCanvas(fileItem, canvas.width / 2, canvas.height / 2);
            });

            // 点击卡片或勾选框
            const checkbox = card.querySelector('.asset-card-checkbox');
            checkbox.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleSelectFile(fileItem.id);
            });

            card.addEventListener('click', (e) => {
                if (this.batchMode) {
                    this.toggleSelectFile(fileItem.id);
                }
            });

            fragment.appendChild(card);
        }

        grid.appendChild(fragment);
    },

    toggleSelectFile(fileId) {
        if (this.selectedFileIds.has(fileId)) {
            this.selectedFileIds.delete(fileId);
        } else {
            this.selectedFileIds.add(fileId);
        }
        const card = document.querySelector(`.asset-card[data-file-id="${fileId}"]`);
        if (card) {
            const cb = card.querySelector('.asset-card-checkbox');
            const isSelected = this.selectedFileIds.has(fileId);
            card.classList.toggle('is-selected', isSelected);
            if (cb) cb.checked = isSelected;
        }
        const stat = document.querySelector('.asset-batch-stat strong');
        if (stat) stat.textContent = this.selectedFileIds.size;
        const batchBtn = document.getElementById('btn-asset-batch-insert');
        if (batchBtn) batchBtn.disabled = (this.selectedFileIds.size === 0);
    },

    bindEvents() {
        // 排序方式切换
        const sortSelect = document.getElementById('asset-sort-select');
        if (sortSelect) {
            sortSelect.onchange = (e) => {
                this.sortMode = e.target.value;
                try { localStorage.setItem('desu_asset_sort_mode', this.sortMode); } catch(err){}
                this.renderGridItems();
            };
        }

        // 刷新
        const refreshBtn = document.getElementById('btn-asset-refresh');
        if (refreshBtn) refreshBtn.onclick = () => this.refresh();

        // 更换文件夹
        const changeBtn = document.getElementById('btn-asset-change');
        if (changeBtn) changeBtn.onclick = () => this.chooseDirectory();

        // 关闭/断开
        const closeBtn = document.getElementById('btn-asset-close');
        if (closeBtn) closeBtn.onclick = () => {
            if (confirm("确定要断开与当前素材文件夹的连接吗？")) {
                this.closeDirectory();
            }
        };

        // 批量模式切换
        const batchToggleBtn = document.getElementById('btn-asset-batch');
        if (batchToggleBtn) batchToggleBtn.onclick = () => {
            this.batchMode = !this.batchMode;
            if (!this.batchMode) this.selectedFileIds.clear();
            this.render();
        };

        const batchExitBtn = document.getElementById('btn-asset-batch-exit');
        if (batchExitBtn) batchExitBtn.onclick = () => {
            this.batchMode = false;
            this.selectedFileIds.clear();
            this.render();
        };

        const selectAllBtn = document.getElementById('btn-asset-select-all');
        if (selectAllBtn) selectAllBtn.onclick = () => {
            const node = this.getActiveNode();
            const files = this.searchQuery ? this.allFilesList : (node ? node.files : []);
            files.forEach(f => this.selectedFileIds.add(f.id));
            this.renderGridItems();
            const stat = document.querySelector('.asset-batch-stat strong');
            if (stat) stat.textContent = this.selectedFileIds.size;
            const bBtn = document.getElementById('btn-asset-batch-insert');
            if (bBtn) bBtn.disabled = false;
        };

        const selectInvertBtn = document.getElementById('btn-asset-select-invert');
        if (selectInvertBtn) selectInvertBtn.onclick = () => {
            const node = this.getActiveNode();
            const files = this.searchQuery ? this.allFilesList : (node ? node.files : []);
            files.forEach(f => {
                if (this.selectedFileIds.has(f.id)) {
                    this.selectedFileIds.delete(f.id);
                } else {
                    this.selectedFileIds.add(f.id);
                }
            });
            this.renderGridItems();
            const stat = document.querySelector('.asset-batch-stat strong');
            if (stat) stat.textContent = this.selectedFileIds.size;
            const bBtn = document.getElementById('btn-asset-batch-insert');
            if (bBtn) bBtn.disabled = (this.selectedFileIds.size === 0);
        };

        const batchInsertBtn = document.getElementById('btn-asset-batch-insert');
        if (batchInsertBtn) batchInsertBtn.onclick = () => this.batchInsertSelected();

        // 搜索框
        const searchInput = document.getElementById('asset-search-input');
        if (searchInput) {
            searchInput.oninput = (e) => {
                this.searchQuery = e.target.value;
                const clearBtn = document.getElementById('btn-asset-search-clear');
                if (clearBtn) clearBtn.style.display = this.searchQuery ? 'block' : 'none';
                const title = document.getElementById('asset-grid-current-title');
                if (title) {
                    title.textContent = this.searchQuery ? `🔍 搜索结果 ("${this.searchQuery}")` : (this.getActiveNode() ? this.getActiveNode().name : '当前素材');
                }
                this.renderGridItems();
            };
        }

        const searchClearBtn = document.getElementById('btn-asset-search-clear');
        if (searchClearBtn) searchClearBtn.onclick = () => {
            this.searchQuery = '';
            if (searchInput) searchInput.value = '';
            this.render();
        };

        // 树状节点点击与展开
        const treeContent = document.getElementById('asset-tree-content');
        if (treeContent) {
            treeContent.onclick = (e) => {
                const arrow = e.target.closest('.asset-tree-arrow');
                if (arrow && arrow.dataset.toggleId) {
                    const toggleId = arrow.dataset.toggleId;
                    const isOpen = this.folderExpandedMap.get(toggleId) !== false;
                    this.folderExpandedMap.set(toggleId, !isOpen);
                    treeContent.innerHTML = this.renderTreeHtml(this.rootTree);
                    return;
                }

                const nodeEl = e.target.closest('.asset-tree-node');
                if (nodeEl && nodeEl.dataset.dirId) {
                    this.activeFolderId = nodeEl.dataset.dirId;
                    this.searchQuery = '';
                    if (searchInput) searchInput.value = '';
                    treeContent.querySelectorAll('.asset-tree-node').forEach(el => el.classList.remove('is-active'));
                    nodeEl.classList.add('is-active');
                    const title = document.getElementById('asset-grid-current-title');
                    if (title) title.textContent = this.getActiveNode() ? this.getActiveNode().name : '当前素材';
                    this.renderGridItems();
                }
            };
        }

        // 目录树与图片展示区的高度分隔条拖拽
        this.bindTreeResizer();
    },

    bindTreeResizer() {
        const resizer = document.getElementById('asset-tree-resizer');
        const treeWrapper = document.querySelector('.asset-tree-wrapper');
        if (!resizer || !treeWrapper) return;

        let isDragging = false;
        let startY = 0;
        let startH = 0;

        resizer.addEventListener('pointerdown', (e) => {
            isDragging = true;
            startY = e.clientY;
            startH = treeWrapper.getBoundingClientRect().height;
            resizer.setPointerCapture(e.pointerId);
            resizer.classList.add('is-dragging');
            document.body.classList.add('is-layout-dragging');
            e.preventDefault();
        });

        resizer.addEventListener('pointermove', (e) => {
            if (!isDragging) return;
            const deltaY = e.clientY - startY;
            const targetH = Math.max(60, Math.min(window.innerHeight * 0.6, startH + deltaY));
            treeWrapper.style.height = targetH + 'px';
        });

        const stopDrag = (e) => {
            if (!isDragging) return;
            isDragging = false;
            resizer.classList.remove('is-dragging');
            document.body.classList.remove('is-layout-dragging');
            try { resizer.releasePointerCapture(e.pointerId); } catch(err){}
        };

        resizer.addEventListener('pointerup', stopDrag);
        resizer.addEventListener('pointercancel', stopDrag);
    },

    // ==========================================
    // 4. 拖拽上屏与画板放置 (Drag & Drop Engine)
    // ==========================================
    bindCanvasDropEvents() {
        const container = document.getElementById('canvas-container');
        if (!container) return;

        container.addEventListener('dragover', (e) => {
            if (!this.activeDragItem) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';

            // 计算画板内部物理坐标
            const coords = this.getCanvasCoordinates(e);
            if (!coords) return;

            // 高亮目标分镜格
            const targetFrameIndex = (typeof findTargetFrame === 'function') 
                ? findTargetFrame(coords.x, coords.y) 
                : -1;

            if (targetFrameIndex !== -1) {
                const targetFrame = canvas.item(targetFrameIndex);
                if (this.hoveredTargetFrame !== targetFrame) {
                    this.clearFrameHighlight();
                    this.hoveredTargetFrame = targetFrame;
                    this.setFrameHighlight(targetFrame, true);
                }
            } else {
                this.clearFrameHighlight();
            }
        });

        container.addEventListener('dragleave', (e) => {
            // 如果离开画板容器，清除高亮
            if (e.target === container || !container.contains(e.relatedTarget)) {
                this.clearFrameHighlight();
            }
        });

        container.addEventListener('drop', async (e) => {
            if (!this.activeDragItem) return;
            e.preventDefault();
            this.clearFrameHighlight();

            const coords = this.getCanvasCoordinates(e);
            if (coords) {
                await this.insertItemToCanvas(this.activeDragItem, coords.x, coords.y);
            }
            this.activeDragItem = null;
        });
    },

    getCanvasCoordinates(e) {
        if (!window.canvas) return null;
        const canvasElement = canvas.getElement();
        const rect = canvasElement.getBoundingClientRect();
        const scale = (typeof canvasContinerScale !== 'undefined' && canvasContinerScale > 0) ? canvasContinerScale : 1;
        const x = (e.clientX - rect.left) / scale;
        const y = (e.clientY - rect.top) / scale;
        return { x, y };
    },

    setFrameHighlight(frame, isHighlight) {
        if (!frame) return;
        if (isHighlight) {
            frame._originalStroke = frame.stroke;
            frame._originalStrokeWidth = frame.strokeWidth;
            frame.set({
                stroke: '#00e5ff',
                strokeWidth: Math.max(4, (frame.strokeWidth || 2) * 2)
            });
        } else if (frame._originalStroke !== undefined) {
            frame.set({
                stroke: frame._originalStroke,
                strokeWidth: frame._originalStrokeWidth
            });
            delete frame._originalStroke;
            delete frame._originalStrokeWidth;
        }
        canvas.requestRenderAll();
    },

    clearFrameHighlight() {
        if (this.hoveredTargetFrame) {
            this.setFrameHighlight(this.hoveredTargetFrame, false);
            this.hoveredTargetFrame = null;
        }
    },

    /**
     * 将素材图片插入画板：落入画框自动自适应裁剪入框，落入空白处作为自由独立图层
     */
    async insertItemToCanvas(fileItem, canvasX, canvasY) {
        if (!fileItem || !window.canvas) return;

        const url = await this.getFileUrl(fileItem);
        if (!url) return;

        fabric.Image.fromURL(url, (img) => {
            if (!img) return;

            const targetFrameIndex = (typeof findTargetFrame === 'function')
                ? findTargetFrame(canvasX, canvasY)
                : -1;

            if (targetFrameIndex !== -1 && typeof putImageInFrame === 'function') {
                // 1. 放入特定分镜框
                putImageInFrame(img, canvasX, canvasY);
                if (typeof createToast === 'function') {
                    createToast("素材已置入分镜格", `【${fileItem.name}】已自适应填入目标分镜框`);
                }
            } else {
                // 2. 放入空白画板自由图层
                const maxDim = 320;
                const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
                img.set({
                    left: canvasX - (img.width * scale) / 2,
                    top: canvasY - (img.height * scale) / 2,
                    scaleX: scale,
                    scaleY: scale,
                    selectable: true,
                    hasControls: true
                });

                img.name = "素材 - " + fileItem.name;
                canvas.add(img);
                canvas.setActiveObject(img);
                if (typeof saveInitialState === 'function') saveInitialState(img);
                canvas.renderAll();
                if (typeof updateLayerPanel === 'function') updateLayerPanel();
                if (typeof setSave === 'function') setSave(img);
                if (typeof saveStateByManual === 'function') saveStateByManual();

                if (typeof createToast === 'function') {
                    createToast("素材已添加到画板", `【${fileItem.name}】已作为自由图层放置于当前画板`);
                }
            }
        });
    },

    /**
     * 批量导入所选图片到画板
     */
    async batchInsertSelected() {
        if (this.selectedFileIds.size === 0) return;
        const selectedIds = Array.from(this.selectedFileIds);
        const filesToInsert = this.allFilesList.filter(f => selectedIds.includes(f.id));

        const cX = canvas.width / 2;
        const cY = canvas.height / 2;

        let count = 0;
        for (let i = 0; i < filesToInsert.length; i++) {
            const item = filesToInsert[i];
            const offset = (i - (filesToInsert.length - 1) / 2) * 35;
            await this.insertItemToCanvas(item, cX + offset, cY + offset);
            count++;
        }

        this.batchMode = false;
        this.selectedFileIds.clear();
        this.render();

        if (typeof createToast === 'function') {
            createToast("批量导入成功", `已成功将 ${count} 张素材图片导入到画板`);
        }
    },

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
};

window.AssetLibraryManager = AssetLibraryManager;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AssetLibraryManager.init());
} else {
    AssetLibraryManager.init();
}
