/**
 * Batch Manager: Batch export to ZIP and batch deletion for Manga Editor Desu
 */
(function () {
    window.BatchManager = {
        isBatchMode: false,
        selectedGuids: new Set(),

        DEFAULT_SINGLE_PANEL_SVG: '<?xml version="1.0" encoding="UTF-8" standalone="no" ?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="704.2424242424242" height="996" viewBox="0 0 704.2424242424242 996" xml:space="preserve"><desc>Created with Fabric.js 5.3.0</desc><defs></defs><g transform="matrix(1 0 0 1 352.1151515151515 497.9939393939394)"  ><polygon style="stroke: rgb(0,0,0); stroke-width: 2; stroke-dasharray: none; stroke-linecap: butt; stroke-dashoffset: 0; stroke-linejoin: miter; stroke-miterlimit: 4; fill: rgb(255,255,255); fill-opacity: 0.25; fill-rule: nonzero; opacity: 1;" vector-effect="non-scaling-stroke"  points="-351.1151515151515,-496.9939393939394 351.1151515151515,-496.9939393939394 351.1151515151515,496.9939393939394 -351.1151515151515,496.9939393939394 " /></g></svg>',

        // 0. Batch Import Images: 1 Page per Image
        async batchImportImages() {
            if (typeof isProjectBusy === 'function' && isProjectBusy()) {
                if (typeof createToastError === 'function') {
                    createToastError("Import Busy", "项目正在处理中，请稍后再试。");
                }
                return;
            }

            const input = document.createElement("input");
            input.type = "file";
            input.multiple = true;
            input.accept = "image/*";
            input.style.display = "none";
            document.body.appendChild(input);

            input.onchange = async () => {
                const files = input.files;
                if (!files || files.length === 0) {
                    input.remove();
                    return;
                }

                // Natural sort files by filename so 1.png, 2.png, 10.png are in correct numerical order
                const fileList = Array.from(files).sort((a, b) =>
                    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
                );

                const total = fileList.length;
                const loading = (typeof OP_showLoading === 'function') ? OP_showLoading({
                    icon: 'process',
                    step: '批量导入图片',
                    substep: '正在初始化...',
                    progress: 0
                }, true) : null;

                let firstCreatedGuid = null;
                let importedCount = 0;

                try {
                    // Pre-load dynamic panel SVG if not loaded yet
                    if (typeof MangaPanelsImage_Vertical === 'undefined' && typeof loadSvgScript === 'function') {
                        try {
                            await loadSvgScript("js/svg/manga-panels-image-vertical.js?v=7.2");
                        } catch(e) {}
                    }

                    const svgString = (typeof MangaPanelsImage_Vertical !== 'undefined' && MangaPanelsImage_Vertical[0])
                        ? MangaPanelsImage_Vertical[0].svg
                        : this.DEFAULT_SINGLE_PANEL_SVG;

                    for (let i = 0; i < total; i++) {
                        if (typeof OP_isCancelled === 'function' && OP_isCancelled()) {
                            break;
                        }

                        const file = fileList[i];
                        const pageNum = i + 1;

                        if (loading && typeof OP_updateLoadingState === 'function') {
                            OP_updateLoadingState(loading, {
                                icon: 'process',
                                step: '批量导入图片',
                                substep: `正在导入第 ${pageNum} / ${total} 张: ${file.name}`,
                                progress: Math.round((i / total) * 90)
                            });
                        }
                        if (typeof waitNextFrame === 'function') await waitNextFrame();

                        // Save existing page if it has content
                        if (typeof btmShouldSaveCurrentPage === 'function' && btmShouldSaveCurrentPage()) {
                            if (typeof btmSaveCurrentPage === 'function') {
                                await btmSaveCurrentPage(false);
                            }
                        }

                        // Generate new page GUID
                        if (typeof setCanvasGUID === 'function') {
                            setCanvasGUID();
                        }
                        const newGuid = (typeof getCanvasGUID === 'function') ? getCanvasGUID() : null;
                        if (!firstCreatedGuid) firstCreatedGuid = newGuid;

                        // Load default 1x1 single panel template into canvas
                        await new Promise((resolve) => {
                            if (typeof loadSVGPlusReset === 'function') {
                                loadSVGPlusReset(svgString, false, false);
                                const timer = setInterval(() => {
                                    if (canvas && canvas.getObjects().some(o => o.isPanel)) {
                                        clearInterval(timer);
                                        resolve();
                                    }
                                }, 30);
                                setTimeout(() => {
                                    clearInterval(timer);
                                    resolve();
                                }, 1500);
                            } else if (typeof loadBookSize === 'function') {
                                loadBookSize(210, 297, true, true).then(resolve);
                            } else {
                                resolve();
                            }
                        });
                        if (typeof waitNextFrame === 'function') await waitNextFrame();

                        // Read image file
                        const dataUrl = await new Promise((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = e => resolve(e.target.result);
                            reader.onerror = reject;
                            reader.readAsDataURL(file);
                        });

                        // Put image into panel frame
                        await new Promise((resolve) => {
                            fabric.Image.fromURL(dataUrl, function(img) {
                                if (typeof putImageInFrame === 'function') {
                                    const cx = canvas.width / 2;
                                    const cy = canvas.height / 2;
                                    putImageInFrame(img, cx, cy);
                                } else if (typeof addInitialImageToCanvas === 'function') {
                                    addInitialImageToCanvas(img);
                                } else {
                                    canvas.add(img);
                                }
                                canvas.renderAll();
                                if (typeof updateLayerPanel === 'function') updateLayerPanel();
                                if (typeof saveStateByManual === 'function') saveStateByManual();
                                resolve();
                            });
                        });
                        if (typeof waitNextFrame === 'function') await waitNextFrame();

                        // Register and save page to bottom bar
                        if (typeof btmRegisterCurrentPage === 'function') {
                            await btmRegisterCurrentPage(false);
                        }
                        if (typeof btmSaveCurrentPage === 'function') {
                            await btmSaveCurrentPage(false);
                        }

                        importedCount++;
                    }

                    // Done: navigate to first imported page
                    if (firstCreatedGuid && typeof chengeCanvasByGuid === 'function') {
                        await chengeCanvasByGuid(firstCreatedGuid);
                    }

                    if (typeof btmUpdateScrollButtons === 'function') btmUpdateScrollButtons();
                    if (typeof updateAllPageNumbers === 'function') updateAllPageNumbers();
                    if (typeof btmUpdateHandleText === 'function') btmUpdateHandleText();

                    if (typeof createToast === 'function') {
                        createToast("Success", `成功导入 ${importedCount} 张图片到独立画板！`);
                    }
                } catch(err) {
                    console.error("Batch import failed:", err);
                    if (typeof createToastError === 'function') {
                        createToastError("Import Error", "批量导入失败: " + (err.message || err));
                    }
                } finally {
                    input.remove();
                    if (loading && typeof OP_hideLoading === 'function') {
                        OP_hideLoading(loading);
                    }
                }
            };

            input.click();
        },

        // 1. Batch Export All Pages to ZIP
        async batchCropAndDownload() {
            if (typeof isProjectBusy === 'function' && isProjectBusy()) {
                if (typeof createToastError === 'function') {
                    createToastError("Export Busy", "项目正在处理中，请稍后再试。");
                }
                return;
            }

            // Save current canvas state before iterating
            if (typeof flushHistory === 'function') flushHistory();
            if (typeof btmSaveCurrentPage === 'function') await btmSaveCurrentPage(false);

            const guidList = (typeof btmGetGuids === 'function') ? btmGetGuids() : [];
            if (!guidList || guidList.length === 0) {
                if (typeof ImageUtil !== 'undefined' && typeof ImageUtil.cropAndDownload === 'function') {
                    ImageUtil.cropAndDownload();
                    return;
                }
                if (typeof createToastError === 'function') {
                    createToastError("Export Error", "没有检测到任何页面！");
                }
                return;
            }

            const startGuid = (typeof getCanvasGUID === 'function') ? getCanvasGUID() : null;
            const loading = (typeof OP_showLoading === 'function') ? OP_showLoading({
                icon: 'process',
                step: '批量导出所有页面',
                substep: '正在初始化...',
                progress: 0
            }, true) : null;

            try {
                if (typeof waitNextFrame === 'function') await waitNextFrame();

                const zip = new JSZip();
                const totalPages = guidList.length;
                const outputSize = (typeof ImageUtil !== 'undefined' && typeof ImageUtil.getOutputPixelSize === 'function')
                    ? ImageUtil.getOutputPixelSize()
                    : { multiplier: 1 };
                const multiplier = outputSize.multiplier || 1;

                for (let i = 0; i < totalPages; i++) {
                    if (typeof OP_isCancelled === 'function' && OP_isCancelled()) {
                        if (typeof createToast === 'function') {
                            createToast("Cancelled", "批量导出已取消");
                        }
                        break;
                    }

                    const guid = guidList[i];
                    const pageNum = i + 1;
                    const padNum = String(pageNum).padStart(3, '0');

                    if (loading && typeof OP_updateLoadingState === 'function') {
                        OP_updateLoadingState(loading, {
                            icon: 'process',
                            step: '批量导出所有页面',
                            substep: `正在渲染第 ${pageNum} / ${totalPages} 页...`,
                            progress: Math.round((i / totalPages) * 90)
                        });
                    }
                    if (typeof waitNextFrame === 'function') await waitNextFrame();

                    // Switch canvas to current page if not already loaded
                    if (typeof getCanvasGUID === 'function' && getCanvasGUID() !== guid) {
                        if (typeof chengeCanvasByGuid === 'function') {
                            await chengeCanvasByGuid(guid);
                        }
                    }
                    if (typeof btmWaitForPageReady === 'function') {
                        await btmWaitForPageReady();
                    }

                    // Temporarily hide grid line
                    const wasGrid = (typeof isGridVisible !== 'undefined') ? isGridVisible : false;
                    if (typeof removeGrid === 'function') removeGrid();

                    // Capture page canvas
                    const dataUrl = canvas.toDataURL({ format: 'png', multiplier: multiplier });
                    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
                    zip.file(`page_${padNum}.png`, base64Data, { base64: true });

                    // Restore grid line if needed
                    if (wasGrid && typeof drawGrid === 'function') {
                        drawGrid();
                        isGridVisible = true;
                    }
                }

                // If user pressed cancel during loop, abort download
                if (typeof OP_isCancelled === 'function' && OP_isCancelled()) {
                    return;
                }

                if (loading && typeof OP_updateLoadingState === 'function') {
                    OP_updateLoadingState(loading, {
                        icon: 'process',
                        step: '批量导出所有页面',
                        substep: '正在压缩打包 ZIP 文件...',
                        progress: 95
                    });
                }
                if (typeof waitNextFrame === 'function') await waitNextFrame();

                const zipBlob = await zip.generateAsync({ type: 'blob' });
                const dateStr = (typeof ImageUtil !== 'undefined' && typeof ImageUtil.getFormattedDateTime === 'function')
                    ? ImageUtil.getFormattedDateTime()
                    : new Date().toISOString().replace(/[:.]/g, '-');
                const filename = `DESU-Pages_${dateStr}_${totalPages}p.zip`;

                const url = window.URL.createObjectURL(zipBlob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);

                if (typeof createToast === 'function') {
                    createToast("Success", `成功导出全部 ${totalPages} 个页面为 ZIP！`);
                }
            } catch (err) {
                console.error("Batch export failed:", err);
                if (typeof createToastError === 'function') {
                    createToastError("Export Error", "批量导出失败: " + (err.message || err));
                }
            } finally {
                // Restore to user's initial active page
                try {
                    if (startGuid && typeof getCanvasGUID === 'function' && getCanvasGUID() !== startGuid) {
                        if (typeof btmProjectsMap !== 'undefined' && btmProjectsMap.has(startGuid)) {
                            if (typeof chengeCanvasByGuid === 'function') {
                                await chengeCanvasByGuid(startGuid);
                            }
                            if (typeof btmWaitForPageReady === 'function') {
                                await btmWaitForPageReady();
                            }
                        }
                    }
                } catch (restoreErr) {
                    console.error("Failed to restore initial page:", restoreErr);
                }

                if (loading && typeof OP_hideLoading === 'function') {
                    OP_hideLoading(loading);
                }
            }
        },

        // 2. Batch Delete UI & Operations
        toggleBatchMode(enable) {
            const drawer = document.getElementById("btm-drawer");
            const btnEnter = document.getElementById("btm-btn-enter-batch");
            const actionBar = document.getElementById("btm-batch-action-bar");
            if (!drawer) return;

            this.isBatchMode = (typeof enable === 'boolean') ? enable : !this.isBatchMode;

            if (this.isBatchMode) {
                drawer.classList.add("is-batch-mode");
                if (btnEnter) btnEnter.style.display = "none";
                if (actionBar) actionBar.style.display = "inline-flex";
                this.selectedGuids.clear();
                this.syncCheckboxes();
                this.updateCountBadge();
            } else {
                drawer.classList.remove("is-batch-mode");
                if (btnEnter) btnEnter.style.display = "inline-flex";
                if (actionBar) actionBar.style.display = "none";
                this.selectedGuids.clear();
                this.syncCheckboxes();
            }
        },

        syncCheckboxes() {
            const container = document.getElementById("btm-image-container");
            if (!container) return;
            const wrappers = container.querySelectorAll(".btm-image-wrapper");
            wrappers.forEach(wrapper => {
                const img = wrapper.querySelector(".btm-image");
                const guid = img ? img.dataset.index : null;
                if (!guid) return;

                let checkboxWrap = wrapper.querySelector(".btm-batch-checkbox-wrap");
                if (!checkboxWrap) {
                    checkboxWrap = document.createElement("div");
                    checkboxWrap.className = "btm-batch-checkbox-wrap";
                    checkboxWrap.innerHTML = '<span class="btm-batch-checkbox-icon">✓</span>';
                    wrapper.appendChild(checkboxWrap);
                }

                if (this.selectedGuids.has(guid)) {
                    wrapper.classList.add("is-batch-selected");
                } else {
                    wrapper.classList.remove("is-batch-selected");
                }
            });
        },

        togglePageSelection(guid, force) {
            if (!guid) return;
            if (typeof force === 'boolean') {
                if (force) this.selectedGuids.add(guid);
                else this.selectedGuids.delete(guid);
            } else {
                if (this.selectedGuids.has(guid)) {
                    this.selectedGuids.delete(guid);
                } else {
                    this.selectedGuids.add(guid);
                }
            }
            this.syncCheckboxes();
            this.updateCountBadge();
        },

        selectAll() {
            const guids = (typeof btmGetGuids === 'function') ? btmGetGuids() : [];
            guids.forEach(g => this.selectedGuids.add(g));
            this.syncCheckboxes();
            this.updateCountBadge();
        },

        invertSelection() {
            const guids = (typeof btmGetGuids === 'function') ? btmGetGuids() : [];
            guids.forEach(g => {
                if (this.selectedGuids.has(g)) {
                    this.selectedGuids.delete(g);
                } else {
                    this.selectedGuids.add(g);
                }
            });
            this.syncCheckboxes();
            this.updateCountBadge();
        },

        updateCountBadge() {
            const badge = document.getElementById("btm-batch-selected-count");
            const guids = (typeof btmGetGuids === 'function') ? btmGetGuids() : [];
            if (badge) {
                badge.textContent = `已选 ${this.selectedGuids.size} / ${guids.length} 项`;
            }
        },

        async deleteSelected() {
            if (this.selectedGuids.size === 0) {
                if (typeof createToast === 'function') {
                    createToast("提示", "请先点击勾选需要删除的页面！");
                }
                return;
            }

            if (typeof isProjectBusy === 'function' && isProjectBusy()) {
                if (typeof createToastError === 'function') {
                    createToastError("Busy", "项目正在处理中，请稍后再试。");
                }
                return;
            }

            const deleteCount = this.selectedGuids.size;
            let confirmed = false;
            if (typeof showConfirmDialog === 'function') {
                confirmed = await showConfirmDialog({
                    title: "批量删除确认",
                    message: `确定要永久删除选中的 ${deleteCount} 个页面吗？此操作无法撤销。`,
                    danger: true
                });
            } else {
                confirmed = window.confirm(`确定要永久删除选中的 ${deleteCount} 个页面吗？此操作无法撤销。`);
            }

            if (!confirmed) return;
            if (typeof isProjectBusy === 'function' && isProjectBusy()) return;

            const currentGuid = (typeof getCanvasGUID === 'function') ? getCanvasGUID() : null;
            const isCurrentPageDeleted = currentGuid ? this.selectedGuids.has(currentGuid) : false;

            // Remove selected pages from data structures and DOM
            this.selectedGuids.forEach(guid => {
                if (typeof btmProjectsMap !== 'undefined' && btmProjectsMap.has(guid)) {
                    btmProjectsMap.delete(guid);
                }
                const img = document.querySelector(`.btm-image[data-index="${guid}"]`);
                if (img && img.closest(".btm-image-wrapper")) {
                    img.closest(".btm-image-wrapper").remove();
                }
            });

            // Handle active canvas state after deletion
            const remainingSize = (typeof btmGetGuidsSize === 'function') ? btmGetGuidsSize() : 0;
            if (remainingSize === 0) {
                // If all pages were deleted, initialize a clean empty page
                if (typeof initImageHistory === 'function') initImageHistory();
                if (typeof setCanvasGUID === 'function') setCanvasGUID();
                if (typeof showEmptyPageMessage === 'function') showEmptyPageMessage();
                if (typeof btmRegisterCurrentPage === 'function') await btmRegisterCurrentPage(true);
            } else if (isCurrentPageDeleted) {
                // If the active page was deleted, switch to the first available remaining page
                const targetGuid = (typeof btmGetFirstGuidByIndex === 'function') ? btmGetFirstGuidByIndex() : null;
                if (targetGuid && typeof chengeCanvasByGuid === 'function') {
                    await chengeCanvasByGuid(targetGuid);
                }
            }

            // Refresh UI controls
            if (typeof btmUpdateScrollButtons === 'function') btmUpdateScrollButtons();
            if (typeof updateAllPageNumbers === 'function') updateAllPageNumbers();
            if (typeof btmUpdateHandleText === 'function') btmUpdateHandleText();

            if (typeof createToast === 'function') {
                createToast("Success", `已成功删除 ${deleteCount} 个页面！`);
            }

            // Exit batch mode
            this.toggleBatchMode(false);
        },

        init() {
            const container = document.getElementById("btm-image-container");
            if (container) {
                // Intercept clicks in capture phase when in batch mode
                container.addEventListener("click", (e) => {
                    if (!this.isBatchMode) return;
                    const wrapper = e.target.closest(".btm-image-wrapper");
                    if (!wrapper) return;

                    // Prevent triggering normal thumbnail click (page switch) or sub-buttons
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    e.preventDefault();

                    const img = wrapper.querySelector(".btm-image");
                    if (img && img.dataset.index) {
                        this.togglePageSelection(img.dataset.index);
                    }
                }, true);

                // Auto-sync checkboxes and counts when thumbnails change
                const observer = new MutationObserver(() => {
                    if (this.isBatchMode) {
                        this.syncCheckboxes();
                        this.updateCountBadge();
                    }
                });
                observer.observe(container, { childList: true });
            }
        }
    };

    // Global alias for onclick handler
    window.batchCropAndDownload = function () {
        return window.BatchManager.batchCropAndDownload();
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => window.BatchManager.init());
    } else {
        window.BatchManager.init();
    }
})();
