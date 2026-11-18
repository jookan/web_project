// ============================================================
// digging/ui.js - 화면 요소를 만드는 도우미, 알림(토스트), 페이지 안 대화창
//   브라우저 alert/prompt/confirm 대신 페이지 디자인에 맞춘 창을 띄운다.
//   글자는 모두 textContent로 넣어 곡 제목 등에 HTML이 섞여 있어도 안전하다.
// ============================================================
import { TOAST_DURATION } from "./config.js";

// ---------- 요소 만들기 ----------
export function makeButton(text, title, onClick, className = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.title = title;
    if (className) button.className = className;
    button.addEventListener("click", onClick);
    return button;
}

export function makeLabel(text) {
    const label = document.createElement("span");
    label.className = "added_label";
    label.textContent = text;
    return label;
}

export function makeMessage(text) {
    const p = document.createElement("p");
    p.className = "empty_message";
    p.textContent = text;
    return p;
}

export function showMessage(container, text) {
    container.replaceChildren(makeMessage(text));
}

// label을 주면 그 이름으로 보여주고, 원래 장르 이름은 마우스를 올렸을 때 보인다.
export function makeGenreTag(genre, label = genre) {
    const tag = document.createElement("span");
    tag.className = "genre_tag";
    tag.textContent = label;
    if (label !== genre) tag.title = genre;
    return tag;
}

// 앨범 자켓. 이미지가 없거나 깨지면 ♪ 자리 표시로 바꾼다.
export function makeCover(url, className) {
    const holder = document.createElement("span");
    holder.className = className;
    const fallback = () => {
        holder.classList.add("empty");
        holder.textContent = "♪";
    };
    if (!url) {
        fallback();
        return holder;
    }
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", fallback, { once: true });
    holder.appendChild(img);
    return holder;
}

// "노래 제목 - 가수 [장르]" 한 줄 (검색 결과)
export function makeSongRow(song, genreCount = 2) {
    const row = document.createElement("p");
    row.className = "song_row";
    const info = document.createElement("span");
    info.className = "song_info";
    info.textContent = `${song.title} - ${song.artist} `;
    song.genres.slice(0, genreCount).forEach(genre => {
        info.append(makeGenreTag(genre), " ");
    });
    row.appendChild(info);
    return row;
}

// 굵은 제목 + 작은 부가 설명 (플레이리스트 곡·추천 카드 공용)
export function makeTrackText(title, detail) {
    const box = document.createElement("span");
    box.className = "tinfo";
    const b = document.createElement("b");
    b.textContent = title;
    b.title = title;
    const small = document.createElement("small");
    small.textContent = detail;
    small.title = detail;
    box.append(b, small);
    return box;
}

// ---------- 알림 ----------
const toastBox = document.getElementById("toast");
let toastTimer = null;

export function notify(message) {
    // 대화창이 열려 있으면 그 위(top layer)에 보이도록 대화창 안으로 옮긴다.
    const host = document.querySelector("dialog[open]") || document.body;
    if (toastBox.parentElement !== host) host.appendChild(toastBox);
    toastBox.textContent = message;
    toastBox.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastBox.classList.remove("show"), TOAST_DURATION);
}

// ---------- 대화창 (만들기·이름 변경·삭제 확인 등) ----------
const dg = {
    dialog: document.getElementById("dgDialog"),
    form: document.getElementById("dgDialogForm"),
    title: document.getElementById("dgDialogTitle"),
    message: document.getElementById("dgDialogMessage"),
    field: document.getElementById("dgDialogField"),
    label: document.getElementById("dgDialogLabel"),
    input: document.getElementById("dgDialogInput"),
    error: document.getElementById("dgDialogError"),
    cancel: document.getElementById("dgDialogCancel"),
    ok: document.getElementById("dgDialogOk"),
};

// input이 있으면 입력한 문자열(취소하면 null), 없으면 확인 여부(true/false)를 돌려준다.
//   input: { label, value, placeholder }
// Enter = 확인, Esc·취소·바깥 클릭 = 취소. 이미 열려 있으면 바로 취소로 끝난다.
export function openDialog({ title, message = "", input = null, confirmText = "확인", danger = false }) {
    const cancelValue = input ? null : false;
    if (dg.dialog.open) return Promise.resolve(cancelValue);

    dg.title.textContent = title;
    dg.message.textContent = message;
    dg.message.hidden = message === "";
    dg.field.hidden = !input;
    dg.error.hidden = true;
    dg.ok.textContent = confirmText;
    dg.ok.classList.toggle("danger", danger);
    if (input) {
        dg.label.textContent = input.label;
        dg.input.value = input.value || "";
        dg.input.placeholder = input.placeholder || "";
    }

    return new Promise(resolve => {
        const finish = value => {
            dg.form.removeEventListener("submit", onSubmit);
            dg.cancel.removeEventListener("click", onCancel);
            dg.dialog.removeEventListener("cancel", onEscape);
            dg.dialog.removeEventListener("click", onBackdrop);
            dg.dialog.close();
            resolve(value);
        };
        const onSubmit = event => {
            event.preventDefault();
            if (!input) return finish(true);
            const value = dg.input.value.trim();
            if (value === "") {
                dg.error.textContent = "이름을 입력해주세요.";
                dg.error.hidden = false;
                dg.input.focus();
                return;
            }
            finish(value);
        };
        const onCancel = () => finish(cancelValue);
        const onEscape = event => {
            event.preventDefault();
            finish(cancelValue);
        };
        const onBackdrop = event => {
            if (event.target === dg.dialog) finish(cancelValue);    // 패널 바깥(어두운 배경)
        };
        dg.form.addEventListener("submit", onSubmit);
        dg.cancel.addEventListener("click", onCancel);
        dg.dialog.addEventListener("cancel", onEscape);
        dg.dialog.addEventListener("click", onBackdrop);
        dg.dialog.showModal();
        if (input) {
            dg.input.focus();
            dg.input.select();
        } else {
            dg.ok.focus();
        }
    });
}
