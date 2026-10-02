'use strict';

/* =====================================================
 * Ambient Player (통합 버전)
 * - Spotify Web Playback SDK : 전곡 (Premium 필요)
 * - YouTube IFrame Player    : 전곡 (Data API 키 필요)
 * - 배경: 커버 팔레트 + 무드로 움직이는 canvas 앰비언트
 * 플레이리스트는 모든 모드가 공유하고, 곡마다 재생 출처(source)를 기억해요.
 * ===================================================== */

const $ = id => document.getElementById(id);
const root = document.documentElement;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ---------- 상태 ---------- */
const STORE = 'ambient-player-v1', SPSTORE = 'ambient-spotify-v1', KEYSTORE = 'ambient-yt-key';
const MODES = ['spotify', 'youtube'];
const MODE_LABEL = { spotify: 'Spotify', youtube: 'YouTube' };
/* Spotify는 127.0.0.1, YouTube는 localhost 주소가 필요해요. 저장소는 주소별로 분리되고, 모드만 해시로 넘겨요 */
const HOST_FOR = { spotify: '127.0.0.1', youtube: 'localhost' };
const b64 = { enc: o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))), dec: s => JSON.parse(decodeURIComponent(escape(atob(s)))) };
try {
  const m = /^#xfer=(.+)$/.exec(location.hash);
  if (m) {
    const d = b64.dec(m[1]);
    if (MODES.includes(d.mode)) localStorage.setItem('ambient-mode', d.mode);
    if (d.key && !localStorage.getItem(KEYSTORE)) localStorage.setItem(KEYSTORE, d.key);
    // 플레이리스트는 id 기준으로 합쳐요 (없는 것만 추가, 같은 id는 없는 곡만 추가)
    const mine = JSON.parse(localStorage.getItem(STORE) || 'null') || { playlists: [], current: {} };
    (d.state?.playlists || []).forEach(p => {
      const same = mine.playlists.find(x => x.id === p.id);
      if (!same) mine.playlists.push(p);
      else p.tracks.forEach(t => { if (!same.tracks.some(x => x.id === t.id)) same.tracks.push(t); });
    });
    mine.current = { ...(d.state?.current || {}), ...(mine.current || {}) };
    localStorage.setItem(STORE, JSON.stringify(mine));
    history.replaceState(null, '', location.pathname + location.search);
  }
} catch {}
function switchHost(m) {
  const host = HOST_FOR[m];
  if (!host || !/^https?:$/.test(location.protocol) || location.hostname === host
      || !['localhost', '127.0.0.1'].includes(location.hostname)) return false;
  const data = { mode: m, key: localStorage.getItem(KEYSTORE), state: JSON.parse(localStorage.getItem(STORE) || 'null') };
  location.href = `${location.protocol}//${host}:${location.port}${location.pathname}#xfer=` + b64.enc(data);
  return true;
}
let state = load(STORE) || { playlists: [{ id: uid(), name: '내 플레이리스트', tracks: [] }], current: null };
let sp = load(SPSTORE) || {};            // { clientId, access, refresh, exp }
let ytKey = localStorage.getItem(KEYSTORE) || '';
let mode = localStorage.getItem('ambient-mode');
if (!MODES.includes(mode)) mode = 'youtube';
let queue = [], idx = -1, shuffle = false, loop = false;
let playing = false;

function uid() { return Math.random().toString(36).slice(2, 9); }
function load(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {} }
function saveSp() { try { localStorage.setItem(SPSTORE, JSON.stringify(sp)); } catch {} }
// 플레이리스트는 모드(Spotify / YouTube)별로 완전히 분리돼요. state.current = { 모드: 플레이리스트 id }
const modeLists = () => state.playlists.filter(p => p.mode === mode);
const curList = () => state.playlists.find(p => p.id === state.current[mode]) || modeLists()[0];
const srcOf = t => t.source || (String(t.id).startsWith('yt:') ? 'youtube' : 'spotify');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let toastTimer;
function toast(msg) {
  const el = $('toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 4500);
}

/** 예전 YouTube 전용 페이지에서 만든 플레이리스트를 한 번만 가져옴 */
(function migrateYouTube() {
  if (localStorage.getItem('ambient-yt-migrated')) return;
  const old = load('ambient-youtube-v1');
  localStorage.setItem('ambient-yt-migrated', '1');
  if (!old?.playlists) return;
  for (const op of old.playlists) {
    if (!op.tracks?.length) continue;
    op.tracks.forEach(t => t.source = 'youtube');
    const same = state.playlists.find(p => p.name === op.name);
    if (same) op.tracks.forEach(t => { if (!same.tracks.some(x => x.id === t.id)) same.tracks.push(t); });
    else state.playlists.push({ id: uid(), name: op.name + ' (YouTube)', tracks: op.tracks });
  }
  save();
})();

/** 모드별 분리: 예전에 여러 출처가 섞여 있던 플레이리스트는 출처별로 쪼개고, 모드마다 기본 플레이리스트를 보장 */
(function normalizePlaylists() {
  const out = [];
  state.playlists = state.playlists.filter(p => p.mode !== 'itunes');
  state.playlists.forEach(p => { p.tracks = p.tracks.filter(t => t.source !== 'itunes'); });
  for (const p of state.playlists) {
    if (p.mode) { out.push(p); continue; }
    const by = {};
    p.tracks.forEach(t => (by[srcOf(t)] ||= []).push(t));
    const srcs = Object.keys(by);
    srcs.forEach((s, i) => out.push({
      id: i ? uid() : p.id, mode: s, tracks: by[s],
      name: srcs.length > 1 ? `${p.name} (${MODE_LABEL[s]})` : p.name
    }));
  }
  for (const m of MODES) if (!out.some(p => p.mode === m)) out.push({ id: uid(), mode: m, name: '내 플레이리스트', tracks: [] });
  state.playlists = out;
  const cur = typeof state.current === 'object' && state.current ? state.current : {};
  for (const m of MODES) if (!out.some(p => p.id === cur[m] && p.mode === m)) cur[m] = out.find(p => p.mode === m).id;
  state.current = cur;
  save();
})();

/* =====================================================
 * Spotify (PKCE 로그인 + Web Playback SDK)
 * ===================================================== */
const SP_SCOPES = 'streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state';
const redirectUri = () => location.origin + location.pathname;
let player = null, deviceId = null, spState = null;     // spState: {pos, dur, ts, paused}

const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function spLogin() {
  const clientId = $('clientId').value.trim() || sp.clientId;
  if (!clientId) return toast('Client ID를 입력해주세요.');
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  sp.clientId = clientId; sp.verifier = verifier; saveSp();
  location.href = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
    response_type: 'code', client_id: clientId, scope: SP_SCOPES, redirect_uri: redirectUri(),
    code_challenge_method: 'S256', code_challenge: challenge
  });
}

async function tokenRequest(params) {
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: sp.clientId, ...params })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error_description || d.error);
  sp.access = d.access_token; sp.exp = Date.now() + d.expires_in * 1000;
  if (d.refresh_token) sp.refresh = d.refresh_token;
  delete sp.verifier; saveSp();
}

async function spToken() {
  if (!sp.access) throw new Error('not connected');
  if (Date.now() > sp.exp - 60000) await tokenRequest({ grant_type: 'refresh_token', refresh_token: sp.refresh });
  return sp.access;
}

async function spApi(path, opts = {}) {
  const r = await fetch('https://api.spotify.com/v1' + path, {
    ...opts, headers: { Authorization: 'Bearer ' + await spToken(), 'Content-Type': 'application/json' }
  });
  if (!r.ok) throw new Error(`Spotify ${r.status}`);
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

async function searchSpotify(term) {
  const d = await spApi(`/search?type=track&limit=10&q=${encodeURIComponent(term)}`);
  return d.tracks.items.map(t => {
    const imgs = t.album.images;
    return {
      id: 'sp:' + t.id, source: 'spotify', uri: t.uri, title: t.name, artist: t.artists.map(a => a.name).join(', '),
      artistId: t.artists[0]?.id, album: t.album.name, art: imgs[0]?.url, thumb: (imgs[1] || imgs[0])?.url
    };
  });
}

/** OAuth 콜백(?code=...) 처리 */
async function handleAuthRedirect() {
  const q = new URLSearchParams(location.search);
  if (!q.has('code') && !q.has('error')) return;
  history.replaceState(null, '', location.pathname);
  if (q.has('error')) return toast('Spotify 로그인이 취소되었어요.');
  try {
    await tokenRequest({ grant_type: 'authorization_code', code: q.get('code'), redirect_uri: redirectUri(), code_verifier: sp.verifier });
    mode = 'spotify'; localStorage.setItem('ambient-mode', mode);
    toast('Spotify 연결 완료!');
  } catch (e) { toast('Spotify 로그인 실패: ' + e.message); }
}

function initSpotifyPlayer() {
  if (player || !sp.access) return;
  window.onSpotifyWebPlaybackReady = () => {
    player = new Spotify.Player({
      name: 'Ambient Player', volume: +$('vol').value,
      getOAuthToken: async cb => { try { cb(await spToken()); } catch { toast('Spotify 토큰 갱신 실패. 다시 연결해주세요.'); } }
    });
    player.addListener('ready', e => { deviceId = e.device_id; });
    player.addListener('not_ready', () => { deviceId = null; });
    player.addListener('player_state_changed', onSpState);
    player.addListener('initialization_error', e => toast('이 브라우저는 지원되지 않아요 (Chrome/Edge 사용): ' + e.message));
    player.addListener('authentication_error', () => toast('Spotify 인증 오류. 연결을 해제 후 다시 연결해주세요.'));
    player.addListener('account_error', () => toast('Spotify Premium 계정이 필요해요.'));
    player.addListener('playback_error', e => toast('재생 오류: ' + e.message));
    player.connect();
  };
  const s = document.createElement('script');
  s.src = 'https://sdk.scdn.co/spotify-player.js'; document.head.appendChild(s);
}

function onSpState(s) {
  if (!s || mode !== 'spotify') return;
  const prev = spState, now = performance.now();
  spState = { pos: s.position, dur: s.duration, ts: now, paused: s.paused };
  setPlaying(!s.paused);

  // 곡이 자연스럽게 끝나면 SDK가 position 0으로 멈춤 → 1초 쉬고 다음 곡
  const finished = prev && !prev.paused && s.paused && s.position === 0 && prev.pos + now - prev.ts >= prev.dur - 2000;
  if (finished) return advance();

  const cur = s.track_window.current_track;
  const i = queue.findIndex(t => t.uri === cur.uri || t.uri === cur.linked_from?.uri);
  if (i >= 0 && i !== idx) { idx = i; showTrack(queue[i]); }
}

function spLogout() {
  try { player?.disconnect(); } catch {}
  player = null; deviceId = null; sp = { clientId: sp.clientId }; saveSp();
  queue = []; idx = -1; setPlaying(false); updateModeUI();
  toast('Spotify 연결을 해제했어요. (새로고침하면 완전히 정리돼요)');
}

/* =====================================================
 * YouTube (Data API 검색 + IFrame 플레이어)
 * ===================================================== */
let ytp = null, ytReady = false, errStreak = 0;

async function ytApi(path, params) {
  const url = new URL('https://www.googleapis.com/youtube/v3/' + path);
  url.search = new URLSearchParams({ ...params, key: ytKey });
  const r = await fetch(url), d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || r.status);
  return d;
}

const isoToSec = iso => {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '') || [];
  return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
};

/** "Artist - Song (Official MV) [4K]" → { artist, title } */
function parseTitle(sn) {
  const ch = sn.channelTitle || '', topic = / - Topic$/.test(ch);
  let title = sn.title
    .replace(/[(\[（【][^)\]）】]*(official|mv|m\/v|music video|lyric|audio|video|visualizer|4k|hd|가사|뮤직비디오|공식)[^)\]）】]*[)\]）】]/gi, '')
    .replace(/\s+/g, ' ').trim();
  let artist = ch.replace(/ - Topic$/, '').replace(/VEVO$/i, '').trim();
  if (!topic) {
    const parts = title.split(/\s[-–—]\s/);
    if (parts.length >= 2) { artist = parts[0].trim(); title = parts.slice(1).join(' - ').trim(); }
  }
  return { title: title || sn.title, artist, topic };
}

async function searchYouTube(q) {
  const [a, b] = await Promise.all([searchYT(q), searchYT(q + ' topic').catch(() => [])]);
  const seen = new Set(), all = [...a, ...b].filter(t => !seen.has(t.id) && seen.add(t.id));
  const topics = all.filter(t => t.topic);          // Topic 채널 음원은 임베드가 거의 항상 허용돼요
  return topics.length ? topics : all;
}

async function searchYT(q) {
  const s = await ytApi('search', {
    part: 'snippet', type: 'video', videoCategoryId: '10', videoEmbeddable: 'true',
    videoSyndicated: 'true', maxResults: '20', q
  });
  const ids = s.items.map(i => i.id.videoId).filter(Boolean).join(',');
  if (!ids) return [];
  const v = await ytApi('videos', { part: 'snippet,contentDetails,status', id: ids });
  const cand = v.items.filter(it => {
    const d = isoToSec(it.contentDetails.duration);
    const rr = it.contentDetails.regionRestriction;
    return d >= 60 && d <= 720 && it.snippet.liveBroadcastContent === 'none' && it.status.embeddable !== false
      && !rr?.blocked?.includes('KR') && (!rr?.allowed || rr.allowed.includes('KR'));
  });
  // 401/403 = 임베드 금지. 네트워크 오류일 땐 통과시켜요.
  const ok = await Promise.all(cand.map(it =>
    fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + it.id))
      .then(r => r.ok, () => true)));
  return cand.filter((_, i) => ok[i])
    .map(it => {
      const th = it.snippet.thumbnails, { title, artist, topic } = parseTitle(it.snippet);
      return {
        id: 'yt:' + it.id, source: 'youtube', vid: it.id, title, artist, topic,
        album: it.snippet.channelTitle,
        art: (th.maxres || th.medium || th.high).url, thumb: (th.medium || th.default).url,
        genre: (it.snippet.tags || []).slice(0, 15).join(' ')
      };
    })
    .sort((a, b) => b.topic - a.topic);      // 앨범 아트가 나오는 Topic 채널을 위로
}

window.onYouTubeIframeAPIReady = () => {
  ytp = new YT.Player('ytPlayer', {
    width: '356', height: '200',
    playerVars: { playsinline: 1, controls: 0, disablekb: 1, fs: 0, rel: 0, iv_load_policy: 3, modestbranding: 1, origin: location.origin },
    events: {
      onReady: () => { ytReady = true; ytp.setVolume(+$('vol').value * 100); },
      onStateChange: e => {
        if (mode !== 'youtube') return;
        if (e.data === YT.PlayerState.PLAYING) { errStreak = 0; setPlaying(true); }
        else if (e.data === YT.PlayerState.PAUSED) setPlaying(false);
        else if (e.data === YT.PlayerState.ENDED) { setPlaying(false); advance(); }
      },
      onError: e => {
        if (mode !== 'youtube') return;
        // 2: 잘못된 ID, 5: HTML5 오류, 100: 삭제/비공개, 101·150: 임베드 금지
        console.error('YT onError', e.data, queue[idx]?.vid, location.href);
        toast(`YouTube 오류 코드 ${e.data}: ` + (e.data === 101 || e.data === 150 ? '임베드 금지' : e.data === 153 ? '출처(Referer) 없음' : '재생 불가') + ' → 건너뛰어요.');
        if (++errStreak >= queue.length) { errStreak = 0; return setPlaying(false); }
        setTimeout(() => playIndex(idx + 1), 800);
      }
    }
  });
};

function loadYouTubeApi() {
  if (document.getElementById('yt-iframe-api')) return;
  const s = document.createElement('script');
  s.id = 'yt-iframe-api'; s.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(s);
}

/* =====================================================
 * 색상 추출 + 무드
 * ===================================================== */
function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return [h, s, l];
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => res(im); im.onerror = rej; im.src = src;
  });
}

/** 가운데 정사각형만 사용. YouTube 썸네일은 검은 여백/거의 흰색 픽셀도 무시 */
async function extractPalette(src, skipExtremes) {
  try {
    const im = await loadImage(src);
    const N = 48, cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    const side = Math.min(im.width, im.height);
    cx.drawImage(im, (im.width - side) / 2, (im.height - side) / 2, side, side, 0, 0, N, N);
    const px = cx.getImageData(0, 0, N, N).data;

    const buckets = new Map();
    let sumL = 0, sumS = 0, n = 0;
    for (let i = 0; i < px.length; i += 4) {
      const [r, g, b] = [px[i], px[i + 1], px[i + 2]];
      const [, s, l] = rgb2hsl(r, g, b);
      if (skipExtremes && (l < .07 || l > .97)) continue;
      sumL += l; sumS += s; n++;
      const key = (r >> 4) << 8 | (g >> 4) << 4 | (b >> 4);
      const e = buckets.get(key) || { r: 0, g: 0, b: 0, c: 0 };
      e.r += r; e.g += g; e.b += b; e.c++;
      buckets.set(key, e);
    }
    if (!n) return null;
    const cands = [...buckets.values()].map(e => {
      const r = e.r / e.c, g = e.g / e.c, b = e.b / e.c, [h, s, l] = rgb2hsl(r, g, b);
      return { r, g, b, h, s, l, score: e.c * (0.25 + s) * Math.max(1 - Math.abs(l - .5) * 1.2, .1) };
    }).sort((a, b) => b.score - a.score);

    const picked = [], dist = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
    for (const c of cands) { if (picked.every(p => dist(p, c) > 70)) picked.push(c); if (picked.length === 3) break; }
    for (const c of cands) { if (picked.length >= 3) break; if (!picked.includes(c)) picked.push(c); }
    while (picked.length < 3) picked.push(picked[0]);
    return { colors: picked, avgL: sumL / n, avgS: sumS / n };
  } catch { return null; }
}

const MOODS = [
  { re: /metal|punk|hard rock|hardcore/i,           name: 'Intense',  energy: .95, sat: 1.1,  lum: .85 },
  { re: /dance|electronic|house|techno|edm/i,       name: 'Electric', energy: .9,  sat: 1.25, lum: 1 },
  { re: /k-?pop|pop|j-?pop/i,                       name: 'Bright',   energy: .75, sat: 1.15, lum: 1.05 },
  { re: /hip-?hop|rap|trap/i,                       name: 'Groovy',   energy: .7,  sat: 1.05, lum: .9 },
  { re: /rock|alternative|indie/i,                  name: 'Driving',  energy: .7,  sat: 1,    lum: .9 },
  { re: /r&b|soul|funk/i,                           name: 'Smooth',   energy: .5,  sat: 1,    lum: .95 },
  { re: /jazz|blues|lounge|lo-?fi/i,                name: 'Mellow',   energy: .35, sat: .85,  lum: .9 },
  { re: /folk|acoustic|singer|country|ballad|piano/i, name: 'Warm',   energy: .3,  sat: .9,   lum: 1 },
  { re: /classical|ambient|new age|soundtrack|instrumental/i, name: 'Serene', energy: .15, sat: .7, lum: .95 },
];

function moodFor(track, pal) {
  const hit = MOODS.find(m => m.re.test(track.genre || ''));
  let m = hit ? { ...hit } : null;
  if (!m) {   // 장르 정보가 없으면 커버의 색으로 분위기 추정
    if (!pal) return { name: 'Neutral', energy: .5, sat: 1, lum: 1 };
    const h = pal.colors[0].h, warm = h < 60 || h > 300;
    m = { energy: clamp(.2 + pal.avgS * .9 + (pal.avgL - .4) * .3, .15, .9), sat: 1, lum: 1,
          name: pal.avgL < .25 ? 'Dark' : pal.avgS > .5 ? 'Vivid' : pal.avgS < .15 ? 'Muted' : warm ? 'Warm' : 'Cool' };
  } else if (pal) {
    if (pal.avgL < .22) m.name = 'Dark ' + m.name, m.lum *= .8;
    else if (pal.avgS < .12) m.name = 'Muted ' + m.name, m.sat *= .8;
  }
  return m;
}

async function fetchGenre(t) {
  if (t.genre !== undefined || t.source !== 'spotify' || !t.artistId) return;
  try { t.genre = (await spApi('/artists/' + t.artistId)).genres?.join(' ') || ''; } catch { t.genre = ''; }
}

const FALLBACK_HUES = [220, 280, 340, 20, 160, 190];

async function applyAmbient(track) {
  const [pal] = await Promise.all([extractPalette(track.art, srcOf(track) === 'youtube'), fetchGenre(track)]);
  const mood = moodFor(track, pal);

  let cols;   // [h, s, l] x 3
  if (pal) {
    cols = pal.colors.map(c => [c.h, clamp(c.s * mood.sat, .4, 1), clamp(c.l * mood.lum, .28, .58)]);
  } else {
    const base = [...track.title].reduce((a, ch) => a + ch.charCodeAt(0), 0) % FALLBACK_HUES.length;
    cols = [0, 1, 2].map(i => [FALLBACK_HUES[(base + i * 2) % FALLBACK_HUES.length], clamp(.65 * mood.sat, .4, 1), .4 * mood.lum]);
  }
  cols.push([(cols[0][0] + 45) % 360, cols[0][1], cols[0][2]]);   // 4번째: 첫 색의 유사색
  bgSet(cols, mood.energy);
  const acc = (c, dl = 0) => `hsl(${c[0].toFixed(0)} ${clamp(c[1] * 100, 45, 95).toFixed(0)}% ${clamp(c[2] * 100 + 24 + dl, 56, 74).toFixed(0)}%)`;
  root.style.setProperty('--accent', acc(cols[0])); root.style.setProperty('--accent2', acc(cols[1] || cols[0], -4));
  // 진행바 전용: 채도를 최대로 올린 선명한 색 (파스텔로 뭉개지지 않도록)
  const vivid = (c, dh = 0) => `hsl(${((c[0] + dh) % 360).toFixed(0)} 100% ${clamp(c[2] * 100 + 22, 54, 64).toFixed(0)}%)`;
  root.style.setProperty('--bar1', vivid(cols[1] || cols[0], -12)); root.style.setProperty('--bar2', vivid(cols[0], 18));
  root.style.setProperty('--breath', (7 - mood.energy * 5.2).toFixed(2) + 's');
  const g = srcOf(track) === 'youtube' ? '' : (track.genre || '').split(' ')[0];
  $('moodChip').textContent = `MOOD · ${mood.name.toUpperCase()}` + (g ? `  ·  ${g}` : '');
}

/* =====================================================
 * 움직이는 배경 (canvas)
 * 색 덩어리(orb)들이 곡선 궤적으로 떠다니고, 각 orb의 색이 팔레트 사이를 오가며 계속 변함.
 * 곡이 바뀌면 팔레트가 부드럽게 다음 곡 색으로 이동. 에너지↑ = 더 빠르고 크게 움직임.
 * ===================================================== */
const bg = $('bg'), bx = bg.getContext('2d');
let W, H;
function resizeBg() { W = bg.width = Math.max(2, innerWidth / 2 | 0); H = bg.height = Math.max(2, innerHeight / 2 | 0); }
addEventListener('resize', resizeBg); resizeBg();

const lerp = (a, b, t) => a + (b - a) * t;
const lerpHue = (a, b, t) => (a + (((b - a + 540) % 360) - 180) * t + 360) % 360;

const pal4 = {
  cur: [[230, .5, .3], [280, .5, .3], [200, .5, .3], [260, .5, .3]],
  tgt: [[230, .5, .3], [280, .5, .3], [200, .5, .3], [260, .5, .3]],
};
let energy = .5, energyTgt = .5, speed = .4, T = 0, lastT = performance.now();
const orbs = Array.from({ length: 8 }, (_, i) => ({
  px: Math.random() * 6.28, py: Math.random() * 6.28, ph: Math.random() * 6.28,
  sx: .1 + Math.random() * .16, sy: .08 + Math.random() * .16,
  r: .32 + Math.random() * .3, cr: .08 + Math.random() * .14, a: i % 4, b: (i + 1 + (i >> 2)) % 4
}));

function bgSet(cols, en) { pal4.tgt = cols; energyTgt = en; }

function bgFrame(now) {
  const dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
  energy += (energyTgt - energy) * .03;
  speed += ((.25 + energy * 1.3) * (playing ? 1 : .35) - speed) * .03;
  T += dt * speed;

  for (let i = 0; i < 4; i++) {
    const c = pal4.cur[i], t = pal4.tgt[i], k = .025;
    c[0] = lerpHue(c[0], t[0], k); c[1] = lerp(c[1], t[1], k); c[2] = lerp(c[2], t[2], k);
  }

  const base = pal4.cur[0];
  bx.globalCompositeOperation = 'source-over';
  bx.fillStyle = `hsl(${base[0]} ${base[1] * 60}% ${base[2] * 35}%)`;
  bx.fillRect(0, 0, W, H);
  bx.globalCompositeOperation = 'lighter';

  for (const o of orbs) {
    const x = W * (.5 + .5 * Math.sin(T * o.sx * 6.28 + o.px));
    const y = H * (.5 + .5 * Math.cos(T * o.sy * 6.28 + o.py));
    const R = Math.max(W, H) * o.r * (1 + .15 * energy * Math.sin(T * 3 + o.ph));
    const m = (Math.sin(T * o.cr * 6.28 + o.ph) + 1) / 2, A = pal4.cur[o.a], B = pal4.cur[o.b];
    const h = lerpHue(A[0], B[0], m) + 20 * Math.sin(T * .6 + o.ph);
    const s = lerp(A[1], B[1], m) * 100, l = lerp(A[2], B[2], m) * 85;
    const g = bx.createRadialGradient(x, y, 0, x, y, R);
    g.addColorStop(0, `hsla(${h} ${s}% ${l}% / .65)`);
    g.addColorStop(1, `hsla(${h} ${s}% ${l}% / 0)`);
    bx.fillStyle = g;
    bx.fillRect(x - R, y - R, R * 2, R * 2);
  }
  requestAnimationFrame(bgFrame);
}
requestAnimationFrame(bgFrame);

/* =====================================================
 * 재생 제어 (모드별 분기)
 * ===================================================== */
const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72a1 1 0 0 0 1.53.85l10.8-6.86a1 1 0 0 0 0-1.7L9.53 4.29A1 1 0 0 0 8 5.14z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4.5" height="16" rx="1.2"/><rect x="13.5" y="4" width="4.5" height="16" rx="1.2"/></svg>';

function setPlaying(p) {
  playing = p;
  $('play').innerHTML = p ? ICON_PAUSE : ICON_PLAY;
  $('coverWrap').classList.toggle('playing', p);
}

function showTrack(t) {
  const wrap = $('coverWrap');
  wrap.classList.add('swap');
  applyAmbient(t);
  setTimeout(() => {
    $('cover').src = $('glow').src = t.art;
    $('cover').style.display = $('glow').style.display = '';
    $('coverEmpty').style.display = 'none';
    wrap.classList.remove('swap');
  }, 350);
  $('title').textContent = t.title;
  $('artist').textContent = t.artist;
  $('album').textContent = t.source === 'youtube' ? '' : (t.album || '');
  document.title = `${t.title} · ${t.artist}`;
  renderTracks();
}

const GAP_MS = 1000;   // 곡 사이 쉬는 시간
let gapTimer;
function advance() {
  clearTimeout(gapTimer);
  if (!loop && idx === queue.length - 1) return setPlaying(false);
  gapTimer = setTimeout(() => playIndex(idx + 1), GAP_MS);
}

async function playIndex(i) {
  clearTimeout(gapTimer);
  if (!queue.length) return;
  idx = (i + queue.length) % queue.length;
  const t = queue[idx];
  if (mode === 'spotify') {
    if (!deviceId) return toast('Spotify 플레이어를 준비 중이에요. 잠시 후 다시 눌러주세요.');
    try {
      player.activateElement?.();
      await spApi(`/me/player/play?device_id=${deviceId}`, { method: 'PUT', body: JSON.stringify({ uris: [t.uri] }) });
    } catch (e) { return toast('재생 실패: ' + e.message + ' (Premium 계정인지 확인해주세요)'); }
  } else if (mode === 'youtube') {
    if (!ytReady) return toast('YouTube 플레이어를 준비 중이에요. 잠시 후 다시 눌러주세요.');
    ytp.loadVideoById(t.vid);
  }
  showTrack(t);
}

let queueListId = null;
function buildQueue() {
  queue = curList().tracks.filter(t => srcOf(t) === mode);
  if (shuffle) queue = [...queue].sort(() => Math.random() - .5);
  queueListId = curList().id;
  return queue.length;
}

/** 재생 중에 플레이리스트가 바뀌면(추가/삭제/순서 변경) 재생 큐도 맞춰서, 다음 곡으로 정상적으로 넘어가게 해요 */
function syncQueue() {
  if (idx < 0 || !queue.length || queueListId !== curList().id) return;
  const curId = queue[idx]?.id, oldIdx = idx;
  const inList = curList().tracks.filter(t => srcOf(t) === mode);
  if (shuffle) {
    const ids = new Set(inList.map(t => t.id)), kept = queue.filter(t => ids.has(t.id)), have = new Set(kept.map(t => t.id));
    queue = kept.concat(inList.filter(t => !have.has(t.id)));
  } else queue = inList;
  idx = queue.findIndex(t => t.id === curId);
  if (idx < 0) idx = Math.min(oldIdx, queue.length) - 1;   // 재생 중인 곡을 지웠으면 그 다음 곡부터 이어가요
}

function startPlaylist() {
  if (!buildQueue()) return toast(`이 플레이리스트에 ${MODE_LABEL[mode]} 곡이 없어요.`);
  errStreak = 0;
  playIndex(0);
}

function next(auto) { auto ? advance() : playIndex(idx + 1); }
function prev() {
  let pos = 0;
  if (mode === 'spotify') pos = spState ? (spState.pos + (spState.paused ? 0 : performance.now() - spState.ts)) / 1000 : 0;
  else pos = ytReady ? ytp.getCurrentTime() : 0;
  if (pos > 3) {
    if (mode === 'spotify') return player?.seek(0);
    return ytp.seekTo(0, true);
  }
  playIndex(idx - 1);
}

/* ---------- 모드 전환 UI ---------- */
function updateModeUI() {
  document.querySelectorAll('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
  const spOn = !!sp.access, ytOn = !!ytKey;
  $('spPanel').hidden = !(mode === 'spotify' && !spOn);
  $('spStatus').hidden = !(mode === 'spotify' && spOn);
  $('ytPanel').hidden = !(mode === 'youtube' && !ytOn);
  $('ytStatus').hidden = !(mode === 'youtube' && ytOn);
  document.body.classList.toggle('mode-youtube', mode === 'youtube');
  $('redirectUri').textContent = redirectUri();
  $('clientId').value = sp.clientId || '';
  renderPlaylists();   // 모드가 바뀌면 그 모드의 플레이리스트만 보여줘요
}

function stopAll() {
  clearTimeout(gapTimer);
  try { player?.pause(); } catch {}
  try { ytReady && ytp.pauseVideo(); } catch {}
}

function setMode(m) {
  if (switchHost(m)) return;
  if (m === mode) return;
  stopAll();
  mode = m; localStorage.setItem('ambient-mode', m);
  queue = []; idx = -1; setPlaying(false);
  updateModeUI();
  if (m === 'spotify') initSpotifyPlayer();
}

/* =====================================================
 * 렌더링
 * ===================================================== */
function renderPlaylists() {
  const sel = $('playlistSelect');
  sel.innerHTML = modeLists().map(p => `<option value="${p.id}">${esc(p.name)} (${p.tracks.length})</option>`).join('');
  sel.value = curList().id;
  renderTracks();
}

const SRC_TAG = { spotify: 'Spotify', youtube: 'YouTube' };
function renderTracks() {
  const p = curList(), ol = $('trackList');
  $('emptyHint').style.display = p.tracks.length ? 'none' : '';
  const playingId = queue[idx]?.id;
  ol.innerHTML = p.tracks.map((t, i) => `
    <li data-i="${i}" class="${t.id === playingId ? 'active' : ''} ${srcOf(t) !== mode ? 'dim' : ''}">
      <img src="${t.thumb}" alt="">
      <div class="tinfo"><b>${esc(t.title)}</b><small>${esc(t.artist)} · ${SRC_TAG[srcOf(t)]}</small></div>
      <button class="mini" data-rm="${i}" title="제거">✕</button>
    </li>`).join('');
}

function renderResults(list) {
  const ul = $('results');
  ul.innerHTML = list.length ? list.map((t, i) => `
    <li>
      <img src="${t.thumb}" alt="">
      <div class="tinfo"><b>${esc(t.title)}</b><small>${esc(t.artist)}</small></div>
      <button class="mini" data-add="${i}" title="플레이리스트에 추가">＋</button>
    </li>`).join('') : '<p class="hint">재생 가능한 결과가 없어요.</p>';
  ul._data = list;
}

/* =====================================================
 * 이벤트
 * ===================================================== */
$('modeSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.mode); });
$('spConnect').onclick = spLogin;
$('spLogout').onclick = spLogout;
$('keySave').onclick = () => {
  const k = $('apiKey').value.trim(); if (!k) return toast('API 키를 입력해주세요.');
  ytKey = k; localStorage.setItem(KEYSTORE, k); $('apiKey').value = ''; updateModeUI(); toast('API 키를 저장했어요.');
};
$('keyReset').onclick = () => { ytKey = ''; localStorage.removeItem(KEYSTORE); updateModeUI(); };

$('searchForm').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('searchInput').value.trim();
  if (!q) return;
  if (mode === 'spotify' && !sp.access) return toast('먼저 Spotify를 연결해주세요.');
  if (mode === 'youtube' && !ytKey) return toast('먼저 YouTube API 키를 입력해주세요.');
  $('results').innerHTML = '<p class="hint">검색 중…</p>';
  try {
    const search = { spotify: searchSpotify, youtube: searchYouTube }[mode];
    renderResults(await search(q));
  } catch (err) { $('results').innerHTML = `<p class="hint">검색에 실패했어요. (${esc(err.message || '네트워크')})</p>`; }
});

let probe = null, probeChain = Promise.resolve();
function probeEmbeddable(vid) {
  const run = () => new Promise(res => {
    if (!ytReady || !window.YT?.Player) return res(true);
    let done = false, timer;
    const finish = v => { if (done) return; done = true; clearTimeout(timer); try { probe.stopVideo(); } catch {} probe.__cb = null; res(v); };
    const start = () => { probe.__cb = finish; timer = setTimeout(() => finish(true), 7000); probe.mute(); probe.loadVideoById(vid); };
    if (probe) return start();
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-9999px;top:0;width:200px;height:120px;opacity:0;pointer-events:none';
    host.innerHTML = '<div id="ytProbe"></div>'; document.body.appendChild(host);
    probe = new YT.Player('ytProbe', {
      width: '200', height: '120', playerVars: { playsinline: 1, controls: 0, origin: location.origin },
      events: {
        onReady: start,
        onError: e => { console.error('YT probe error', e.data); probe.__cb?.(false); },
        onStateChange: e => { if ([1, 2, 3].includes(e.data)) probe.__cb?.(true); }
      }
    });
  });
  return (probeChain = probeChain.then(run, run));
}

$('results').addEventListener('click', async e => {
  const b = e.target.closest('[data-add]'); if (!b || b.disabled) return;
  const ul = $('results'), t = ul._data[+b.dataset.add], p = curList();
  if (t.source === 'youtube') {
    b.disabled = true; b.textContent = '…';
    if (!(await probeEmbeddable(t.vid))) {
      toast('임베드가 금지된 곡이라 추가하지 않고 목록에서 뺐어요.');
      b.closest('li').remove();
      return;
    }
    b.disabled = false; b.textContent = '＋';
  }
  if (!p.tracks.some(x => x.id === t.id)) p.tracks.push(t);
  save(); syncQueue(); renderPlaylists();
});

$('trackList').addEventListener('click', e => {
  const rm = e.target.closest('[data-rm]');
  if (rm) { curList().tracks.splice(+rm.dataset.rm, 1); save(); syncQueue(); renderPlaylists(); return; }
  const li = e.target.closest('li'); if (!li) return;
  const t = curList().tracks[+li.dataset.i];
  if (srcOf(t) !== mode) return toast(`이 곡은 ${MODE_LABEL[srcOf(t)]} 모드에서 재생돼요. 위에서 모드를 바꿔주세요.`);
  shuffle = false; $('shuffle').classList.remove('on');
  buildQueue(); errStreak = 0;
  playIndex(queue.findIndex(x => x.id === t.id));
});

$('playlistSelect').addEventListener('change', e => { state.current[mode] = e.target.value; save(); renderTracks(); });
$('newPlaylist').onclick = () => {
  const name = prompt('새 플레이리스트 이름'); if (!name) return;
  const p = { id: uid(), name, mode, tracks: [] }; state.playlists.push(p); state.current[mode] = p.id; save(); renderPlaylists();
};
$('renamePlaylist').onclick = () => {
  const name = prompt('이름 변경', curList().name); if (!name) return;
  curList().name = name; save(); renderPlaylists();
};
$('deletePlaylist').onclick = () => {
  if (modeLists().length < 2) return alert('이 모드의 마지막 플레이리스트는 삭제할 수 없어요.');
  if (!confirm(`"${curList().name}" 삭제할까요?`)) return;
  const id = curList().id;
  state.playlists = state.playlists.filter(p => p.id !== id);
  state.current[mode] = modeLists()[0].id; save(); renderPlaylists();
};

$('play').onclick = () => {
  if (mode === 'spotify') {
    if (!sp.access) return toast('먼저 Spotify를 연결해주세요.');
    player?.activateElement?.();
    return idx < 0 ? startPlaylist() : player.togglePlay();
  }
  if (mode === 'youtube') {
    if (idx < 0) return startPlaylist();
    if (!ytReady) return;
    return playing ? ytp.pauseVideo() : ytp.playVideo();
  }
};
$('next').onclick = () => idx < 0 ? startPlaylist() : next();
$('prev').onclick = () => idx >= 0 && prev();
$('shuffle').onclick = e => { shuffle = !shuffle; e.currentTarget.classList.toggle('on', shuffle); toast(shuffle ? '셔플: 다음 재생부터 적용' : '셔플 해제'); };
$('loop').onclick = e => { loop = !loop; e.currentTarget.classList.toggle('on', loop); };
function setVolume(v) {
  v = clamp(v, 0, 1);
  player?.setVolume(v); if (ytReady) ytp.setVolume(v * 100);
  $('vol').value = v; $('vol').style.setProperty('--v', v * 100 + '%');
  $('volWave').style.display = v === 0 ? 'none' : '';
}
let lastVol = .8;
$('volBtn').onclick = () => { const v = +$('vol').value; if (v > 0) { lastVol = v; setVolume(0); } else setVolume(lastVol); };
$('vol').oninput = e => setVolume(+e.target.value);
$('volWrap').addEventListener('wheel', e => { e.preventDefault(); setVolume(+$('vol').value + (e.deltaY < 0 ? .05 : -.05)); }, { passive: false });
setVolume(.8);


const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
let seeking = false;
const CLIMAX_FROM = 0.65, CLIMAX_TO = 0.85;   // 곡 진행률 기준 클라이맥스 구간
function setProgress(pos, dur) {
  if (seeking || !dur) return;
  const ratio = pos / dur;
  document.body.classList.toggle('climax', ratio >= CLIMAX_FROM && ratio <= CLIMAX_TO);
  $('seek').value = ratio * 1000;
  $('seek').style.setProperty('--p', ratio * 100 + '%');
  $('cur').textContent = fmt(pos); $('dur').textContent = fmt(dur);
}
setInterval(() => {   // Spotify는 상태 이벤트 사이를 시간으로 보간, YouTube는 플레이어에서 직접 읽음
  if (mode === 'spotify' && spState) {
    const pos = spState.paused ? spState.pos : Math.min(spState.dur, spState.pos + performance.now() - spState.ts);
    setProgress(pos / 1000, spState.dur / 1000);
  } else if (mode === 'youtube' && ytReady && idx >= 0) {
    setProgress(ytp.getCurrentTime() || 0, ytp.getDuration() || 0);
  }
}, 250);

const seekDur = () => mode === 'spotify' ? (spState?.dur || 0) / 1000 : mode === 'youtube' ? (ytReady ? ytp.getDuration() || 0 : 0) : 0;
$('seek').addEventListener('input', e => { seeking = true; $('cur').textContent = fmt(e.target.value / 1000 * seekDur()); e.target.style.setProperty('--p', e.target.value / 10 + '%'); });
$('seekWrap').addEventListener('pointermove', e => {
  const r = $('seekWrap').getBoundingClientRect(), x = clamp(e.clientX - r.left, 0, r.width);
  $('seekTip').style.left = x + 'px'; $('seekTip').textContent = fmt(x / r.width * seekDur());
});
$('seek').addEventListener('change', e => {
  const sec = e.target.value / 1000 * seekDur();
  if (mode === 'spotify') { player?.seek(sec * 1000); if (spState) { spState.pos = sec * 1000; spState.ts = performance.now(); } }
  else if (mode === 'youtube') { if (ytReady) ytp.seekTo(sec, true); }
  seeking = false;
});

let barTimer, btnTimer;
function immersiveWake(e) {
  const b = document.body;
  if (!b.classList.contains('immersive')) return;
  b.classList.add('btn-show'); clearTimeout(btnTimer); btnTimer = setTimeout(() => b.classList.remove('btn-show'), 2600);
  if (e.type !== 'mousemove' || e.clientY > innerHeight - 190) {
    b.classList.add('bar-show'); clearTimeout(barTimer); barTimer = setTimeout(() => b.classList.remove('bar-show'), 2600);
  }
}
['mousemove', 'keydown', 'touchstart'].forEach(ev => addEventListener(ev, immersiveWake, { passive: true }));
const toggleImmersive = () => {
  document.body.classList.toggle('immersive');
  document.body.classList.remove('bar-show', 'btn-show'); clearTimeout(barTimer); clearTimeout(btnTimer);
};
$('immersive').onclick = toggleImmersive;
document.addEventListener('keydown', e => {
  if (['INPUT', 'SELECT'].includes(e.target.tagName) && e.target.type !== 'range') return;
  if (e.code === 'Space') { e.preventDefault(); $('play').click(); }
  else if (e.key === 'f' || e.key === 'F') toggleImmersive();
  else if (e.key === 'ArrowRight') $('next').click();
  else if (e.key === 'ArrowLeft') $('prev').click();
});

/* ---------- 초기화 ---------- */
(async function init() {
  $('cover').style.display = $('glow').style.display = 'none';
  $('play').innerHTML = ICON_PLAY;
  await handleAuthRedirect();
  renderPlaylists();
  updateModeUI();
  if (mode === 'spotify') initSpotifyPlayer();
  if (location.protocol === 'file:') toast('start.bat으로 연 http://127.0.0.1:5500 주소에서 열어야 Spotify/YouTube가 동작해요.');
  loadYouTubeApi();
})();
