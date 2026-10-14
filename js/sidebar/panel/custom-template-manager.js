/**
 * custom-template-manager.js
 * 自定义分镜模板管理器：提取当前画板纯净分镜、带尺寸与比例保存、左侧模板面板分组渲染与即点即用
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

            // 插入在自定义页面输入组下方
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
            // 插入在竖版/横版切换栏与原有列表之间
            const header = templatePanel.querySelector(".template-header");
            if (header && header.nextSibling) {
                templatePanel.insertBefore(section, header.nextSibling);
            } else {
                templatePanel.prepend(section);
            }
        }
    },

    /**
     * 从当前 Fabric 画布中提取纯净的漫画分镜多边形，构建无杂质 SVG
     */
    extractCleanPanelSVG() {
        if (!window.canvas) return null;
        const objects = canvas.getObjects();
        // 筛选出分镜框
        const panels = objects.filter(obj => obj && obj.isPanel && !obj.isImage);
        if (!panels || panels.length === 0) {
            return null;
        }

        const width = canvas.width;
        const height = canvas.height;

        // 生成纯净的 SVG 结构
        let svgElements = [];
        panels.forEach(p => {
            if (p.type === 'polygon' && p.points) {
                // 计算全局坐标顶点
                const matrix = p.calcTransformMatrix();
                const globalPoints = p.points.map(pt => fabric.util.transformPoint(pt, matrix));
                const ptsStr = globalPoints.map(pt => `${pt.x.toFixed(2)},${pt.y.toFixed(2)}`).join(' ');
                const stroke = p.stroke || 'black';
                const strokeWidth = p.strokeWidth || 2;
                svgElements.push(`<polygon points="${ptsStr}" style="stroke: ${stroke}; stroke-width: ${strokeWidth}; fill: rgb(255,255,255); fill-opacity: 0.25; stroke-linejoin: miter; stroke-miterlimit: 4;" />`);
            } else if (p.type === 'rect') {
                const matrix = p.calcTransformMatrix();
                const p1 = fabric.util.transformPoint({x: -p.width/2, y: -p.height/2}, matrix);
                const p2 = fabric.util.transformPoint({x: p.width/2, y: -p.height/2}, matrix);
                const p3 = fabric.util.transformPoint({x: p.width/2, y: p.height/2}, matrix);
                const p4 = fabric.util.transformPoint({x: -p.width/2, y: p.height/2}, matrix);
                const ptsStr = `${p1.x.toFixed(2)},${p1.y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)} ${p3.x.toFixed(2)},${p3.y.toFixed(2)} ${p4.x.toFixed(2)},${p4.y.toFixed(2)}`;
                svgElements.push(`<polygon points="${ptsStr}" style="stroke: black; stroke-width: 2; fill: rgb(255,255,255); fill-opacity: 0.25;" />`);
            }
        });

        const svgContent = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <g>${svgElements.join('\n')}</g>
</svg>`;

        return {
            svg: svgContent,
            panelCount: panels.length,
            width,
            height
        };
    },

    /**
     * 打开保存自定义模板的弹窗
     */
    openSaveModal() {
        const panelData = this.extractCleanPanelSVG();
        if (!panelData) {
            if (typeof createToastError === 'function') {
                createToastError("无法保存模板", "当前画布中没有检测到任何分镜框！请先绘制或切割分镜。");
            } else {
                alert("当前画布中没有分镜框！");
            }
            return;
        }

        // 读取当前物理 mm
        const curSize = (typeof getPageSizeMm === 'function') ? getPageSizeMm() : { width: 210, height: 297 };
        const mmW = curSize.width;
        const mmH = curSize.height;
        const ratioLabel = mmW === mmH ? "1:1 正方形" : (mmW > mmH ? "横向版式" : "纵向版式");

        // 移除已有弹窗
        const oldModal = document.getElementById("save-template-modal-overlay");
        if (oldModal) oldModal.remove();

        const overlay = document.createElement("div");
        overlay.id = "save-template-modal-overlay";
        overlay.className = "btm-dialog-overlay custom-tpl-modal-overlay";

        // 生成预览图
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

            // 点击删除
            const delBtn = card.querySelector(".custom-tpl-del-btn");
            delBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirm(`确定要删除自定义模板【${item.name}】吗？`)) {
                    const nextList = this.getTemplates().filter(t => t.id !== item.id);
                    this.saveTemplates(nextList);
                }
            };

            // 点击应用模板
            card.onclick = () => {
                this.applyCustomTemplate(item);
            };

            grid.appendChild(card);
        });
    },

    /**
     * 应用选中的自定义模板：同步更新原稿物理尺寸、重置画板并加载分镜
     */
    async applyCustomTemplate(item) {
        if (!item || !item.svg) return;

        const loading = (typeof OP_showLoading === 'function') 
            ? OP_showLoading({ icon: 'process', step: 'Step1', substep: 'Apply Template', progress: 0 }) 
            : null;

        try {
            // 1. 同步物理尺寸到原稿尺寸输入框
            const wMm = item.pageSizeMm.width;
            const hMm = item.pageSizeMm.height;
            if (typeof setPageSizeMm === 'function') {
                setPageSizeMm(wMm, hMm);
            }

            // 2. 判断横向/纵向
            const isLand = wMm > hMm;

            // 3. 换新 GUID 并保存前一页
            if (typeof btmShouldSaveCurrentPage === 'function' && btmShouldSaveCurrentPage()) {
                await btmSaveProjectFile();
            }
            if (typeof setCanvasGUID === 'function') {
                setCanvasGUID();
            }

            // 4. 加载 SVG 模板并自适应构建分镜
            if (typeof loadSVGPlusReset === 'function') {
                await loadSVGPlusReset(item.svg, isLand, true);
            }

            if (typeof createToast === 'function') {
                createToast("应用模板", `已加载模板【${item.name}】 (${wMm}×${hMm}mm)`);
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
