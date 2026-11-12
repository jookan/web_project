// 실행: NODE_PATH에 Playwright 설치 경로를 지정한 뒤 node tests/browser_db_smoke.cjs
// SDK를 대체하므로 실제 계정·DB·외부 게시글에는 접근하지 않는다.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const mock = fs.readFileSync(path.join(__dirname, 'fixtures/firebase_mock.js'), 'utf8');
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.css':'text/css', '.wasm':'application/wasm', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg' };
const server = http.createServer((req, res) => {
  if (req.url === '/blank') { res.setHeader('Content-Type','text/html'); res.end('<!doctype html><title>Test</title>'); return; }
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
const user = { uid:'user-a', displayName:'Auth name', photoURL:'' };
const cloud = {
  'users/user-a': {displayName:'DB name', photoURL:'', createdAt:1000},
  'publicProfiles/user-a': {displayName:'Same name', photoURL:'', updatedAt:1000},
  'publicProfiles/user-b': {displayName:'DB name', photoURL:'', updatedAt:1000},
  'posts/post-b': {authorUid:'user-b', category:'song', text:'Shared post', files:[], createdAt:2000},
  'postLikes/post-b_user-b': {userUid:'user-b', postId:'post-b', createdAt:3000},
  'users/user-a/appData/digging': {payload:JSON.stringify([{id:'artist|||saved',title:'Saved',artist:'Artist',genres:['jazz']}]),updatedAt:1000},
  'users/user-a/appData/aurora': {payload:JSON.stringify({playlists:[{id:'yt-main',name:'Saved list',mode:'youtube',tracks:[{id:'yt:saved1',source:'youtube',vid:'saved1',title:'Saved',artist:'Artist',art:'',thumb:'',tags:['jazz','Artist']}]}],current:{youtube:'yt-main'}}),updatedAt:1000}
};
const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << >> >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
let browser;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL || 'chrome'});
  const context = await browser.newContext({viewport:{width:1280,height:900}});
  const errors = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await context.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({contentType:'text/javascript',body:mock}));
  await context.route(/https:\/\/(?!www\.gstatic\.com\/firebasejs\/)/, route => route.abort());
  await context.addInitScript(({user,cloud}) => {
    if (location.protocol !== "http:" || location.hostname !== "127.0.0.1") return;
    if (!localStorage.getItem('__test_seeded')) {
      localStorage.setItem('__test_seeded','1');
      localStorage.setItem('__test_user',JSON.stringify(user));
      localStorage.setItem('__test_cloud',JSON.stringify(cloud));
    }
  }, {user,cloud});
  const page = await context.newPage();
  async function open(name) { await page.goto(origin+'/pages/'+name); }
  async function data() { return page.evaluate(() => JSON.parse(localStorage.getItem('__test_cloud'))); }
  await open('community.html?tab=song');
  await page.getByText('Shared post',{exact:true}).waitFor();
  await page.locator('.like-btn').click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('__test_cloud'))['postLikes/post-b_user-a']);
  assert.ok((await data())['postLikes/post-b_user-b']);
  await page.locator('.comment-btn').click();
  await page.locator('.comment-form input').fill('Test comment');
  await page.locator('.comment-form .submit-btn').click();
  await page.getByText('Test comment',{exact:true}).waitFor();
  await page.locator('.comment-actions .link-btn').first().click();
  await page.locator('.reply-form input').fill('Test reply');
  await page.locator('.reply-form .submit-btn').click();
  await page.getByText('Test reply',{exact:true}).waitFor();
  await page.locator('.follow-btn').first().click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('__test_cloud'))['follows/user-a_user-b']);
  await open('community_profile.html?user=user-b');
  await page.getByText('Shared post',{exact:true}).waitFor();
  assert.equal(await page.locator('#statPosts').textContent(),'1');
  await open('community_write.html?category=free');
  await page.waitForFunction(() => !!window.MD?.myId());
  await page.locator('#postText').fill('New saved post');
  await page.locator('#fileInput').setInputFiles({name:'local.pdf',mimeType:'application/pdf',buffer:pdf});
  await page.locator('#submitPost').click();
  await page.waitForURL('**/community.html?tab=free');
  await page.getByText('New saved post',{exact:true}).waitFor();
  const posted = Object.entries(await data()).find(([key,value]) => key.startsWith('posts/') && value.text==='New saved post');
  assert.equal(posted[1].authorUid,'user-a');
  assert.deepEqual(Object.keys(posted[1].files[0]).sort(),['name','size','type']);
  const downloading=page.waitForEvent('download',{timeout:5000}).catch(async error => { console.error('Attachment UI:',await page.locator('#cloud-data-error').allTextContents()); throw error; });
  await page.getByRole('button',{name:'이 기기에서 열기'}).click();
  assert.equal((await downloading).suggestedFilename(),'local.pdf');
  // 디깅은 Aurora 플레이리스트를 함께 쓰고, YouTube 태그(jazz)에서 장르를 뽑는다.
  await open('digging.html');
  await page.locator('#auroraPlaylistSelect option', {hasText:'Saved list'}).waitFor({state:'attached'});
  await page.locator('.playlist_body .song_row', {hasText:'Saved'}).getByText('jazz',{exact:true}).waitFor();
  // 예전 디깅 목록 중 Aurora에 없는 곡(Imported)만 옮기기 대상으로 보인다. (Saved는 이미 Aurora에 있음)
  await page.evaluate(() => localStorage.setItem('musicdig_playlist_v2',JSON.stringify([{title:'Imported',artist:'Artist',genres:['jazz']}])));
  await page.reload();
  await page.getByRole('button',{name:'예전 디깅 곡 1곡 Aurora로 옮기기'}).waitFor();
  // ✕는 Aurora 계정 목록에서 곡을 뺀다.
  await page.locator('.playlist_body .song_row', {hasText:'Saved'}).getByRole('button',{name:'✕'}).click();
  await page.waitForFunction(() => JSON.parse(JSON.parse(localStorage.getItem('__test_cloud'))['users/user-a/appData/aurora'].payload).playlists[0].tracks.length===0);
  // Last.fm 키는 계정별 브라우저 저장소에만 저장한다.
  await page.locator('#lfmKey').fill('0123456789abcdef0123456789abcdef');
  await page.locator('#lfmKeyForm button[type=submit]').click();
  await page.locator('#lfmStatus').waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('ambient-lastfm-key:user-a')),'0123456789abcdef0123456789abcdef');
  await open('aurora.html');
  await page.locator('#playlistSelect option', {hasText:'Saved list'}).waitFor({state:'attached'});
  page.once('dialog', dialog => dialog.accept('New list'));
  await page.locator('#newPlaylist').click();
  await page.waitForFunction(() => JSON.parse(JSON.parse(localStorage.getItem('__test_cloud'))['users/user-a/appData/aurora'].payload).playlists.some(item=>item.name==='New list'));
  await open('sheet_uploading.html');
  await page.waitForFunction(() => !document.querySelector('.btn-upload').disabled);
  await page.locator('#Sheet-file').setInputFiles({name:'practice.pdf',mimeType:'application/pdf',buffer:pdf});
  await page.locator('#bpm-input').waitFor({state:'visible'});
  await page.waitForFunction(() => !document.querySelector('#bpm-input').disabled);
  await page.locator('#bpm-input').fill('95');
  await page.locator('#bpm-input').dispatchEvent('change');
  await page.waitForFunction(() => Object.entries(JSON.parse(localStorage.getItem('__test_cloud'))).some(([key,value])=>key.startsWith('users/user-a/scores/')&&value.practice.bpm===95));
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#bpm-input').value==='95');
  // 원본이 없는 다른 기기를 모사하고, 이름이 달라도 같은 내용의 PDF 설정을 복원한다.
  await page.goto(origin+'/blank');
  await page.evaluate(() => new Promise((resolve,reject) => {
    const request=indexedDB.deleteDatabase('sheet-music-library-user-a');
    request.onsuccess=resolve; request.onerror=()=>reject(request.error); request.onblocked=()=>reject(new Error('blocked'));
  }));
  await open('sheet_uploading.html');
  await page.locator('[data-missing-id]').waitFor();
  await page.waitForFunction(() => !document.querySelector('.btn-upload').disabled);
  await page.locator('#Sheet-file').setInputFiles({name:'renamed.pdf',mimeType:'application/pdf',buffer:pdf});
  await page.waitForFunction(() => document.querySelector('#bpm-input').value==='95');
  await page.waitForFunction(() => Object.entries(JSON.parse(localStorage.getItem('__test_cloud'))).some(([key,value])=>key.startsWith('users/user-a/scores/')&&value.fileName==='renamed.pdf'));
  assert.equal(Object.keys(await data()).filter(key=>key.startsWith('users/user-a/scores/')).length,1);
  await page.evaluate(() => localStorage.setItem('__test_user',JSON.stringify({uid:'user-b',displayName:'Second user',photoURL:''})));
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('.btn-upload').disabled);
  assert.equal(await page.locator('.button-group button').count(),0);
  await page.evaluate(() => localStorage.setItem('__test_user','null'));
  await open('ambient_login.html');
  await page.locator('#remember').uncheck();
  await page.locator('#googleLogin').click();
  await page.waitForURL('**/ambient_hub.html');
  await page.waitForFunction(() => document.querySelector('#uname').textContent==='DB name');
  assert.equal(await page.evaluate(()=>localStorage.getItem('__test_persistence')),'session');
  await page.locator('#logout').click();
  await page.waitForURL('**/ambient_login.html');
  await page.reload();
  await page.locator('#googleLogin').waitFor();
  const storageChecks = await page.evaluate(async () => {
    const { openAccountState } = await import('/pages/scripts/account_state.js');
    const state = window.__fakeFirebase;
    const initial = JSON.stringify(state.data);
    const guest = await openAccountState('digging','private-test',()=>[]);
    await guest.save([{title:'Guest only'}]);
    const guestIsLocal = initial === JSON.stringify(state.data);
    state.user = {uid:'user-a',displayName:'Auth name'};
    state.failRead = true;
    const failedRead = await openAccountState('digging','private-test',()=>[]);
    let rejectedRead = false;
    try { await failedRead.save(['must not overwrite']); } catch { rejectedRead = true; }
    state.failRead = false;
    const account = await openAccountState('digging','private-test',()=>[]);
    state.user = {uid:'user-b',displayName:'Second user'};
    let rejectedSwitch = false;
    try { await account.save(['must not cross accounts']); } catch { rejectedSwitch = true; }
    state.user = {uid:'user-a',displayName:'Auth name'};
    let rejectedLarge = false;
    try { await account.save('x'.repeat(800001)); } catch { rejectedLarge = true; }
    return {guestIsLocal,rejectedRead,rejectedSwitch,rejectedLarge,unchanged:initial===JSON.stringify(state.data)};
  });
  assert.deepEqual(storageChecks,{guestIsLocal:true,rejectedRead:true,rejectedSwitch:true,rejectedLarge:true,unchanged:true});
  await page.evaluate(() => {
    localStorage.setItem('__test_user',JSON.stringify({uid:'user-a',displayName:'Auth name',photoURL:''}));
    const data=JSON.parse(localStorage.getItem('__test_cloud'));
    data['users/user-a'].displayName='Long display name '.repeat(4);
    localStorage.setItem('__test_cloud',JSON.stringify(data));
  });
  for (const width of [1280,390]) {
    await page.setViewportSize({width,height:900});
    for (const name of ['community.html?tab=song','digging.html','aurora.html','sheet_uploading.html']) {
      await open(name);
      await page.locator('#userArea a').first().waitFor();
      const inside=await page.locator('#userArea').evaluate(element=>{
        const box=element.getBoundingClientRect();
        return box.left>=-1 && box.right<=innerWidth+1;
      });
      assert.equal(inside,true,name+' account area at '+width+'px');
    }
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: community create/read/comment/like/follow/profile, local attachment, playlist sync/import, score metadata/reload/account isolation, login persistence, logout (mock SDK).');
  await context.close();
})().catch(error => { console.error(error); process.exitCode=1; }).finally(async()=>{
  if(browser) await browser.close(); server.close();
});
