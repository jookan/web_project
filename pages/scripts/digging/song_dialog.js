// ============================================================
// digging/song_dialog.js - 곡 정보 창
//   앨범 자켓(추천 카드)이나 플레이리스트 곡을 누르면 열린다.
//   기본 정보(제목·가수·장르)를 먼저 보여주고, Last.fm 곡 정보가 오면 채운다.
// ============================================================
import { getLastfmKey } from "./api.js";
import { getSongInfo, getKoreanWiki } from "./music_lookup.js";
import { genreLabel } from "./genres.js";
import { toKorean, prepareTranslator } from "./translate.js";
import { makeCover, makeGenreTag } from "./ui.js";
import { mergeGenres, formatNumber, formatTime } from "./utils.js";

const sd = {
    dialog: document.getElementById("songDialog"),
    close: document.getElementById("songDialogClose"),
    cover: document.getElementById("songDialogCover"),
    title: document.getElementById("songDialogTitle"),
    artist: document.getElementById("songDialogArtist"),
    album: document.getElementById("songDialogAlbum"),
    tags: document.getElementById("songDialogTags"),
    stats: document.getElementById("songDialogStats"),
    summary: document.getElementById("songDialogSummary"),
    summaryNote: document.getElementById("songDialogSummaryNote"),
    original: document.getElementById("songDialogOriginal"),
    originalText: document.getElementById("songDialogOriginalText"),
    links: document.getElementById("songDialogLinks"),
    actions: document.getElementById("songDialogActions"),
};

let openSong = null;            // 창에 떠 있는 곡
let requestToken = 0;           // 늦게 도착한 다른 곡의 정보가 덮어쓰지 않게
let renderActions = () => {};   // 담기/재생 버튼을 그리는 함수 (digging.js가 넘겨준다)

export function initSongDialog(options) {
    renderActions = options.renderActions;
}

// 담기 상태가 바뀌었을 때 버튼만 다시 그린다.
export function refreshSongActions() {
    sd.actions.replaceChildren();
    if (openSong) renderActions(sd.actions, openSong);
}

function addLink(text, href) {
    const a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = text;
    sd.links.appendChild(a);
}

function renderStats(info) {
    const rows = info ? [
        ["청취자", info.listeners ? formatNumber(info.listeners) + "명" : ""],
        ["재생 수", info.playcount ? formatNumber(info.playcount) + "회" : ""],
        ["길이", info.duration ? formatTime(info.duration) : ""],
    ].filter(([, value]) => value) : [];

    sd.stats.replaceChildren();
    rows.forEach(([name, value]) => {
        const dt = document.createElement("dt");
        dt.textContent = name;
        const dd = document.createElement("dd");
        dd.textContent = value;
        sd.stats.append(dt, dd);
    });
    sd.stats.hidden = rows.length === 0;
}

// info: getSongInfo 결과 (아직 없으면 null)
function fill(song, info) {
    sd.cover.replaceChildren(makeCover((info && info.art) || song.art || song.thumb || "", "song_cover_img"));
    sd.title.textContent = song.title;
    sd.artist.textContent = song.artist;

    const album = (info && info.album) || song.album || "";
    sd.album.textContent = album ? `앨범 · ${album}` : "";
    sd.album.hidden = album === "";

    sd.tags.replaceChildren(...mergeGenres(song.genres, info ? info.tags : []).map(genre => makeGenreTag(genre, genreLabel(genre))));
    renderStats(info);

    sd.links.replaceChildren();
    if (info && info.url) addLink("Last.fm에서 보기 ↗", info.url);
    addLink("YouTube에서 보기 ↗", song.vid
        ? "https://www.youtube.com/watch?v=" + encodeURIComponent(song.vid)
        : "https://www.youtube.com/results?search_query=" + encodeURIComponent(`${song.artist} ${song.title}`));

    refreshSongActions();
}

// 곡 소개 표시
//   note: 소개 아래 작은 안내 (예: "자동 번역된 소개예요.") / original: 원문 보기에 넣을 영어 원문
function setSummary(text, { note = "", original = "" } = {}) {
    sd.summary.textContent = text;
    sd.summary.hidden = text === "";
    sd.summaryNote.textContent = note;
    sd.summaryNote.hidden = note === "";
    sd.originalText.textContent = original;
    sd.original.hidden = original === "";
    sd.original.open = false;
}

const ENGINE_NAMES = { browser: "브라우저 번역", mymemory: "MyMemory 번역" };
const isCurrent = token => token === requestToken && sd.dialog.open;

// 한국어 소개 순서: Last.fm 한국어 소개 → 영어 소개 자동 번역 → 영어 원문
async function showKoreanSummary(song, info, token) {
    if (!info.summary) {
        setSummary("Last.fm에 등록된 곡 소개가 없어요.");
        return;
    }
    setSummary("곡 소개를 한국어로 준비하는 중…");

    const koreanWiki = await getKoreanWiki(song);
    if (!isCurrent(token)) return;
    if (koreanWiki) {
        setSummary(koreanWiki);
        return;
    }

    const result = await toKorean(song.id, info.summary);
    if (!isCurrent(token)) return;
    if (result.translated) {
        setSummary(result.text, {
            note: `Last.fm 영어 소개를 자동 번역했어요. (${ENGINE_NAMES[result.engine] || "자동 번역"})`,
            original: info.summary,
        });
    } else {
        setSummary(info.summary, { note: "번역하지 못해 Last.fm 원문(영어)을 보여드려요." });
    }
}

export async function showSongInfo(song) {
    prepareTranslator();    // 클릭 순간에 번역기를 준비해야 모델 다운로드가 허용된다
    const token = ++requestToken;
    openSong = song;
    fill(song, null);
    const hasKey = getLastfmKey() !== "";
    setSummary(hasKey ? "곡 정보를 불러오는 중…" : "");
    if (!sd.dialog.open) sd.dialog.showModal();
    sd.close.focus();
    if (!hasKey) return;

    try {
        const info = await getSongInfo(song);
        if (!isCurrent(token)) return;
        fill(song, info);
        await showKoreanSummary(song, info, token);
    } catch (error) {
        if (!isCurrent(token)) return;
        setSummary("곡 정보를 불러오지 못했어요. (" + error.message + ")");
    }
}

function close() {
    if (sd.dialog.open) sd.dialog.close();
}

sd.dialog.addEventListener("close", () => {
    openSong = null;
    requestToken++;
});
sd.close.addEventListener("click", close);
sd.dialog.addEventListener("click", event => {
    if (event.target === sd.dialog) close();     // 패널 바깥(어두운 배경)
});
