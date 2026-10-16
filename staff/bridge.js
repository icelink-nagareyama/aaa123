/* Browser transport: no persistent data cache; all authorization stays on GAS. */
(function(){
  'use strict';
  var API='https://script.google.com/macros/s/AKfycbxnVPoA358IJnGigvorj4R3nIIlz-bpVS_BFqpktKImhtKZfQlMsNHg7xu598O0knJ6/exec';
  var KEY='icepark-staff-session-v1',base=new URL('index.html',location.href).href,auth=null,epoch=0,inFlight=new Map(),pending=[],flushTimer=null;
  var READS=['getStaffById','getSalesAccess','getDashboardLayout','getDashboardItemDefs','getTopHeaderInfo','getDashboardStats','getDashboardOperations','getReceptionDesk','getQueueListView','getOnSiteView','getAidInventoryView','getGloveInventoryView','getTicketForReception','getPendingSeasonPassApplicationsView'];
  // Keep heavier operational panels separate so they cannot delay the main screen.
  function lane(name){return ['getDashboardOperations','getReceptionDesk','getGloveInventoryView','getPendingSeasonPassApplicationsView'].indexOf(name)!==-1?'support':'main';}
  try{auth=JSON.parse(sessionStorage.getItem(KEY)||'null');}catch(e){}
  if(!auth||!auth.sessionToken||!auth.staffId||!auth.expiresAt||new Date(auth.expiresAt).getTime()<=Date.now())auth=null;
  function invalidate(){epoch++;inFlight.clear();}
  function clear(){auth=null;invalidate();try{sessionStorage.removeItem(KEY);}catch(e){}}
  function remember(value){
    if(!value||typeof value.sessionToken!=='string'||!value.sessionToken||!value.staffId||!value.expiresAt)throw Error('認証結果を確認できませんでした。');
    var saved={sessionToken:value.sessionToken,staffId:value.staffId,expiresAt:value.expiresAt};
    try{sessionStorage.setItem(KEY,JSON.stringify(saved));}catch(e){throw Error('ログイン情報を保持できません。Safariの通常のタブで開き直してください。');}
    auth=saved;invalidate();
  }
  window.staffPortal={baseUrl:base,staffId:auth?auth.staffId:'',sessionToken:auth?auth.sessionToken:'',clear:clear};
  if(new URL(location.href).searchParams.has('session')){var clean=new URL(location.href);clean.searchParams.delete('session');history.replaceState(null,'',clean.href);}
  function send(name,params,token,operation){
    var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},90000);
    return fetch(API+'?source=api',{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},credentials:'omit',referrerPolicy:'no-referrer',redirect:'follow',signal:controller.signal,body:JSON.stringify({action:name,params:params,sessionToken:token,operation:operation})})
      .then(function(r){if(!r.ok)throw Error('サーバーと通信できませんでした。');return r.json();})
      .then(function(r){if(!r||r.ok!==true)throw Error(r&&r.error||'処理結果を確認できませんでした。');if(name==='authenticateStaff')remember(r.result);if(name==='logoutStaff')clear();return r.result;})
      .finally(function(){clearTimeout(timer);});
  }
  function flush(){
    flushTimer=null;var queued=pending;pending=[];var groups=new Map();
    queued.forEach(function(item){var key=JSON.stringify([item.token,item.epoch,lane(item.name)]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);});
    groups.forEach(function(group){for(var offset=0;offset<group.length;offset+=16){dispatch(group.slice(offset,offset+16));}});
  }
  function dispatch(group){
    if(group.length===1){var item=group[0];send(item.name,item.params,item.token,null).then(item.resolve,item.reject);return;}
    send('getStaffReadBatch',[group.map(function(item){return {action:item.name,params:item.params};})],group[0].token,null).then(function(results){
      if(!Array.isArray(results)||results.length!==group.length)throw Error('読取結果を確認できませんでした。');
      results.forEach(function(result,index){if(result&&result.ok===true)group[index].resolve(result.result);else group[index].reject(Error(result&&result.error||'読取に失敗しました。'));});
    }).catch(function(error){group.forEach(function(item){item.reject(error);});});
  }
  function read(name,params,token){
    // These calls always refer to the authenticated staff member, whatever the caller supplied.
    if(name==='getStaffById'||name==='getSalesAccess')params=[];
    var key=JSON.stringify([epoch,token,name,params]);if(inFlight.has(key))return inFlight.get(key);
    var item={name:name,params:params,token:token,epoch:epoch},promise=new Promise(function(resolve,reject){item.resolve=resolve;item.reject=reject;});
    inFlight.set(key,promise);pending.push(item);if(flushTimer===null)flushTimer=setTimeout(flush,8);
    function cleanup(){if(inFlight.get(key)===promise)inFlight.delete(key);}promise.then(cleanup,cleanup);return promise;
  }
  function runner(ok,fail){return new Proxy({}, {get:function(_,action){
    if(action==='withSuccessHandler')return function(f){return runner(f,fail);};
    if(action==='withFailureHandler')return function(f){return runner(ok,f);};
    if(action==='then')return undefined;
    return function(){
      var values=Array.prototype.slice.call(arguments),name=action,params=values,token=auth?auth.sessionToken:'',operation=null;
      if(action==='staffApi'){name=values[0];params=values[1]||[];token=values[2]||token;operation=values[3]||null;}
      var eligible=action==='staffApi'&&!!token&&!operation&&READS.indexOf(name)!==-1;
      var request;if(eligible)request=read(name,params,token);else{invalidate();request=send(name,params,token,operation);}
      request.then(function(value){if(ok)ok(eligible?JSON.parse(JSON.stringify(value)):value);},function(error){if(String(error.message).indexOf('AUTH_REQUIRED:')!==-1)clear();if(fail)fail({message:error.name==='AbortError'?'通信が完了しませんでした。保存操作の場合は、一覧で反映状況を確認してから再操作してください。':error.message||'通信に失敗しました。'});});
    };
  }});}
  window.google={script:{run:runner()}};
})();