//{guid, { imageLink, blob }} blob is lz4
const btmProjectsMap=new Map();

const btmDrawer=$("btm-drawer");
const btmDrawerHandle=$("btm-drawer-handle");
const btmImageContainer=$("btm-image-container");
const btmScrollLeftBtn=$("btm-scroll-left");
const btmScrollRightBtn=$("btm-scroll-right");

let btmScrollPosition=0;
let btmIsDragging=false;
let btmIgnoreClose=false;
let btmIsPinned=false;
try {
    btmIsPinned=localStorage.getItem("desu_drawer_pinned")==="true";
} catch(e){}
var btmPinBtn=null;
var btmNavLeft=null;
var btmNavCenter=null;
var btmNavRight=null;
var btmHandleLabel=null;
var btmHandleCount=null;

function btmToggleDrawer() {
btmDrawer.classList.toggle("btm-closed");
btmUpdateHandleText();
btmUpdateScrollButtons();
if (btmIsPinned) {
    try {
        localStorage.setItem("desu_drawer_pinned_state", btmDrawer.classList.contains("btm-closed") ? "closed" : "open");
    } catch(e){}
}
}

function btmCloseDrawer() {
btmDrawer.classList.add("btm-closed");
btmUpdateHandleText();
}

function btmUpdateHandleText() {
if(!btmNavCenter)return;
var isClosed=btmDrawer.classList.contains("btm-closed");
var totalPages=btmGetGuidsSize();
var currentGuid=getCanvasGUID();
var currentIndex=btmGetGuidIndex(currentGuid);
var ctrlKey=isMacOs?"⌘+B":"Ctrl+B";
// OPEN/CLOSEだけでは複数ページを並べる場所だと読めないため、ページ一覧と明示する。
// data-i18nを付け直しておくと、言語切替のupdateContent()がそのまま訳し直す
var labelKey=isClosed?"pageDrawerOpen":"pageDrawerClose";
btmHandleLabel.setAttribute("data-i18n",labelKey);
btmHandleLabel.textContent=getText(labelKey);
var pageText="";
if(totalPages>0){
// 現在ページが一覧に無い状態を「0/n」と出すと1ページ目にいるように誤読される
pageText=currentIndex>=0?" "+(currentIndex+1)+"/"+totalPages:" -/"+totalPages;
}
btmHandleCount.textContent=pageText+" ("+ctrlKey+")";
if(currentIndex>0){
btmNavLeft.textContent="\u2190 "+currentIndex+"(Alt+\u2190)";
btmNavLeft.style.visibility="visible";
}else{
btmNavLeft.textContent="";
btmNavLeft.style.visibility="hidden";
}
if(currentIndex>=0&&currentIndex<totalPages-1){
btmNavRight.textContent=(currentIndex+2)+"\u2192(Alt+\u2192)";
btmNavRight.style.visibility="visible";
}else{
btmNavRight.textContent="";
btmNavRight.style.visibility="hidden";
}
}

function btmUpdatePinBtnState() {
    if (!btmPinBtn) return;
    if (btmIsPinned) {
        btmPinBtn.classList.add("is-pinned");
        btmPinBtn.setAttribute("aria-pressed", "true");
        btmPinBtn.title = "已固定状态 (不会自动收缩/展开，点击取消固定)";
        var label = btmPinBtn.querySelector(".btm-pin-label");
        if (label) label.textContent = "已固定";
    } else {
        btmPinBtn.classList.remove("is-pinned");
        btmPinBtn.setAttribute("aria-pressed", "false");
        btmPinBtn.title = "固定当前状态 (点击固定)";
        var label = btmPinBtn.querySelector(".btm-pin-label");
        if (label) label.textContent = "固定";
    }
}

// 現在のキャンバスをページとしてボトムバーへ残すべきかを判定する。
// 履歴件数で判定すると、キャンバスのリサイズ等で履歴が積まれた空白ページまで
// ページとして登録されてしまうため、キャンバスの実体の有無で判定する。
// 既に登録済みのページは、内容を空にした場合でもサムネイル更新のため保存する
function btmShouldSaveCurrentPage() {
if(btmProjectsMap.has(getCanvasGUID())){
return true;
}
// 初期メッセージだけが乗っているキャンバスは空ページとみなす
return canvas.getObjects().some(obj=>!obj.isInitMessage);
}

// 保留中のコミットを確定してから保存判定する。
// 先に判定すると、直前の変更が履歴に入る前にページを離れて変更が失われる
async function btmSaveCurrentPage(openDrawer=true) {
flushHistory();
if(btmShouldSaveCurrentPage()){
await btmSaveProjectFile(null,openDrawer);
}
}

// ページを作った直後・作り直した直後に呼ぶ、ボトムバーへの登録口。
// ページはbtmSaveProjectFile()が走った時にしかbtmProjectsMapへ載らないため、
// 自動保存やページ移動といった保存の機会が来るまで一覧に出ず、
// btmGetGuidIndex()が-1のままページ番号・Alt+←→・サムネイルが成り立たなかった。
// さらに中身が無いとbtmShouldSaveCurrentPage()が偽になり、
// 空のまま別ページへ移るとページごと消えていた。
// 中身が空でもここで登録するため、作った覚えのあるページが黙って消えない。
// 登録経路はこの1か所に寄せ、呼び出し側でbtmProjectsMapを直接触らない
async function btmRegisterCurrentPage(openDrawer) {
await btmSaveProjectFile(null,openDrawer===true);
}

// chengeCanvasByGuid()は履歴復元の完了を待たずに返る。applyHistoryState()の
// canvas.loadFromJSON()がコールバック方式のため。待たずにキャンバスの中身を
// 数えると0件になり、何もせずページだけが切り替わる
// タブが非表示の間はポーリング間隔が伸びるため、隠れていた時間はタイムアウトに数えない。
// 実時間で測ると読み込みは終わっているのに誤ってタイムアウトする
async function btmWaitForPageReady(timeoutMs) {
const limit=timeoutMs||60000;
const start=performance.now();
let hiddenTotal=0;
let hiddenSince=document.visibilityState==='hidden'?performance.now():0;
function onVisibilityChange(){
if(document.visibilityState==='hidden'){
hiddenSince=performance.now();
}else if(hiddenSince){
hiddenTotal+=performance.now()-hiddenSince;
hiddenSince=0;
}
}
document.addEventListener('visibilitychange',onVisibilityChange);
try{
while (isProjectBusy()) {
const hidden=hiddenTotal+(hiddenSince?performance.now()-hiddenSince:0);
if (performance.now()-start-hidden>limit) {
throw new Error("btmWaitForPageReady: timed out waiting for the page to finish loading");
}
await waitNextFrame();
}
}finally{
document.removeEventListener('visibilitychange',onVisibilityChange);
}
}

async function btmNavigatePage(direction) {
if(isProjectBusy())return;
var currentGuid=getCanvasGUID();
var currentIndex=btmGetGuidIndex(currentGuid);
var targetIndex=currentIndex+direction;
if(targetIndex<0||targetIndex>=btmGetGuidsSize())return;
var targetGuid=btmGetGuidByIndex(targetIndex);
await btmSaveCurrentPage();
await chengeCanvasByGuid(targetGuid);
btmUpdateHandleText();
}

function btmAddImage(imageLink,blob,guid,openDrawer=true) {
uiLogger.info("[btmAddImage] guid="+guid+" openDrawer="+openDrawer+" hasImageLink="+(!!imageLink)+" hasBlob="+(!!blob)+" btmProjectsMap.size="+btmProjectsMap.size);
const projectData=btmProjectsMap.get(guid);
uiLogger.info("[btmAddImage] existingProject="+(!!projectData)+" (update="+(!!projectData)+", create="+(!projectData)+")");

if (projectData) {
btmProjectsMap.set(guid,{imageLink,blob});
const image=document.querySelector(`.btm-image[data-index="${guid}"]`);
if (image&&imageLink&&imageLink.href) {
image.src=imageLink.href;
const pageNumber=image.parentElement.querySelector(".btm-page-number");
if (pageNumber) {
pageNumber.textContent=btmGetGuidIndex(guid)+1;
}
}
} else {
const imageWrapper=document.createElement("div");
imageWrapper.className="btm-image-wrapper";

const pageNumber=document.createElement("div");
pageNumber.className="btm-page-number";

let index=btmGetGuidIndex(guid);
if (index===-1) {
pageNumber.textContent=btmGetGuidsSize()+1;
} else {
pageNumber.textContent=index+1;
}

const moveLeftBtn=document.createElement("button");
moveLeftBtn.innerHTML="←";
moveLeftBtn.className="btm-move-btn btm-move-left";
moveLeftBtn.setAttribute("aria-label",getText("pageMoveLeftLabel"));
moveLeftBtn.title=getText("pageMoveLeftLabel");
moveLeftBtn.addEventListener("click",(e)=>{
e.stopPropagation();
const currentIndex=btmGetGuidIndex(guid);
if (currentIndex>0) {
const previousGuid=btmGetGuidByIndex(currentIndex-1);
swapImages(guid,previousGuid);
updateAllPageNumbers();
}
});

const image=document.createElement("img");
if(imageLink&&imageLink.href)image.src=imageLink.href;
image.className="btm-image";
image.dataset.index=guid;
image.draggable=false;
image.addEventListener("dragstart",(e)=>e.preventDefault());
image.addEventListener("click",async ()=>{
if(isProjectBusy())return;
await btmSaveCurrentPage();
await chengeCanvasByGuid(guid);
btmUpdateHandleText();
});

const moveRightBtn=document.createElement("button");
moveRightBtn.innerHTML="→";
moveRightBtn.className="btm-move-btn btm-move-right";
moveRightBtn.setAttribute("aria-label",getText("pageMoveRightLabel"));
moveRightBtn.title=getText("pageMoveRightLabel");
moveRightBtn.addEventListener("click",(e)=>{
e.stopPropagation();
const currentIndex=btmGetGuidIndex(guid);
if (currentIndex<btmGetGuidsSize()-1) {
const nextGuid=btmGetGuidByIndex(currentIndex+1);
swapImages(guid,nextGuid);
updateAllPageNumbers();
}
});

const deleteBtn=document.createElement("button");
deleteBtn.textContent="🗑";
deleteBtn.className="btm-delete-btn";
deleteBtn.setAttribute("aria-label",getText("pageDeleteLabel"));
deleteBtn.title=getText("pageDeleteLabel");
deleteBtn.addEventListener("click",async (e)=>{
e.stopPropagation();
if(isProjectBusy())return;
// Undoはページ単位の履歴しか持たないため、削除したページは元に戻せない
var confirmed=await showConfirmDialog({
titleKey:'confirmDeletePageTitle',
message:i18next.t('confirmDeletePageBody',{page:btmGetGuidIndex(guid)+1}),
danger:true
});
if(!confirmed)return;
if(isProjectBusy())return;
// ダイアログを開いている間に他の処理がページを動かしている場合があるため取り直す
if(!btmProjectsMap.has(guid))return;
var isCurrentPage=(getCanvasGUID()===guid);
var deletedIndex=btmGetGuidIndex(guid);
btmProjectsMap.delete(guid);
imageWrapper.remove();
if(btmGetGuidsSize()>0){
// 削除したページを表示していた場合は隣のページへ移動する。
// 後ろのページを優先し、最後尾を削除したときは前のページになる
if(isCurrentPage){
var targetIndex=Math.min(deletedIndex,btmGetGuidsSize()-1);
await chengeCanvasByGuid(btmGetGuidByIndex(targetIndex));
}
}else{
// ページが無くなったら空ページを表示する。
// キャンバスに内容を残すと、一覧に無いページを編集し続けることになる
initImageHistory();
setCanvasGUID();
showEmptyPageMessage();
await btmRegisterCurrentPage(true);
}
btmUpdateScrollButtons();
updateAllPageNumbers();
btmUpdateHandleText();
});

var addBtn=document.createElement("button");
addBtn.textContent="+";
addBtn.className="btm-add-btn";
addBtn.addEventListener("click",function(e){
e.stopPropagation();
btmShowAddPageDialog(guid);
});

imageWrapper.appendChild(pageNumber);
imageWrapper.appendChild(moveLeftBtn);
imageWrapper.appendChild(image);
imageWrapper.appendChild(moveRightBtn);
imageWrapper.appendChild(deleteBtn);
imageWrapper.appendChild(addBtn);

// Enable Drag-and-Drop Reordering (Imagesorter.io style)
imageWrapper.draggable = true;

imageWrapper.addEventListener("dragstart", function(e) {
if (typeof BatchManager !== 'undefined' && BatchManager.isBatchMode) {
e.preventDefault();
return;
}
e.dataTransfer.effectAllowed = "move";
e.dataTransfer.setData("text/plain", guid);
imageWrapper.classList.add("is-dragging");
});

imageWrapper.addEventListener("dragend", function(e) {
imageWrapper.classList.remove("is-dragging");
document.querySelectorAll(".btm-image-wrapper").forEach(w => {
w.classList.remove("drag-over-before", "drag-over-after");
});
});

imageWrapper.addEventListener("dragover", function(e) {
if (typeof BatchManager !== 'undefined' && BatchManager.isBatchMode) return;
e.preventDefault();
e.dataTransfer.dropEffect = "move";

const dragging = document.querySelector(".btm-image-wrapper.is-dragging");
if (!dragging || dragging === imageWrapper) return;

const rect = imageWrapper.getBoundingClientRect();
const isGrid = btmDrawer.classList.contains("view-grid") || btmDrawer.classList.contains("dock-right");
let insertBefore = false;
if (isGrid) {
    const midX = rect.left + rect.width / 2;
    const midY = rect.top + rect.height / 2;
    insertBefore = (e.clientY < midY) || (Math.abs(e.clientY - midY) < rect.height * 0.35 && e.clientX < midX);
} else {
    insertBefore = (e.clientX - rect.left < rect.width / 2);
}

if (insertBefore) {
imageWrapper.classList.add("drag-over-before");
imageWrapper.classList.remove("drag-over-after");
} else {
imageWrapper.classList.add("drag-over-after");
imageWrapper.classList.remove("drag-over-before");
}
});

imageWrapper.addEventListener("dragleave", function(e) {
imageWrapper.classList.remove("drag-over-before", "drag-over-after");
});

imageWrapper.addEventListener("drop", function(e) {
if (typeof BatchManager !== 'undefined' && BatchManager.isBatchMode) return;
e.preventDefault();
e.stopPropagation();

const sourceGuid = e.dataTransfer.getData("text/plain");
if (!sourceGuid || sourceGuid === guid) {
imageWrapper.classList.remove("drag-over-before", "drag-over-after");
return;
}

const sourceWrapper = document.querySelector(`.btm-image[data-index="${sourceGuid}"]`)?.parentElement;
if (!sourceWrapper) return;

const rect = imageWrapper.getBoundingClientRect();
const isGrid = btmDrawer.classList.contains("view-grid") || btmDrawer.classList.contains("dock-right");
let insertBefore = false;
if (isGrid) {
    const midX = rect.left + rect.width / 2;
    const midY = rect.top + rect.height / 2;
    insertBefore = (e.clientY < midY) || (Math.abs(e.clientY - midY) < rect.height * 0.35 && e.clientX < midX);
} else {
    insertBefore = (e.clientX - rect.left < rect.width / 2);
}

if (insertBefore) {
btmImageContainer.insertBefore(sourceWrapper, imageWrapper);
} else {
btmImageContainer.insertBefore(sourceWrapper, imageWrapper.nextSibling);
}

imageWrapper.classList.remove("drag-over-before", "drag-over-after");
btmSyncMapOrderFromDOM();

if (typeof createToast === 'function') {
createToast("页面排序", `已调整页面顺序`);
}
});

btmImageContainer.appendChild(imageWrapper);
btmProjectsMap.set(guid,{imageLink,blob});
}

btmDrawer.style.display="block";
if (openDrawer) {
if (btmIsPinned && btmDrawer.classList.contains("btm-closed")) {
btmUpdateHandleText();
} else if (btmDrawer.classList.contains("btm-closed")) {
btmIgnoreClose=true;
btmToggleDrawer();
setTimeout(()=>{btmIgnoreClose=false;},200);
} else {
btmUpdateScrollButtons();
btmUpdateHandleText();
}
} else {
btmUpdateHandleText();
}
}

let btmThumbnailRefreshTimer=null;

function btmScheduleThumbnailRefresh() {
if(btmThumbnailRefreshTimer)clearTimeout(btmThumbnailRefreshTimer);
btmThumbnailRefreshTimer=setTimeout(btmRefreshThumbnail,500);
}

function btmCancelThumbnailRefresh() {
if(btmThumbnailRefreshTimer){
clearTimeout(btmThumbnailRefreshTimer);
btmThumbnailRefreshTimer=null;
}
}

function btmRefreshThumbnail() {
btmThumbnailRefreshTimer=null;
const guid=getCanvasGUID();
if(!guid)return;
const image=document.querySelector(`.btm-image[data-index="${guid}"]`);
if(!image)return;
removeGrid();
const multiplier=Math.min(1,400/canvas.height);
const dataUrl=canvas.toDataURL({format:"jpeg",multiplier:multiplier});
if(isGridVisible){
drawGrid();
isGridVisible=true;
}
image.src=dataUrl;
const projectData=btmProjectsMap.get(guid);
if(projectData){
projectData.imageLink={href:dataUrl};
}
}

function updateAllPageNumbers() {
const pageNumbers=document.querySelectorAll(".btm-page-number");
pageNumbers.forEach((numberElement,index)=>{
numberElement.textContent=index+1;
});
btmUpdateHandleText();
}

function btmSyncMapOrderFromDOM() {
const wrappers = btmImageContainer.querySelectorAll(".btm-image-wrapper");
const newMap = new Map();
wrappers.forEach(wrapper => {
const img = wrapper.querySelector(".btm-image");
if (img && img.dataset.index && btmProjectsMap.has(img.dataset.index)) {
newMap.set(img.dataset.index, btmProjectsMap.get(img.dataset.index));
}
});
btmProjectsMap.forEach((val, key) => {
if (!newMap.has(key)) newMap.set(key, val);
});
btmProjectsMap.clear();
newMap.forEach((val, key) => btmProjectsMap.set(key, val));
updateAllPageNumbers();
btmUpdateHandleText();
}

function swapImages(guid1,guid2) {
const wrapper1=document.querySelector(
`.btm-image[data-index="${guid1}"]`
).parentElement;
const wrapper2=document.querySelector(
`.btm-image[data-index="${guid2}"]`
).parentElement;

const tempElement=document.createElement("div");
btmImageContainer.insertBefore(tempElement,wrapper1);
btmImageContainer.insertBefore(wrapper1,wrapper2);
btmImageContainer.insertBefore(wrapper2,tempElement);
tempElement.remove();

const guids=btmGetGuids();
const newMap=new Map();

guids.forEach((guid)=>{
if (guid===guid1) {
newMap.set(guid2,btmProjectsMap.get(guid2));
} else if (guid===guid2) {
newMap.set(guid1,btmProjectsMap.get(guid1));
} else {
newMap.set(guid,btmProjectsMap.get(guid));
}
});

btmProjectsMap.clear();
newMap.forEach((value,key)=>{
btmProjectsMap.set(key,value);
});

updateAllPageNumbers();
}

function reorderImages(targetIndex,newGuid) {
const newWrapper=document.querySelector(
`.btm-image[data-index="${newGuid}"]`
).parentElement;
const targetWrapper=document.querySelector(
`.btm-image[data-index="${btmGetGuidByIndex(targetIndex)}"]`
).parentElement;
btmImageContainer.insertBefore(newWrapper,targetWrapper);

const newMap=new Map();
const guids=btmGetGuids();
const newGuidData=btmProjectsMap.get(newGuid);

guids.forEach((guid,index)=>{
if (index===targetIndex) {
newMap.set(newGuid,newGuidData);
}
if (guid!==newGuid) {
newMap.set(guid,btmProjectsMap.get(guid));
}
});

btmProjectsMap.clear();
newMap.forEach((value,key)=>{
btmProjectsMap.set(key,value);
});

updateAllPageNumbers();
}

function btmUpdateScrollButtons() {
const containerWidth=btmDrawer.querySelector(
".btm-drawer-content"
).offsetWidth;
const scrollWidth=btmImageContainer.scrollWidth;
btmScrollLeftBtn.style.display=btmScrollPosition>0 ? "block" : "none";
btmScrollRightBtn.style.display=
scrollWidth>containerWidth&&
btmScrollPosition<scrollWidth-containerWidth
? "block"
: "none";
}

function btmScroll(direction) {
const containerWidth=btmDrawer.querySelector(
".btm-drawer-content"
).offsetWidth;
btmScrollPosition+=direction*containerWidth;
btmScrollPosition=Math.max(
0,
Math.min(btmScrollPosition,btmImageContainer.scrollWidth-containerWidth)
);
btmImageContainer.style.transform=`translateX(-${btmScrollPosition}px)`;
btmUpdateScrollButtons();
}

document.addEventListener("DOMContentLoaded",function () {
btmDrawerHandle.textContent="";
btmNavLeft=document.createElement("span");
btmNavLeft.className="btm-nav-left";
btmNavLeft.addEventListener("click",function(e){
e.stopPropagation();
btmNavigatePage(-1);
});
btmNavCenter=document.createElement("span");
btmNavCenter.className="btm-nav-center";
// 訳す部分とページ番号を別の要素に分ける。混ぜるとdata-i18nの
// innerHTML差し替えで番号まで消える
btmHandleLabel=document.createElement("span");
btmHandleCount=document.createElement("span");
btmHandleCount.className="btm-handle-count";

btmPinBtn=document.createElement("button");
btmPinBtn.type="button";
btmPinBtn.className="btm-pin-btn"+(btmIsPinned?" is-pinned":"");
btmPinBtn.title=btmIsPinned?"已固定状态 (不会自动收缩/展开，点击取消固定)":"固定当前状态 (点击固定)";
btmPinBtn.innerHTML='<svg class="btm-pin-icon" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"/></svg><span class="btm-pin-label">'+(btmIsPinned?"已固定":"固定")+'</span>';
btmPinBtn.addEventListener("click",function(e){
e.stopPropagation();
btmIsPinned=!btmIsPinned;
try {
localStorage.setItem("desu_drawer_pinned", btmIsPinned?"true":"false");
localStorage.setItem("desu_drawer_pinned_state", btmDrawer.classList.contains("btm-closed")?"closed":"open");
} catch(err){}
btmUpdatePinBtnState();
if(typeof createToast==='function'){
createToast("总览栏", btmIsPinned?"已固定当前状态（不再自动收缩或弹开）":"已解除固定（恢复自动交互）");
}
});

btmNavCenter.appendChild(btmHandleLabel);
btmNavCenter.appendChild(btmHandleCount);
btmNavCenter.appendChild(btmPinBtn);

btmNavRight=document.createElement("span");
btmNavRight.className="btm-nav-right";
btmNavRight.addEventListener("click",function(e){
e.stopPropagation();
btmNavigatePage(1);
});

btmDrawerHandle.appendChild(btmNavLeft);
btmDrawerHandle.appendChild(btmNavCenter);
btmDrawerHandle.appendChild(btmNavRight);

if(btmIsPinned){
try {
var savedState=localStorage.getItem("desu_drawer_pinned_state");
if(savedState==="open"&&btmDrawer.classList.contains("btm-closed")){
btmDrawer.classList.remove("btm-closed");
} else if(savedState==="closed"&&!btmDrawer.classList.contains("btm-closed")){
btmDrawer.classList.add("btm-closed");
}
} catch(e){}
}
btmUpdateHandleText();
btmDrawerHandle.addEventListener("click",btmToggleDrawer);
btmScrollLeftBtn.addEventListener("click",()=>btmScroll(-1));
btmScrollRightBtn.addEventListener("click",()=>btmScroll(1));

document.addEventListener("mousedown",function (event) {
if (
!btmDrawer.contains(event.target)&&
!btmDrawer.classList.contains("btm-closed")
) {
btmIsDragging=false;
}
});

document.addEventListener("mouseup",function (event) {
if (
!btmDrawer.contains(event.target)&&
!btmDrawer.classList.contains("btm-closed")&&
!btmIsDragging&&
!btmIgnoreClose
) {
if (btmIsPinned) return;
btmCloseDrawer();
}
btmIsDragging=false;
});

function btmStartDrag(e) {
if (e.target.closest('.btm-image-wrapper') || e.target.closest('button')) return;
if (btmDrawer.classList.contains("view-grid") || btmDrawer.classList.contains("dock-right")) return;
e.preventDefault();
isDragging=true;
let startX=e.clientX;
let scrollLeft=btmScrollPosition;

function btmDrag(e) {
const diff=startX-e.clientX;
btmScrollPosition=scrollLeft+diff;
btmImageContainer.style.transform=`translateX(-${btmScrollPosition}px)`;
}

function btmStopDrag() {
document.removeEventListener("mousemove",btmDrag);
document.removeEventListener("mouseup",btmStopDrag);
const containerWidth=btmDrawer.querySelector(
".btm-drawer-content"
).offsetWidth;
btmScrollPosition=Math.max(
0,
Math.min(
btmScrollPosition,
btmImageContainer.scrollWidth-containerWidth
)
);
btmImageContainer.style.transform=`translateX(-${btmScrollPosition}px)`;
btmUpdateScrollButtons();
}

document.addEventListener("mousemove",btmDrag);
document.addEventListener("mouseup",btmStopDrag);
}

btmImageContainer.addEventListener("mousedown",btmStartDrag);
window.addEventListener("resize",btmUpdateScrollButtons);
});

async function chengeCanvasByGuid(guid) {
btmCancelThumbnailRefresh();
const projectData=btmProjectsMap.get(guid);
if(!projectData||!projectData.blob){
uiLogger.error("[chengeCanvasByGuid] project data not found. guid="+guid);
createToastError(getText("pageLoadErrorTitle"),getText("pageLoadErrorMessage"));
return;
}
try {
await loadLz4BlobProjectFile(projectData.blob,guid);
} catch (error) {
uiLogger.error("Error loading ZIP:",error);
createToastError(getText("pageLoadErrorTitle"),getText("pageLoadErrorMessage"));
throw error;
}
}

//return [string, string]
function btmGetGuids() {
return Array.from(btmProjectsMap.keys());
}

//return number
function btmGetGuidIndex(targetGuid) {
const guids=Array.from(btmProjectsMap.keys());
return guids.indexOf(targetGuid);
}

//return number
function btmGetGuidsSize() {
return btmProjectsMap.size;
}

//return guid
function btmGetGuidByIndex(index) {
const guids=Array.from(btmProjectsMap.keys());
return guids[index];
}

function btmGetFirstGuidByIndex() {
return Array.from(btmProjectsMap.keys())[0];
}

function btmShowAddPageDialog(guid) {
if(document.querySelector(".btm-dialog-overlay"))return;
var currentIndex=btmGetGuidIndex(guid);
var dialog=document.createElement("div");
dialog.className="btm-dialog-overlay";

var dialogBox=document.createElement("div");
dialogBox.className="btm-dialog btm-add-page-dialog";

var title=document.createElement("h3");
title.textContent=getText("pageAddDialogTitle")||"插入新页面";

var orientationGroup=document.createElement("div");
orientationGroup.className="btm-dialog-orientation-row";
orientationGroup.innerHTML=
'<label><input type="radio" name="add-page-orient" value="portrait" checked> '+(getText("pagePortrait")||"纵向页面")+' (210×297mm)</label>'+
'<label><input type="radio" name="add-page-orient" value="landscape"> '+(getText("pageLandscape")||"横向页面")+' (297×210mm)</label>';

var templateSection=document.createElement("div");
templateSection.className="btm-dialog-template-section";

var templateLabel=document.createElement("div");
templateLabel.className="btm-dialog-template-label";
templateLabel.textContent="选择分格模板（点击选中，双击直接创建）：";

var templateGrid=document.createElement("div");
templateGrid.className="btm-dialog-template-grid";

templateSection.appendChild(templateLabel);
templateSection.appendChild(templateGrid);

var buttonsRow=document.createElement("div");
buttonsRow.className="btm-dialog-buttons";
buttonsRow.innerHTML=
'<button type="button" class="btm-dialog-button" id="btm-dialog-cancel">'+(getText("cancel")||"取消")+'</button>'+
'<button type="button" class="btm-dialog-button btm-dialog-submit" id="btm-dialog-submit">'+(getText("pageAddDialogSubmit")||"创建并插入")+'</button>';

dialogBox.appendChild(title);
dialogBox.appendChild(orientationGroup);
dialogBox.appendChild(templateSection);
dialogBox.appendChild(buttonsRow);
dialog.appendChild(dialogBox);
document.body.appendChild(dialog);

var selectedTemplateSvg=null;
var currentOrientation="portrait";

async function loadTemplates(isLandscape) {
templateGrid.innerHTML='<div class="btm-dialog-loading">正在加载模板列表...</div>';
let list=[];
try {
if(isLandscape){
if(typeof MangaPanelsImage_Landscape==='undefined'&&typeof loadSvgScript==='function'){
await loadSvgScript("js/svg/manga-panels-image-landscape.js?v=7.2");
}
list=(typeof MangaPanelsImage_Landscape!=='undefined')?MangaPanelsImage_Landscape:[];
}else{
if(typeof MangaPanelsImage_Vertical==='undefined'&&typeof loadSvgScript==='function'){
await loadSvgScript("js/svg/manga-panels-image-vertical.js?v=7.2");
}
list=(typeof MangaPanelsImage_Vertical!=='undefined')?MangaPanelsImage_Vertical:[];
}
}catch(err){
console.warn("Failed to load template svgs",err);
}

templateGrid.innerHTML='';

// 1. Blank page option
var blankItem=document.createElement("div");
blankItem.className="btm-dialog-tpl-item is-selected";
blankItem.title="空白页面 (无分格)";
blankItem.innerHTML=
'<div class="btm-dialog-tpl-preview btm-dialog-tpl-blank">'+
'<span class="material-symbols-outlined" style="font-size:24px; opacity:0.6;">check_box_outline_blank</span>'+
'</div>'+
'<div class="btm-dialog-tpl-name">空白页</div>';
blankItem.addEventListener("click",function(){
templateGrid.querySelectorAll(".btm-dialog-tpl-item").forEach(function(el){el.classList.remove("is-selected");});
blankItem.classList.add("is-selected");
selectedTemplateSvg=null;
});
blankItem.addEventListener("dblclick",function(){
selectedTemplateSvg=null;
doCreate();
});
templateGrid.appendChild(blankItem);
selectedTemplateSvg=null;

// 2. SVG templates
list.forEach(function(tpl){
var itemEl=document.createElement("div");
itemEl.className="btm-dialog-tpl-item";
itemEl.title=tpl.name||"分格模板";

var previewEl=document.createElement("div");
previewEl.className="btm-dialog-tpl-preview";
var img=document.createElement("img");
img.src="data:image/svg+xml;utf8,"+encodeURIComponent(tpl.svg);
img.alt=tpl.name||"template";
previewEl.appendChild(img);

var nameEl=document.createElement("div");
nameEl.className="btm-dialog-tpl-name";
nameEl.textContent=tpl.name?tpl.name.replace(/^[0-9]+[_\-]/,''):"模板";

itemEl.appendChild(previewEl);
itemEl.appendChild(nameEl);

itemEl.addEventListener("click",function(){
templateGrid.querySelectorAll(".btm-dialog-tpl-item").forEach(function(el){el.classList.remove("is-selected");});
itemEl.classList.add("is-selected");
selectedTemplateSvg=tpl.svg;
});

itemEl.addEventListener("dblclick",function(){
selectedTemplateSvg=tpl.svg;
doCreate();
});

templateGrid.appendChild(itemEl);
});
}

var radios=orientationGroup.querySelectorAll('input[name="add-page-orient"]');
radios.forEach(function(radio){
radio.addEventListener("change",function(e){
currentOrientation=e.target.value;
loadTemplates(currentOrientation==="landscape");
});
});

loadTemplates(false);

var cancelButton=document.getElementById("btm-dialog-cancel");
var submitButton=document.getElementById("btm-dialog-submit");

cancelButton.addEventListener("click",function(){
if(dialog.parentElement)dialog.parentElement.removeChild(dialog);
});

dialog.addEventListener("click",function(e){
if(e.target===dialog&&dialog.parentElement){
dialog.parentElement.removeChild(dialog);
}
});

async function doCreate() {
if(isProjectBusy())return;
if(dialog.parentElement)dialog.parentElement.removeChild(dialog);

var isLand=(currentOrientation==="landscape");
var w=isLand?297:210;
var h=isLand?210:297;
var newGuid=generateGUID();

await btmSaveCurrentPage(false);

withoutHistory(function(){
resizeCanvasToObject(w,h);
});
setCanvasGUID(newGuid);

if(selectedTemplateSvg){
await loadSVGPlusReset(selectedTemplateSvg,isLand,false);
}else{
initImageHistory();
showEmptyPageMessage();
}

await btmRegisterCurrentPage(true);
reorderImages(currentIndex+1,newGuid);
updateAllPageNumbers();
btmUpdateHandleText();

if(typeof createToast==='function'){
createToast("插入页面","已在第 "+(currentIndex+1)+" 页后插入新页面");
}
}

submitButton.addEventListener("click",doCreate);
}