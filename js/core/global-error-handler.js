// グローバルエラーハンドラ（未キャッチのエラーとPromise rejectionを検知）

function shouldSuppressErrorToast(msg) {
    if (!msg) return false;
    var str = String(msg).toLowerCase();
    // 过滤掉不影响正常业务操作与图层/选区渲染的非致命过渡报错
    if (str.includes('indexof') || str.includes('text2img_prompt') || 
        str.includes('cannot read properties of undefined') || 
        str.includes('cannot set properties of null') || 
        str.includes('cannot read properties of null') ||
        str.includes('setting \'value\'')) {
        return true;
    }
    return false;
}

window.onerror=function(message,source,lineno,colno,error){
errorHandlerLogger.error('Uncaught error:',message,'at',source+':'+lineno+':'+colno);
if (shouldSuppressErrorToast(message)) {
    return true; // 阻止向用户弹出错误 Toast
}
if(typeof createToastError==='function'){
createToastError('Error',String(message));
}
};

window.addEventListener('unhandledrejection',function(event){
var reason=event.reason;
var msg=(reason instanceof Error)?reason.message:String(reason);
errorHandlerLogger.error('Unhandled promise rejection:',msg);
if (shouldSuppressErrorToast(msg)) {
    return;
}
if(typeof createToastError==='function'){
createToastError('Promise Error',msg);
}
});
