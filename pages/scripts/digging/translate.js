// ============================================================
// digging/translate.js - 곡 소개를 한국어로 번역
//   Last.fm 곡 소개는 대부분 영어만 있어서, 한국어 소개가 없으면 자동 번역한다.
//   1) 브라우저 내장 번역기 (Chrome Translator API) - 기기 안에서 번역, 키·요청 제한 없음
//   2) MyMemory 무료 번역 API - 키 없음, 하루 사용량 제한 있음
//   3) 둘 다 안 되면 원문(영어)을 그대로 보여준다.
//   번역 결과는 브라우저에 곡 id별로 저장해 같은 곡을 다시 번역하지 않는다.
// ============================================================
import {
    MYMEMORY_URL, TRANSLATE_CACHE_KEY, TRANSLATE_CACHE_MAX, TRANSLATE_CHUNK, BROWSER_TRANSLATE_TIMEOUT, MYMEMORY_TIMEOUT,
} from "./config.js";
import { readJson, writeStorage } from "./utils.js";

export const hasHangul = text => /[가-힣]/.test(text);

// ---------- 캐시 ----------
const cache = readJson(TRANSLATE_CACHE_KEY, {});   // 곡 id -> { source, text, engine }

function remember(songId, entry) {
    cache[songId] = entry;
    const ids = Object.keys(cache);
    // 오래된 것부터 지워 저장 공간을 일정하게 유지한다. (객체는 넣은 순서를 기억한다)
    ids.slice(0, Math.max(0, ids.length - TRANSLATE_CACHE_MAX)).forEach(id => delete cache[id]);
    writeStorage(TRANSLATE_CACHE_KEY, JSON.stringify(cache));
}

// ---------- 1) 브라우저 내장 번역기 ----------
const LANGUAGES = { sourceLanguage: "en", targetLanguage: "ko" };
let translatorReady = null;     // Promise<Translator> (모델이 준비되면 완료)
let translator = null;          // 준비가 끝난 번역기

// 정해진 시간 안에 끝나지 않으면 fallback 값을 돌려준다. (번역기가 멈춰 창이 계속 '준비 중'이지 않게)
const withTimeout = (promise, ms, fallback) =>
    Promise.race([promise, new Promise(resolve => setTimeout(() => resolve(fallback), ms))]);

// 번역 모델을 처음 내려받을 때는 사용자 클릭(사용자 활성화)이 필요하다.
// 그래서 곡 정보 창을 여는 클릭 순간에 호출해 둔다. 내려받기는 백그라운드로 진행되고,
// 끝나기 전까지는 MyMemory로 번역한다.
export function prepareTranslator() {
    const api = globalThis.Translator;
    if (!api || translatorReady) return;
    translatorReady = api.availability(LANGUAGES)
        .then(status => {
            if (status === "unavailable") throw new Error("이 브라우저는 영어→한국어 번역을 지원하지 않아요.");
            return api.create(LANGUAGES);
        })
        .then(created => (translator = created));
    translatorReady.catch(() => { translatorReady = null; });   // 실패하면 다음 클릭 때 다시 시도
}

async function translateInBrowser(text) {
    if (!translator) return "";     // 아직 준비 중이면 기다리지 않는다
    try {
        return String(await withTimeout(translator.translate(text), BROWSER_TRANSLATE_TIMEOUT, "")).trim();
    } catch {
        return "";
    }
}

// ---------- 2) MyMemory ----------
// 한 번에 보낼 수 있는 글자 수가 제한돼 있어서 문장 단위로 나눠 보낸다.
function splitSentences(text) {
    const sentences = text.match(/[^.!?]+[.!?]*\s*/g) || [text];
    const chunks = [];
    let current = "";
    sentences.forEach(sentence => {
        if ((current + sentence).length > TRANSLATE_CHUNK && current) {
            chunks.push(current.trim());
            current = "";
        }
        current += sentence.slice(0, TRANSLATE_CHUNK);
    });
    if (current.trim()) chunks.push(current.trim());
    return chunks;
}

async function translateChunk(text) {
    const url = new URL(MYMEMORY_URL);
    url.search = new URLSearchParams({ q: text, langpair: "en|ko" });
    const response = await fetch(url, { signal: AbortSignal.timeout(MYMEMORY_TIMEOUT) });
    if (!response.ok) throw new Error(`번역 요청 실패 (HTTP ${response.status})`);
    const data = await response.json();
    const translated = data.responseData && data.responseData.translatedText;
    // 하루 사용량을 넘기면 상태 코드는 200이어도 경고 문구가 온다.
    if (Number(data.responseStatus) !== 200 || data.quotaFinished || !translated || /MYMEMORY WARNING/i.test(translated)) {
        throw new Error(data.responseDetails || "번역 사용량을 넘었어요.");
    }
    return translated;
}

async function translateWithMyMemory(text) {
    try {
        const parts = [];
        for (const chunk of splitSentences(text)) parts.push(await translateChunk(chunk));
        return parts.join(" ").trim();
    } catch (error) {
        console.warn("MyMemory 번역 실패:", error.message);
        return "";
    }
}

// ---------- 공개 함수 ----------
// 결과: { text, translated, engine }
//   translated: 자동 번역했으면 true / engine: "browser" | "mymemory" | ""
export async function toKorean(songId, text) {
    const source = String(text || "").trim();
    if (!source || hasHangul(source)) return { text: source, translated: false, engine: "" };

    const saved = cache[songId];
    if (saved && saved.source === source) return { text: saved.text, translated: true, engine: saved.engine };

    for (const [engine, translate] of [["browser", translateInBrowser], ["mymemory", translateWithMyMemory]]) {
        const result = await translate(source);
        if (result && hasHangul(result)) {
            remember(songId, { source, text: result, engine });
            return { text: result, translated: true, engine };
        }
    }
    return { text: source, translated: false, engine: "" };
}
