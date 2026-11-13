// 파일 선택, 중복 확인, 악보 목록과 목록 버튼을 담당한다.
import { loadPdfFile, showStatus } from "./pdf_viewer.js";
import { createPracticeSettings } from "./practice_settings.js";
import { openScoreStorage, saveScore, savedScore, hasLegacyScores, importLegacyScores } from "./score_storage.js";

const uploadButton = document.querySelector(".btn-upload");
const sheetFile = document.querySelector("#Sheet-file");
const sheetList = document.querySelector(".button-group");
const libraryEmpty = document.querySelector(".library-empty");
const scores = [];

async function addScore(file, onSelectScore, saved = null) {
    const legacyId = JSON.stringify([file.name, file.size, file.lastModified]);
    let id = saved?.id;
    if (!id) {
        // 이름이나 수정 시각이 바뀌어도 같은 PDF이면 다른 기기의 설정을 찾는다.
        const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
        id = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
    }
    saved = saved || savedScore(id) || savedScore(legacyId);
    if (saved) id = saved.id;
    const existing = scores.find(score => score.id === id);
    if (existing) return existing;
    const pdf = await loadPdfFile(file);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = file.name;
    const practice = saved?.practice;
    const valid = practice && Number.isFinite(practice.bpm) && practice.bpm >= 1
        && Number.isInteger(practice.beatsPerBar) && practice.beatsPerBar >= 1
        && Array.isArray(practice.steps) && practice.steps.every(step =>
            Number.isInteger(step.pageNumber) && step.pageNumber >= 1 && step.pageNumber <= pdf.numPages
            && Number.isInteger(step.bars) && step.bars >= 1);
    const pageNumber = saved?.pageNumber;
    const score = {
        id,
        file, name: file.name, size: file.size, lastModified: file.lastModified, pdf, button,
        pageNumber: Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= pdf.numPages ? pageNumber : 1,
        practice: valid ? practice : createPracticeSettings(pdf.numPages)
    };
    button.addEventListener("click", () => onSelectScore(score));
    sheetList.querySelector('[data-missing-id="' + CSS.escape(id) + '"]')?.remove();
    scores.push(score);
    sheetList.appendChild(button);
    libraryEmpty.hidden = true;
    return score;
}

export async function restoreScoreLibrary(onSelectScore) {
    const records = await openScoreStorage();
    for (const record of records) {
        if (!record.file) {
            const button = document.createElement("button");
            button.type = "button";
            button.dataset.missingId = record.id;
            button.textContent = record.fileName + " · 이 기기에서 PDF 선택 필요";
            button.addEventListener("click", () => sheetFile.click());
            sheetList.appendChild(button);
            libraryEmpty.hidden = true;
            continue;
        }
        try {
            await addScore(record.file, onSelectScore, record);
        } catch (error) {
            console.error("저장된 악보 복구 오류:", error);
            document.querySelector("#storage-status").textContent = "일부 저장된 악보를 불러오지 못했어요.";
        }
    }
    if (scores.length) await onSelectScore(scores[0]);
    try {
        if (await hasLegacyScores()) {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = "기존 브라우저 악보 가져오기";
            button.addEventListener("click", async () => {
                button.disabled = true;
                try { await importLegacyScores(); location.reload(); }
                catch (error) {
                    document.querySelector("#storage-status").textContent = "기존 악보를 가져오지 못했어요. 연결 상태를 확인해 주세요.";
                    button.disabled = false;
                }
            });
            document.querySelector(".upload-box").appendChild(button);
        }
    } catch { /* 가져오기 실패가 새 악보 업로드를 막지 않도록 한다. */ }
}

export function updateLibraryButtons(disabled, activeScore) {
    uploadButton.disabled = disabled;
    for (const score of scores) {
        score.button.disabled = disabled;
        score.button.setAttribute("aria-pressed", String(score === activeScore));
    }
}

// 메인이 전달한 함수를 통해 악보 선택과 읽기 상태 변경을 알린다.
export function initializeScoreLibrary(onSelectScore, onLoadingChange, onBeforeFileSelect = function () {}) {
    uploadButton.addEventListener("click", function () {
        onBeforeFileSelect();
        sheetFile.click();
    });

    sheetFile.addEventListener("change", async function () {
        const file = sheetFile.files[0];
        if (!file || uploadButton.disabled) return;

        if (!/\.pdf$/i.test(file.name)) {
            showStatus("PDF 파일을 선택해 주세요.", true);
            sheetFile.value = "";
            return;
        }

        const existingScore = scores.find(function (score) {
            return score.name === file.name && score.size === file.size && score.lastModified === file.lastModified;
        });
        if (existingScore) {
            await onSelectScore(existingScore);
            sheetFile.value = "";
            return;
        }

        onLoadingChange(true);
        showStatus("PDF 파일을 읽고 있어요.");

        try {
            const score = await addScore(file, onSelectScore);
            saveScore(score);
            await onSelectScore(score);
        } catch (error) {
            console.error(error);
            const message = error.name === "PasswordException"
                ? "암호가 설정된 PDF예요. 암호를 해제한 파일을 선택해 주세요."
                : "PDF를 읽지 못했어요. 정상적인 PDF 파일인지 확인해 주세요.";
            showStatus(message, true);
        } finally {
            onLoadingChange(false);
            sheetFile.value = "";
        }
    });
}
