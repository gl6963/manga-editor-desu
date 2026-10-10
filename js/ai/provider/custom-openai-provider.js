/**
 * Custom OpenAI Compatible Provider & Service Manager
 * Supports:
 * 1. Text Models (LLM: chat/completions) for Text2Prompt, Image2Prompt_LLM
 * 2. Image Models (Image Gen: images/generations) for Text2Image
 */

class CustomOpenAIProvider extends CloudImageProvider {
    constructor(config) {
        super(config.id, config.name);
        this.config = config;
        this._queue = new TaskQueue(config.concurrency || 1);
        this._statusReason = '';
    }

    getQueue() {
        return this._queue;
    }

    getQueueName() {
        return this.id;
    }

    isConfigured() {
        return !!(this.config.baseUrl && this.config.apiKey);
    }

    needsApiKey() {
        return true;
    }

    getApiKey() {
        return (this.config.apiKey || '').trim();
    }

    getEndpointUrl() {
        return this.config.baseUrl || '';
    }

    getBaseUrl() {
        let url = (this.config.baseUrl || '').trim();
        return url.replace(/\/+$/, '');
    }

    getSupportedRoles() {
        const roles = [];
        if (this.config.enableText && this.config.textModel) {
            roles.push(AI_ROLES.Text2Prompt);
            roles.push(AI_ROLES.Image2Prompt_LLM);
        }
        if (this.config.enableImage && this.config.imageModel) {
            roles.push(AI_ROLES.Text2Image);
        }
        return roles;
    }

    supportsRole(role) {
        return this.getSupportedRoles().includes(role);
    }

    getStatusReason() {
        return this._statusReason || '';
    }

    // Ping / Heartbeat check
    async heartbeat() {
        if (!this.getBaseUrl()) {
            this._statusReason = '未配置 Base URL';
            return false;
        }
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 6000);
            const headers = { 'Authorization': 'Bearer ' + this.getApiKey() };
            const res = await fetch(this.getBaseUrl() + '/models', {
                method: 'GET',
                headers: headers,
                signal: controller.signal
            });
            clearTimeout(timer);
            if (res.ok) {
                this._statusReason = '';
                return true;
            }
            this._statusReason = 'HTTP ' + res.status;
            return false;
        } catch (e) {
            this._statusReason = e.name === 'AbortError' ? '连接超时' : '无法连接服务';
            return false;
        }
    }

    // ========== Text Generation (LLM: chat/completions) ==========

    buildTextMessages(systemPrompt, userPrompt) {
        const messages = [];
        if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
        messages.push({ role: 'user', content: userPrompt });
        return messages;
    }

    buildVisionMessages(systemPrompt, userPrompt, imageDataUrl) {
        const messages = [];
        if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
        messages.push({
            role: 'user',
            content: [
                { type: 'text', text: userPrompt },
                { type: 'image_url', image_url: { url: imageDataUrl } }
            ]
        });
        return messages;
    }

    async chat(messages, options) {
        const modelId = this.config.textModel;
        if (!modelId) {
            throw new Error(this.name + ': 未指定文本模型名称');
        }
        const opts = options || {};
        const body = {
            model: modelId,
            messages: messages,
            stream: false
        };
        if (opts.temperature !== undefined) body.temperature = opts.temperature;
        if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens;
        if (opts.jsonObject) body.response_format = { type: 'json_object' };

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + this.getApiKey()
        };

        const controller = new AbortController();
        const timeoutMs = 120000;
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        let response;
        try {
            response = await fetch(this.getBaseUrl() + '/chat/completions', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(body),
                signal: controller.signal
            });
        } catch (e) {
            if (e.name === 'AbortError') throw new Error(this.name + ': 请求超时');
            throw new Error(this.name + ': 网络请求失败 - ' + e.message);
        } finally {
            clearTimeout(timer);
        }

        if (!response.ok) {
            const detail = await response.text();
            throw new Error(this.name + ' HTTP ' + response.status + ': ' + detail.slice(0, 300));
        }

        const data = await response.json();
        const choice = data && data.choices && data.choices[0];
        const content = choice && choice.message ? choice.message.content : '';
        if (typeof content !== 'string' || !content.trim()) {
            throw new Error(this.name + ': 返回内容为空');
        }
        return content.trim();
    }

    // ========== Image Generation (Image Gen: images/generations) ==========

    supportsDetachedT2I() {
        return true;
    }

    async _generate(modelId, inputData) {
        const prompt = inputData.prompt || '';
        const body = {
            model: modelId,
            prompt: prompt,
            n: 1,
            response_format: 'b64_json'
        };
        if (inputData.size) {
            body.size = inputData.size;
        }

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + this.getApiKey()
        };

        const controller = new AbortController();
        const timeoutMs = 180000;
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        let response;
        try {
            response = await fetch(this.getBaseUrl() + '/images/generations', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(body),
                signal: controller.signal
            });

            // If 400 Bad Request with size issue, retry without size
            if (!response.ok && response.status === 400 && body.size) {
                delete body.size;
                response = await fetch(this.getBaseUrl() + '/images/generations', {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(body),
                    signal: controller.signal
                });
            }
        } catch (e) {
            if (e.name === 'AbortError') throw new Error(this.name + ': 生图超时');
            throw new Error(this.name + ': 网络请求错误 - ' + e.message);
        } finally {
            clearTimeout(timer);
        }

        if (!response.ok) {
            const errorText = await response.text();
            let errorMsg = 'HTTP ' + response.status;
            try {
                const errJson = JSON.parse(errorText);
                if (errJson && errJson.error && errJson.error.message) {
                    errorMsg += ': ' + errJson.error.message;
                } else {
                    errorMsg += ': ' + errorText.slice(0, 200);
                }
            } catch (e) {
                errorMsg += ': ' + errorText.slice(0, 200);
            }
            throw new Error(this.name + ' 生图失败: ' + errorMsg);
        }

        const data = await response.json();
        const item = data && data.data && data.data[0];
        if (!item) {
            throw new Error(this.name + ': 返回数据中未找到图片');
        }

        if (item.b64_json) {
            return this._dataUrlToFabricImage('data:image/png;base64,' + item.b64_json);
        } else if (item.url) {
            return this._imageUrlToFabric(item.url);
        } else {
            throw new Error(this.name + ': 接口未返回有效的图像数据 (无 b64_json 或 url)');
        }
    }

    async executeT2I(layer, spinnerId) {
        const modelId = this.config.imageModel;
        if (!modelId) {
            removeSpinner(spinnerId);
            createToastError(this.name, '未配置生图模型名称', 5000);
            return;
        }

        return this._execute(layer, spinnerId, 'T2I', modelId, async () => {
            const rd = baseRequestData(layer);
            let size = "1024x1024";
            if (rd.width && rd.height) {
                const ratio = rd.width / rd.height;
                if (ratio > 1.3) size = "1792x1024";
                else if (ratio < 0.77) size = "1024x1792";
                else size = "1024x1024";
            }
            return {
                prompt: rd.prompt,
                size: size
            };
        });
    }

    async executeDetachedT2I(request, spinnerId) {
        const modelId = this.config.imageModel;
        if (!modelId) {
            removeSpinner(spinnerId);
            createToastError(this.name, '未配置生图模型名称', 5000);
            return null;
        }

        return this._executeDetached(spinnerId, 'T2I', modelId, async () => {
            const rd = baseRequestData(detachedRequestLayer(request));
            return {
                prompt: rd.prompt,
                size: "1024x1024"
            };
        });
    }
}

/**
 * Custom OpenAI Services Store & Management Controller
 */
var customOpenAIServiceManager = (function() {
    const STORAGE_KEY = 'desu_custom_openai_providers';

    function loadConfigs() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.warn('Failed to parse custom providers from storage', e);
            return [];
        }
    }

    function saveConfigs(list) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        } catch (e) {
            console.error('Failed to save custom providers', e);
        }
    }

    function registerProviderInstance(cfg) {
        const instance = new CustomOpenAIProvider(cfg);
        providerRegistry.register(instance);
        return instance;
    }

    return {
        init() {
            const list = loadConfigs();
            list.forEach(cfg => {
                registerProviderInstance(cfg);
            });
            this.renderCustomListUI();
        },

        getAll() {
            return loadConfigs();
        },

        get(id) {
            const list = loadConfigs();
            return list.find(item => item.id === id) || null;
        },

        save(serviceData) {
            const list = loadConfigs();
            let id = serviceData.id;
            const isNew = !id;

            if (isNew) {
                id = 'custom_openai_' + Date.now();
                serviceData.id = id;
            }

            const cleanData = {
                id: id,
                name: (serviceData.name || '自定义服务').trim(),
                baseUrl: (serviceData.baseUrl || '').trim(),
                apiKey: (serviceData.apiKey || '').trim(),
                enableText: !!serviceData.enableText,
                textModel: (serviceData.textModel || '').trim(),
                enableImage: !!serviceData.enableImage,
                imageModel: (serviceData.imageModel || '').trim(),
                concurrency: parseInt(serviceData.concurrency, 10) || 1
            };

            const existingIdx = list.findIndex(item => item.id === id);
            if (existingIdx !== -1) {
                list[existingIdx] = cleanData;
            } else {
                list.push(cleanData);
            }

            saveConfigs(list);
            registerProviderInstance(cleanData);

            // Rebuild role matrix and refresh custom list UI
            if (typeof roleAssignmentUI !== 'undefined' && roleAssignmentUI.buildMatrix) {
                roleAssignmentUI.buildMatrix();
            }
            this.renderCustomListUI();

            if (typeof createToast === 'function') {
                createToast('自定义 API 服务', isNew ? '服务已添加并在左侧表格同步新列' : '自定义服务已更新');
            }

            if (typeof apiHeartbeat === 'function') {
                apiHeartbeat();
            }

            return cleanData;
        },

        deleteService(id, skipConfirm = false) {
            let list = loadConfigs();
            const target = list.find(item => item.id === id);
            if (!target) return;

            if (!skipConfirm && typeof confirm === 'function' && !confirm(`确定要删除自定义服务「${target.name}」吗？`)) {
                return;
            }

            list = list.filter(item => item.id !== id);
            saveConfigs(list);

            // Clear any role assignments mapped to this provider
            if (typeof ROLE_MATRIX_ROWS !== 'undefined') {
                ROLE_MATRIX_ROWS.forEach(row => {
                    if (providerRegistry.getRoleAssignment(row.role) === id) {
                        providerRegistry.setRoleAssignment(row.role, ROLE_NONE);
                    }
                });
            }

            // Remove from registry
            const provider = providerRegistry.get(id);
            if (provider) {
                delete providerRegistry.getAll()[id];
            }

            // Refresh matrix and list UI
            if (typeof roleAssignmentUI !== 'undefined' && roleAssignmentUI.buildMatrix) {
                roleAssignmentUI.buildMatrix();
            }
            this.renderCustomListUI();

            if (typeof saveIfAutoSaveEnabled === 'function') {
                saveIfAutoSaveEnabled();
            }
            if (typeof createToast === 'function') {
                createToast('自定义 API 服务', `已删除服务「${target.name}」，已在左侧表格移除该列`);
            }
            if (typeof apiHeartbeat === 'function') {
                apiHeartbeat();
            }
        },

        async testConnection(data) {
            const baseUrl = (data.baseUrl || '').trim().replace(/\/+$/, '');
            const apiKey = (data.apiKey || '').trim();

            if (!baseUrl) {
                return { success: false, error: '请填写 Base URL' };
            }

            try {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 10000);
                const res = await fetch(baseUrl + '/models', {
                    method: 'GET',
                    headers: { 'Authorization': 'Bearer ' + apiKey },
                    signal: controller.signal
                });
                clearTimeout(timer);

                if (res.ok) {
                    return { success: true, message: '连接成功 (HTTP 200)' };
                } else {
                    return { success: false, error: '连接响应异常: HTTP ' + res.status };
                }
            } catch (e) {
                return { success: false, error: e.name === 'AbortError' ? '连接超时 (10s)' : '无法访问目标地址: ' + e.message };
            }
        },

        renderCustomListUI() {
            const container = document.getElementById('customApiListContainer');
            if (!container) return;

            const list = loadConfigs();
            if (list.length === 0) {
                container.innerHTML = '<div style="padding: 12px; font-size: 11px; color: rgba(255,255,255,0.45); text-align: center;">暂无自定义服务，点击上方按钮新增</div>';
                return;
            }

            let html = '<table class="us-conn-table" style="margin-top: 8px;">';
            html += '<thead><tr><th style="width:22%;">服务名称</th><th style="width:25%;">Base URL</th><th style="width:28%;">支持模型</th><th style="width:25%;">操作</th></tr></thead><tbody>';

            list.forEach(item => {
                const caps = [];
                if (item.enableText && item.textModel) {
                    caps.push(`<span class="us-tag" style="background:rgba(0,229,255,0.15);color:#00e5ff;border:1px solid rgba(0,229,255,0.3);margin-right:4px;">文本: ${escapeHtml(item.textModel)}</span>`);
                }
                if (item.enableImage && item.imageModel) {
                    caps.push(`<span class="us-tag" style="background:rgba(255,107,107,0.15);color:#ff6b6b;border:1px solid rgba(255,107,107,0.3);">生图: ${escapeHtml(item.imageModel)}</span>`);
                }

                html += `<tr>
                    <td><strong>${escapeHtml(item.name)}</strong><br><span class="us-tag us-tag-ext">自定义</span></td>
                    <td style="font-size:11px;word-break:break-all;color:rgba(255,255,255,0.7);">${escapeHtml(item.baseUrl)}</td>
                    <td style="font-size:11px;">${caps.join('<br>') || '<span style="color:#888;">未启用具体能力</span>'}</td>
                    <td>
                        <button type="button" class="us-btn-s" onclick="customOpenAIServiceManager.openEditModal('${item.id}')">编辑</button>
                        <button type="button" class="us-btn-s" style="color:#ff6b6b;border-color:rgba(255,107,107,0.3);" onclick="customOpenAIServiceManager.deleteService('${item.id}')">删除</button>
                    </td>
                </tr>`;
            });

            html += '</tbody></table>';
            container.innerHTML = html;
        },

        openAddModal() {
            this.openEditModal(null);
        },

        openEditModal(id) {
            const card = document.getElementById('customApiFormCard');
            if (!card) return;

            const isEdit = !!id;
            const data = isEdit ? this.get(id) : {
                id: '',
                name: '',
                baseUrl: 'https://api.openai.com/v1',
                apiKey: '',
                enableText: true,
                textModel: '',
                enableImage: false,
                imageModel: '',
                concurrency: 1
            };

            if (!data) return;

            document.getElementById('customFormTitle').textContent = isEdit ? '编辑自定义 API 服务' : '添加自定义 API 服务 (OpenAI 兼容)';
            document.getElementById('customFormServiceId').value = data.id || '';
            document.getElementById('customFormName').value = data.name || '';
            document.getElementById('customFormBaseUrl').value = data.baseUrl || '';
            document.getElementById('customFormApiKey').value = data.apiKey || '';
            document.getElementById('customFormEnableText').checked = !!data.enableText;
            document.getElementById('customFormTextModel').value = data.textModel || '';
            document.getElementById('customFormEnableImage').checked = !!data.enableImage;
            document.getElementById('customFormImageModel').value = data.imageModel || '';
            document.getElementById('customFormTestResult').textContent = '';
            document.getElementById('customFormTestResult').style.color = '';

            card.style.display = 'block';
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        },

        closeFormCard() {
            const card = document.getElementById('customApiFormCard');
            if (card) card.style.display = 'none';
        },

        submitForm() {
            const id = document.getElementById('customFormServiceId').value;
            const name = document.getElementById('customFormName').value.trim();
            const baseUrl = document.getElementById('customFormBaseUrl').value.trim();
            const apiKey = document.getElementById('customFormApiKey').value.trim();
            const enableText = document.getElementById('customFormEnableText').checked;
            const textModel = document.getElementById('customFormTextModel').value.trim();
            const enableImage = document.getElementById('customFormEnableImage').checked;
            const imageModel = document.getElementById('customFormImageModel').value.trim();

            if (!name) {
                alert('请填写服务名称');
                return;
            }
            if (!baseUrl) {
                alert('请填写 Base URL');
                return;
            }
            if (!enableText && !enableImage) {
                alert('请至少勾选一种能力 (大语言模型 或 图像生成模型)');
                return;
            }
            if (enableText && !textModel) {
                alert('已勾选大语言模型，请填写文本模型名称 (如 deepseek-chat, gpt-4o 等)');
                return;
            }
            if (enableImage && !imageModel) {
                alert('已勾选图像生成模型，请填写生图模型名称 (如 gemini-3.1-flash-image, gpt-image-2 等)');
                return;
            }

            this.save({
                id: id,
                name: name,
                baseUrl: baseUrl,
                apiKey: apiKey,
                enableText: enableText,
                textModel: textModel,
                enableImage: enableImage,
                imageModel: imageModel,
                concurrency: 1
            });

            this.closeFormCard();
        },

        async runTestFromForm() {
            const resultEl = document.getElementById('customFormTestResult');
            const baseUrl = document.getElementById('customFormBaseUrl').value.trim();
            const apiKey = document.getElementById('customFormApiKey').value.trim();

            resultEl.style.color = 'rgba(255,255,255,0.7)';
            resultEl.textContent = '正在探测服务连通性...';

            const res = await this.testConnection({ baseUrl, apiKey });
            if (res.success) {
                resultEl.style.color = '#5cb85c';
                resultEl.textContent = '✓ ' + res.message;
            } else {
                resultEl.style.color = '#ff6b6b';
                resultEl.textContent = '✗ ' + res.error;
            }
        }
    };
})();

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', () => {
    customOpenAIServiceManager.init();
});
