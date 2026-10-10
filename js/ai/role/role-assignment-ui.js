// Role Assignment: Role×プロバイダーのマトリクスUI
var roleAssignmentUI=(function(){
var BASE_PROVIDER_COLUMNS=[
{id:ROLE_NONE,label:'None'},
{id:'localComfyUI',label:'ComfyUI (Local)'},
{id:'runpodComfyUI',label:'RunPod ComfyUI'},
{id:'localSDWebUI',label:'SD WebUI (A1111/Forge)'},
{id:'falai',label:'Fal.ai'},
{id:'googleImage',label:'Google Nano Banana'},
{id:'grok',label:'Grok'},
{id:'ollama',label:'Ollama'}
];

function getProviderColumns() {
    var cols = BASE_PROVIDER_COLUMNS.slice();
    if (typeof customOpenAIServiceManager !== 'undefined') {
        var customs = customOpenAIServiceManager.getAll();
        customs.forEach(function(c) {
            cols.push({
                id: c.id,
                label: c.name,
                isCustom: true
            });
        });
    }
    return cols;
}

var ROLE_ROWS=ROLE_MATRIX_ROWS;
var tempAssignments={};
// 「設定値自動保存」OFF のときは保存しない。URL・APIキーは OFF で保存されないのに
// ロール割り当てだけ無条件に保存され、空欄を含む全設定が書き戻されていた。
// 保存の入口をここ1か所にまとめ、判定の書き漏らしを防ぐ
function saveIfAutoSaveEnabled(){
var chk=$('settingsAutoSaveCheckbox');
if(!chk||!chk.checked)return;
debouncedSettingsSave();
}
function open(){
unifiedSettingsWindow.open();
}
function close(){
unifiedSettingsWindow.close();
}
function applyAssignments(){
ROLE_ROWS.forEach(function(row){
providerRegistry.setRoleAssignment(row.role,tempAssignments[row.role]);
});
updateLayerPanel();
raLogger.info('Role assignments applied');
saveIfAutoSaveEnabled();
}
function buildMatrix(){
tempAssignments={};
ROLE_ROWS.forEach(function(row){
tempAssignments[row.role]=providerRegistry.getRoleAssignment(row.role);
});

var columns = getProviderColumns();

// Dynamically generate thead to support custom columns
var table = document.querySelector('.role-matrix');
if (table) {
    var thead = table.querySelector('thead');
    if (!thead) {
        thead = document.createElement('thead');
        table.insertBefore(thead, table.firstChild);
    }
    var trHead = document.createElement('tr');
    var thFirst = document.createElement('th');
    trHead.appendChild(thFirst);

    columns.forEach(function(col) {
        var th = document.createElement('th');
        if (col.id === ROLE_NONE) {
            th.className = 'role-col-none';
            th.setAttribute('data-i18n', 'roleNone');
            th.textContent = (typeof i18next !== 'undefined' ? i18next.t('roleNone') : null) || '无';
        } else if (col.isCustom) {
            th.className = 'role-col-custom';
            th.innerHTML = `${escapeHtml(col.label)}<span class="us-tag us-tag-ext">自定义</span>`;
        } else {
            var headerMap = {
                'localComfyUI': 'ComfyUI<span class="us-tag us-tag-local" data-i18n="usTagLocal">本地</span>',
                'runpodComfyUI': 'RunPod<br>ComfyUI<span class="us-tag us-tag-ext" data-i18n="usTagExternal">外部</span>',
                'localSDWebUI': 'SD WebUI<br>(A1111/Forge)<span class="us-tag us-tag-local" data-i18n="usTagLocal">本地</span>',
                'falai': 'Fal.ai<span class="us-tag us-tag-ext" data-i18n="usTagExternal">外部</span>',
                'googleImage': 'Google<br>Nano Banana<span class="us-tag us-tag-ext" data-i18n="usTagExternal">外部</span>',
                'grok': 'Grok<span class="us-tag us-tag-ext" data-i18n="usTagExternal">外部</span>',
                'ollama': 'Ollama<span class="us-tag us-tag-local" data-i18n="usTagLocal">本地</span>'
            };
            th.innerHTML = headerMap[col.id] || col.label;
        }
        trHead.appendChild(th);
    });
    thead.innerHTML = '';
    thead.appendChild(trHead);
}

var tbody=$('roleMatrixBody');
tbody.innerHTML='';
ROLE_ROWS.forEach(function(row){
var tr=document.createElement('tr');
var tdLabel=document.createElement('td');
tdLabel.setAttribute('data-i18n',row.labelKey);
tdLabel.innerHTML=(typeof i18next !== 'undefined' ? i18next.t(row.labelKey) : '') || row.labelKey;
tr.appendChild(tdLabel);
var effective=providerRegistry.getProviderForRole(row.role);
columns.forEach(function(col){
var isNoneColumn=(col.id===ROLE_NONE);
var td=document.createElement('td');
if(isNoneColumn)td.classList.add('role-col-none');
var radio=document.createElement('input');
radio.type='radio';
radio.name='roleAssign_'+row.role;
radio.className='role-radio';
radio.value=col.id;
if(!isNoneColumn){
var provider=providerRegistry.get(col.id);
if(!provider||!provider.supportsRole(row.role)){
radio.disabled=true;
td.className='role-provider-unavailable';
}
}
var assigned=tempAssignments[row.role];
if(assigned&&assigned!=='default'){
radio.checked=(assigned===col.id);
}else if(effective){
radio.checked=(effective.id===col.id);
}else{
radio.checked=isNoneColumn;
}
radio.addEventListener('change',function(){
if(this.checked){
tempAssignments[row.role]=col.id;
providerRegistry.setRoleAssignment(row.role,col.id);
if(typeof updateWorkflowType==='function')updateWorkflowType();
if(typeof updateLayerPanel==='function')updateLayerPanel();
saveIfAutoSaveEnabled();
if(typeof apiHeartbeat==='function')apiHeartbeat();
}
});
td.appendChild(radio);
tr.appendChild(td);
});
tbody.appendChild(tr);
});
}
return{
open:open,
close:close,
apply:applyAssignments,
applyAssignments:applyAssignments,
buildMatrix:buildMatrix
};
})();
