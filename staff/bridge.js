/* Browser-only transport. Authentication and all authorizations remain on GAS. */
(function(){
  'use strict';
  var API='https://script.google.com/macros/s/AKfycbxnVPoA358IJnGigvorj4R3nIIlz-bpVS_BFqpktKImhtKZfQlMsNHg7xu598O0knJ6/exec';
  var KEY='icepark-staff-session-v1',base=new URL('index.html',location.href).href,auth=null;
  try{auth=JSON.parse(sessionStorage.getItem(KEY)||'null');}catch(e){}
  if(!auth||!auth.sessionToken||!auth.staffId||!auth.expiresAt||new Date(auth.expiresAt).getTime()<=Date.now())auth=null;
  function clear(){auth=null;try{sessionStorage.removeItem(KEY);}catch(e){}}
  function remember(value){
    if(!value||typeof value.sessionToken!=='string'||!value.sessionToken||!value.staffId||!value.expiresAt)throw Error('認証結果を確認できませんでした。');
    var saved={sessionToken:value.sessionToken,staffId:value.staffId,expiresAt:value.expiresAt};
    try{sessionStorage.setItem(KEY,JSON.stringify(saved));}catch(e){throw Error('ログイン情報を保持できません。Safariの通常のタブで開き直してください。');}
    auth=saved;
  }
  window.staffPortal={baseUrl:base,staffId:auth?auth.staffId:'',sessionToken:auth?auth.sessionToken:'',clear:clear};
  // Never put the bearer session in links, referrers or browser history.
  if(new URL(location.href).searchParams.has('session')){var clean=new URL(location.href);clean.searchParams.delete('session');history.replaceState(null,'',clean.href);}
  function runner(ok,fail){return new Proxy({}, {get:function(_,action){
    if(action==='withSuccessHandler')return function(f){return runner(f,fail);};
    if(action==='withFailureHandler')return function(f){return runner(ok,f);};
    if(action==='then')return undefined;
    return function(){
      var values=Array.prototype.slice.call(arguments),name=action,params=values,token=auth?auth.sessionToken:'',operation=null;
      if(action==='staffApi'){name=values[0];params=values[1]||[];token=values[2]||token;operation=values[3]||null;}
      var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},90000);
      fetch(API+'?source=api',{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},credentials:'omit',referrerPolicy:'no-referrer',redirect:'follow',signal:controller.signal,body:JSON.stringify({action:name,params:params,sessionToken:token,operation:operation})})
        .then(function(r){if(!r.ok)throw Error('サーバーと通信できませんでした。');return r.json();})
        .then(function(r){if(!r||r.ok!==true)throw Error(r&&r.error||'処理結果を確認できませんでした。');if(name==='authenticateStaff')remember(r.result);if(name==='logoutStaff')clear();return r.result;})
        .then(function(value){clearTimeout(timer);if(ok)ok(value);},function(error){clearTimeout(timer);if(String(error.message).indexOf('AUTH_REQUIRED:')!==-1)clear();if(fail)fail({message:error.name==='AbortError'?'通信が完了しませんでした。保存操作の場合は、一覧で反映状況を確認してから再操作してください。':error.message||'通信に失敗しました。'});});
    };
  }});}
  window.google={script:{run:runner()}};
})();
