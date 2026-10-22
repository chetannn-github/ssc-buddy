// Real extension integration in a fresh Edge profile. Firebase requests are intercepted;
// Google API DNS is also mapped to loopback so no test writes can reach the live project.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { encode, decodeDocument } from './firestore-codec.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const extension = path.resolve('browser-extension/dist/ssc-buddy-study-lock');
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'ssc-study-cloud-test-'));
const uid = 'isolated-study-user', email = 'study-test@example.org';
const jwt = `${Buffer.from(JSON.stringify({alg:'none'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:uid,user_id:uid,email,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,auth_time:Math.floor(Date.now()/1000),firebase:{sign_in_provider:'password'}})).toString('base64url')}.test`;
let control = {version:1,revision:'empty',session:null}, offline = false;
const acknowledgements=[], focusDocuments=new Map();
const server=http.createServer((_,response)=>{response.setHeader('Content-Type','text/html');response.end('<h1>Allowed study page</h1>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
let context;
async function launch() {
  const next = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.EDGE_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless:true, ignoreDefaultArgs:['--disable-extensions'],
    args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--host-resolver-rules=MAP study.example 127.0.0.1,MAP blocked.example 127.0.0.1,MAP *.googleapis.com 127.0.0.1','--no-proxy-server']
  });
  await next.route(/^https:\/\/[^/]*\.googleapis\.com\//, async route => {
    const request=route.request(), url=request.url();
    if (url.includes('accounts:signInWithPassword') || request.method()==='PATCH') await new Promise(resolve=>setTimeout(resolve,180));
    if(offline){await route.abort();return;}
    let result;
    if(url.includes('firestore.googleapis.com')) {
      assert.match(url,new RegExp(`/users/${uid}/`));assert.equal(request.headers().authorization,`Bearer ${jwt}`);
      if(url.includes('/studyFocusDays/')) {
        const key=new URL(url).pathname.split('/').at(-1);
        if(request.method()==='PATCH'){result={...request.postDataJSON(),updateTime:'2026-10-22T00:00:00Z'};focusDocuments.set(key,result);}
        else {result=focusDocuments.get(key);if(!result){await route.fulfill({status:404,contentType:'application/json',body:'{}'});return;}}
      } else if(request.method()==='PATCH') {const body=request.postDataJSON();if(url.includes('/studyLock/current')){control=decodeDocument(body);result={...body,updateTime:'2026-10-22T00:00:00Z'};}else{acknowledgements.push(decodeDocument(body));result=body;}}
      else result={fields:encode(control).mapValue.fields,updateTime:'2026-10-22T00:00:00Z'};
    } else if(url.includes('accounts:signInWithPassword')) result={localId:uid,email,idToken:jwt,refreshToken:'isolated-refresh-token',expiresIn:'3600',registered:true};
    else if(url.includes('accounts:lookup')) result={users:[{localId:uid,email,emailVerified:true,providerUserInfo:[{providerId:'password',email,federatedId:email}]}]};
    else if(url.includes('securetoken.googleapis.com')) result={id_token:jwt,refresh_token:'isolated-refresh-token',expires_in:'3600',user_id:uid};
    else result={};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
  });
  return next;
}
try {
  context=await launch();
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
  const base=worker.url().replace('worker.js','');
  const popup=await context.newPage();popup.on('pageerror',error=>console.error('POPUP ERROR:',error.message));await popup.goto(base+'popup.html');
  await popup.waitForFunction(()=>document.querySelector('#status').hidden);
  assert.equal(await popup.locator('#error').textContent(),'');
  await popup.locator('#email').fill(email);await popup.locator('#password').fill('isolated-test-password');await popup.locator('#login button').click();
  await popup.locator('#login button.is-loading').waitFor();
  await popup.waitForFunction(()=>document.querySelector('#login').hidden && !document.querySelector('#website-editor').hidden);
  await popup.locator('#website-domain').fill('parmar.com'); await popup.locator('#website-add').click();
  await popup.waitForFunction(()=>document.querySelector('#website-count').textContent==='1/3');
  assert.deepEqual(control.allowedDomains,['parmar.com']);
  await popup.getByRole('button',{name:'Remove parmar.com'}).click();
  await popup.waitForFunction(()=>document.querySelector('#website-count').textContent==='0/3');
  const currentTab=await context.newPage();await currentTab.goto(`http://study.example:${port}/`);await currentTab.bringToFront();
  await popup.evaluate(()=>document.querySelector('#reconnect').click());
  await popup.waitForFunction(()=>document.querySelector('#add-current').textContent.includes('study.example'));
  await popup.evaluate(()=>document.querySelector('#add-current').click());
  await popup.locator('#add-current.is-loading').waitFor();
  await popup.waitForFunction(()=>document.querySelector('#website-count').textContent==='1/3');
  assert.deepEqual(control.allowedDomains,['study.example']);
  await currentTab.close();await popup.bringToFront();
  await popup.getByRole('button',{name:'Remove study.example'}).click();await popup.waitForFunction(()=>document.querySelector('#website-count').textContent==='0/3');
  const existing=await context.newPage();await existing.goto(`http://blocked.example:${port}/`);
  control={version:1,revision:'draft-start',session:null,allowedDomains:['study.example']};
  await popup.locator('#reconnect').click();
  await popup.locator('#duration-trigger').click();
  await popup.getByRole('button',{name:'40 minutes',exact:true}).click();
  await popup.getByRole('button',{name:'Save',exact:true}).click();
  await popup.locator('#start-button').click();
  await popup.locator('#start-button.is-loading').waitFor();
  await popup.waitForFunction(()=>document.querySelector('#start-session').hidden);
  assert.equal(control.session.endsAt-control.session.startedAt,40*60000);
  assert.equal(control.source,'extension');await existing.waitForURL(url=>url.href.startsWith(base+'blocked.html'));await existing.locator('#motivation').evaluate(image=>image.decode());
  for(let i=0;i<100&&!acknowledgements.some(ack=>ack.sessionId===control.session.id);i++) await new Promise(resolve=>setTimeout(resolve,20));
  assert.ok(acknowledgements.some(ack=>ack.sessionId===control.session.id));
  for(const domain of ['parmar.com','example.org']){await popup.locator('#website-domain').fill(domain);await popup.locator('#website-add').click();await popup.waitForFunction(expected=>Array.from(document.querySelectorAll('#sites strong')).some(node=>node.textContent===expected),domain);}
  assert.equal(await popup.locator('#website-add').isDisabled(),true);
  assert.equal(control.session.domains.length,3);
  const study=await context.newPage();await study.goto(`http://study.example:${port}/`);assert.equal(await study.locator('h1').textContent(),'Allowed study page');
  const denied=await context.newPage();await denied.goto(`http://blocked.example:${port}/`);assert.ok(denied.url().startsWith(base+'blocked.html'));
  await denied.screenshot({path:path.join(extension,'..','blocked-preview.png'),fullPage:true});
  await popup.setViewportSize({width:360,height:800});await popup.screenshot({path:path.join(extension,'..','popup-preview.png'),fullPage:true});
  control={...control,revision:'expiry-check',session:{...control.session,endsAt:Date.now()+45000}};
  await worker.evaluate(async()=>{const {study}=await chrome.storage.local.get('study');study.session.endsAt=Date.now()-1;await chrome.storage.local.set({study});});
  await popup.locator('#reconnect').click();
  await popup.waitForFunction(()=>/^00:(0[1-9]|[1-4][0-9])$/.test(document.querySelector('#countdown').textContent));
  offline=true;await context.close();context=await launch();
  const cached=await context.newPage();await cached.goto(`http://blocked.example:${port}/`);assert.ok(cached.url().startsWith(base+'blocked.html'));
  await cached.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Offline.'));
  await cached.waitForTimeout(Math.max(0,control.session.endsAt-Date.now()+2500));
  await cached.goto(`http://blocked.example:${port}/`);assert.equal(await cached.locator('h1').textContent(),'Allowed study page');
  offline=false;
  const reopened=await context.newPage();await reopened.goto(base+'popup.html');await reopened.locator('#reconnect').click();
  const expected=control.session.endsAt-control.session.startedAt;
  for(let i=0;i<100&&!Array.from(focusDocuments.values()).some(doc=>decodeDocument(doc).totalMilliseconds>=expected);i++) await new Promise(resolve=>setTimeout(resolve,30));
  const total=()=>Array.from(focusDocuments.values()).reduce((sum,doc)=>sum+decodeDocument(doc).totalMilliseconds,0);
  assert.equal(total(),expected,'all elapsed time is saved after offline expiry');
  await reopened.locator('#reconnect').click();assert.equal(total(),expected,'repeated sync does not count focus twice');
  console.log('PASS: daily focus saved after offline expiry with no double counting; real Edge signed-out login, sign-in loading, current website Add, shared clock picker, max 3 websites, allowed/blocked websites, offline restart and timed expiry. No production data changed.');
} finally {await context?.close();await new Promise(resolve=>server.close(resolve));}
