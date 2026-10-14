/**
 * custom-template-manager.js
 * 自定义分镜模板管理器：提取当前画板纯净分镜、带尺寸与比例保存、左侧模板面板分组渲染与100%无变形还原
 */

const CustomTemplateManager = {
    STORAGE_KEY: 'desu_custom_panel_templates',

    init() {
        this.injectUI();
        this.renderCustomTemplates();
    },

    /**
     * 获取所有保存的自定义模板
     */
    getTemplates() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.error("Failed to parse custom templates", e);
            return [];
        }
    },

    /**
     * 保存模板列表
     */
    saveTemplates(list) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list));
        this.renderCustomTemplates();
    },

    /**
     * 在页面管理栏注入“保存为模板”按钮，在左侧分镜面板注入“自定义模板”容器
     */
    injectUI() {
        // 1. 在 Page Manager (panel-manager-area) 的“添加页面”按钮组下方注入保存按钮
        const customBtn = document.getElementById("CustomPanelButton");
        if (customBtn && !document.getElementById("btn-save-as-template")) {
            const saveBtn = document.createElement("button");
            saveBtn.id = "btn-save-as-template";
            saveBtn.type = "button";
            saveBtn.className = "btn-save-template-trigger";
            saveBtn.innerHTML = `<i class="material-icons">bookmark_add</i><span>保存当前分镜为模板</span>`;
            saveBtn.onclick = () => this.openSaveModal();

            const paramGroup = customBtn.closest(".param-group");
            if (paramGroup) {
                paramGroup.appendChild(saveBtn);
            }
        }

        // 2. 在左侧模板面板（svg-container-template）顶部插入自定义模板专属分区
        const templatePanel = document.getElementById("svg-container-template");
        if (templatePanel && !document.getElementById("custom-template-section")) {
            const section = document.createElement("div");
            section.id = "custom-template-section";
            section.className = "custom-template-section";
            section.innerHTML = `
                <div class="custom-template-header">
                    <span class="custom-template-title"><i class="material-icons">star</i> 我的自定义模板</span>
                    <span class="custom-template-count" id="custom-template-count">0</span>
                </div>
                <div id="custom-template-grid" class="custom-template-grid"></div>
                <div class="custom-template-divider"></div>
            `;
            const header = templatePanel.querySelector(".template-header");
            if (header && header.nextSibling) {
                templatePanel.insertBefore(section, header.nextSibling);
            } else {
                templatePanel.prepend(section);
            }
        }
    },

    /**
     * 从当前 Fabric 画布中提取纯净的漫画分镜多边形，归一化坐标并构建 SVG
     */
    extractCleanPanelData() {
        if (!window.canvas) return null;
        const objects = canvas.getObjects();
        const panels = objects.filter(obj => obj && obj.isPanel && !obj.isImage);
        if (!panels || panels.length === 0) {
            return null;
        }

        const width = canvas.width;
        const height = canvas.height;

        let panelsData = [];
        let svgElements = [];

        panels.forEach(p => {
            let absPoints = [];
            if (p.type === 'polygon' && p.points) {
                const matrix = p.calcTransformMatrix();
                absPoints = p.points.map(pt => fabric.util.transformPoint(pt, matrix));
            } else if (p.type === 'rect') {
                const matrix = p.calcTransformMatrix();
                absPoints = [
                    fabric.util.transformPoint({x: -p.width/2, y: -p.height/2}, matrix),
                    fabric.util.transformPoint({x: p.width/2, y: -p.height/2}, matrix),
                    fabric.util.transformPoint({x: p.width/2, y: p.height/2}, matrix),
                    fabric.util.transformPoint({x: -p.width/2, y: p.height/2}, matrix)
                ];
            }

            if (absPoints.length >= 3) {
                // 1. 记录归一化比例坐标 (0.0 ~ 1.0)，在任何分辨率画布下都能 1:1 绝对贴合
                const normPoints = absPoints.map(pt => ({
                    nx: pt.x / width,
                    ny: pt.y / height
                }));

                const stroke = p.stroke || 'black';
                const strokeWidth = p.strokeWidth || 2;
                const fill = p.fill || 'rgb(255,255,255)';
                const opacity = (p.opacity !== undefined) ? p.opacity : 1;

                panelsData.push({
                    normPoints,
                    stroke,
                    strokeWidth,
                    fill,
                    opacity
                });

                // 2. 同时生成供缩略图展示的 SVG
                const ptsStr = absPoints.map(pt => `${pt.x.toFixed(2)},${pt.y.toFixed(2)}`).join(' ');
                svgElements.push(`<polygon points="${ptsStr}" style="stroke: ${stroke}; stroke-width: ${strokeWidth}; fill: rgb(255,255,255); fill-opacity: 0.25; stroke-linejoin: miter; stroke-miterlimit: 4;" />`);
            }
        });

        const svgContent = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <g>${svgElements.join('\n')}</g>
</svg>`;

        return {
            svg: svgContent,
            panelsData: panelsData,
            panelCount: panels.length,
            canvasWidth: width,
            canvasHeight: height
        };
    },

    /**
     * 打开保存自定义模板的弹窗
     */
    openSaveModal() {
        const panelData = this.extractCleanPanelData();
        if (!panelData) {
            if (typeof createToastError === 'function') {
                createToastError("无法保存模板", "当前画布中没有检测到任何分镜框！请先绘制或切割分镜。");
            } else {
                alert("当前画布中没有分镜框！");
            }
            return;
        }

        const curSize = (typeof getPageSizeMm === 'function') ? getPageSizeMm() : { width: 210, height: 297 };
        const mmW = curSize.width;
        const mmH = curSize.height;
        const ratioLabel = mmW === mmH ? "1:1 正方形" : (mmW > mmH ? "横向版式" : "纵向版式");

        const oldModal = document.getElementById("save-template-modal-overlay");
        if (oldModal) oldModal.remove();

        const overlay = document.createElement("div");
        overlay.id = "save-template-modal-overlay";
        overlay.className = "btm-dialog-overlay custom-tpl-modal-overlay";

        const previewDataUrl = "data:image/svg+xml;utf8," + encodeURIComponent(panelData.svg);

        overlay.innerHTML = `
            <div class="btm-dialog custom-tpl-modal">
                <div class="custom-tpl-modal-title">
                    <i class="material-icons">bookmark_add</i>
                    <span>保存为分镜模板</span>
                </div>
                <div class="custom-tpl-modal-body">
                    <div class="custom-tpl-preview-box">
                        <img src="${previewDataUrl}" class="custom-tpl-preview-img" alt="Template Preview" />
                    </div>
                    <div class="custom-tpl-form">
                        <div class="custom-tpl-field">
                            <label>模板名称：</label>
                            <input type="text" id="custom-tpl-name-input" class="custom-tpl-input" placeholder="输入模板名称，如：日常三格" value="自定义模板_${new Date().toLocaleDateString()}" />
                        </div>
                        <div class="custom-tpl-info-card">
                            <div><strong>分镜格数：</strong>${panelData.panelCount} 个画框</div>
                            <div><strong>原稿尺寸：</strong>${mmW} × ${mmH} mm (${ratioLabel})</div>
                            <div class="custom-tpl-tip">💡 加载该模板时，画板会自动应用此尺寸基准，确保分镜绝不变形。</div>
                        </div>
                    </div>
                </div>
                <div class="custom-tpl-modal-actions">
                    <button type="button" class="custom-tpl-btn-cancel" id="btn-cancel-save-tpl">取消</button>
                    <button type="button" class="custom-tpl-btn-confirm" id="btn-confirm-save-tpl">保存模板</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const nameInput = document.getElementById("custom-tpl-name-input");
        if (nameInput) {
            nameInput.focus();
            nameInput.select();
        }

        document.getElementById("btn-cancel-save-tpl").onclick = () => overlay.remove();
        overlay.onclick = (e) => {
            if (e.target === overlay) overlay.remove();
        };

        document.getElementById("btn-confirm-save-tpl").onclick = () => {
            const name = (nameInput.value || "").trim() || "未命名模板";
            const newTpl = {
                id: "ctpl_" + Date.now(),
                name: name,
                createdAt: Date.now(),
                pageSizeMm: { width: mmW, height: mmH },
                svg: panelData.svg,
                panelsData: panelData.panelsData,
                panelCount: panelData.panelCount
            };

            const list = this.getTemplates();
            list.unshift(newTpl);
            this.saveTemplates(list);

            overlay.remove();
            if (typeof createToast === 'function') {
                createToast("保存成功", `已成功保存分镜模板【${name}】`);
            }
        };
    },

    /**
     * 渲染左侧面板顶部的自定义模板卡片列表
     */
    renderCustomTemplates() {
        const grid = document.getElementById("custom-template-grid");
        const countBadge = document.getElementById("custom-template-count");
        if (!grid) return;

        const list = this.getTemplates();
        if (countBadge) {
            countBadge.textContent = list.length;
        }

        if (list.length === 0) {
            grid.innerHTML = `<div class="custom-tpl-empty">暂无保存的模板<br><small>在右侧页面管理中点击“保存当前分镜为模板”</small></div>`;
            return;
        }

        grid.innerHTML = "";
        list.forEach(item => {
            const card = document.createElement("div");
            card.className = "custom-tpl-card";
            card.title = `${item.name} (${item.pageSizeMm.width}×${item.pageSizeMm.height}mm)\n点击应用该模板`;

            const previewSrc = "data:image/svg+xml;utf8," + encodeURIComponent(item.svg);
            const isLandscape = item.pageSizeMm.width > item.pageSizeMm.height;
            const isSquare = item.pageSizeMm.width === item.pageSizeMm.height;
            const tagLabel = isSquare ? "1:1" : (isLandscape ? "横" : "纵");

            card.innerHTML = `
                <div class="custom-tpl-card-img-wrap">
                    <img src="${previewSrc}" class="custom-tpl-card-img" alt="${item.name}" draggable="false" />
                    <span class="custom-tpl-badge">${tagLabel}</span>
                    <button class="custom-tpl-del-btn" title="删除模板">×</button>
                </div>
                <div class="custom-tpl-card-name">${item.name}</div>
            `;

            const delBtn = card.querySelector(".custom-tpl-del-btn");
            delBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirm(`确定要删除自定义模板【${item.name}】吗？`)) {
                    const nextList = this.getTemplates().filter(t => t.id !== item.id);
                    this.saveTemplates(nextList);
                }
            };

            card.onclick = () => {
                this.applyCustomTemplate(item);
            };

            grid.appendChild(card);
        });
    },

    /**
     * 应用自定义模板：直接通过 Fabric 原生多边形精准还原，彻底避开 SVG 偏移缺陷
     */
    async applyCustomTemplate(item) {
        if (!item) return;

        const loading = (typeof OP_showLoading === 'function') 
            ? OP_showLoading({ icon: 'process', step: 'Step1', substep: 'Apply Template', progress: 0 }) 
            : null;

        try {
            const wMm = item.pageSizeMm.width;
            const hMm = item.pageSizeMm.height;

            // 1. 同步原稿尺寸输入框
            if (typeof setPageSizeMm === 'function') {
                setPageSizeMm(wMm, hMm);
            }

            // 2. 离屏保存当前页并创建新页 GUID
            if (typeof btmShouldSaveCurrentPage === 'function' && btmShouldSaveCurrentPage()) {
                await btmSaveProjectFile();
            }
            if (typeof setCanvasGUID === 'function') {
                setCanvasGUID();
            }

            // 3. 按照原稿尺寸重塑画板物理长宽比
            if (typeof resizeCanvasToObject === 'function') {
                resizeCanvasToObject(wMm, hMm);
            }

            // 4. 清理旧图层与历史状态
            if (typeof initImageHistory === 'function') {
                initImageHistory();
            }
            if (typeof changeDoNotSaveHistory === 'function') {
                changeDoNotSaveHistory();
            }

            // 清空画板上现有的所有分镜多边形
            const oldObjects = canvas.getObjects().slice();
            oldObjects.forEach(obj => {
                if (obj && obj.isPanel) {
                    canvas.remove(obj);
                }
            });

            const canvasW = canvas.width;
            const canvasH = canvas.height;

            // 5. 原生精准重建每个分镜画框
            if (item.panelsData && Array.isArray(item.panelsData) && item.panelsData.length > 0) {
                item.panelsData.forEach(pData => {
                    // 根据当前画布宽高把归一化点还原为当前画布绝对点
                    const curPoints = pData.normPoints.map(pt => ({
                        x: pt.nx * canvasW,
                        y: pt.ny * canvasH
                    }));

                    // 计算该多边形的几何包围盒作为原点基准
                    const minX = Math.min(...curPoints.map(pt => pt.x));
                    const maxX = Math.max(...curPoints.map(pt => pt.x));
                    const minY = Math.min(...curPoints.map(pt => pt.y));
                    const maxY = Math.max(...curPoints.map(pt => pt.y));

                    // 构建相对于左上角 (0, 0) 的多边形内部相对点数组
                    const localPoints = curPoints.map(pt => ({
                        x: pt.x - minX,
                        y: pt.y - minY
                    }));

                    const polygon = new fabric.Polygon(localPoints, {
                        left: minX,
                        top: minY,
                        scaleX: 1,
                        scaleY: 1,
                        fill: pData.fill || 'rgb(255,255,255)',
                        opacity: (pData.opacity !== undefined) ? pData.opacity : 1,
                        stroke: pData.stroke || 'black',
                        strokeWidth: pData.strokeWidth || 2,
                        strokeUniform: true,
                        isPanel: true,
                        selectable: false,
                        hasControls: true,
                        objectCaching: false
                    });

                    if (typeof setText2ImageInitPrompt === 'function') {
                        setText2ImageInitPrompt(polygon);
                    }
                    if (typeof setPanelValue === 'function') {
                        setPanelValue(polygon);
                    }

                    canvas.add(polygon);
                });
            } else if (item.svg && typeof loadSVGPlusReset === 'function') {
                // 兼容旧版只存了 SVG 的模板降级方案
                const isLand = wMm > hMm;
                await loadSVGPlusReset(item.svg, isLand, false);
            }

            // 6. 状态持久化与界面刷新
            if (typeof changeDoSaveHistory === 'function') {
                changeDoSaveHistory();
            }
            if (typeof saveState === 'function') {
                saveState();
            }
            if (typeof updateLayerPanel === 'function') {
                updateLayerPanel();
            }

            canvas.requestRenderAll();

            // 7. 注册到总览底栏并更新页码
            if (typeof btmRegisterCurrentPage === 'function') {
                await btmRegisterCurrentPage(true);
                if (typeof updateAllPageNumbers === 'function') updateAllPageNumbers();
                if (typeof btmUpdateHandleText === 'function') btmUpdateHandleText();
            }

            if (typeof createToast === 'function') {
                createToast("应用模板", `已完美加载模板【${item.name}】 (${wMm}×${hMm}mm)`);
            }
        } catch (err) {
            console.error("Failed to apply custom template", err);
            if (typeof createToastError === 'function') {
                createToastError("应用失败", err.message);
            }
        } finally {
            if (loading && typeof OP_hideLoading === 'function') {
                OP_hideLoading(loading);
            }
        }
    }
};

window.CustomTemplateManager = CustomTemplateManager;

// DOM 加载就绪后自动启动
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => CustomTemplateManager.init());
} else {
    CustomTemplateManager.init();
}
