// 파일 선택, 중복 확인, 악보 목록과 목록 버튼을 담당한다.
import { loadPdfFile, showStatus } from "./pdf_viewer.js";
import { createPracticeSettings } from "./practice_settings.js";

const uploadButton = document.querySelector(".btn-upload");
const sheetFile = document.querySelector("#Sheet-file");
const sheetList = document.querySelector(".button-group");
const libraryEmpty = document.querySelector(".library-empty");
const scores = [];

export function updateLibraryButtons(disabled, activeScore) {
    uploadButton.disabled = disabled;
    for (const score of scores) {
        score.button.disabled = disabled;
        score.button.setAttribute("aria-pressed", String(score === activeScore));
    }
}

// 메인이 전달한 함수를 통해 악보 선택과 읽기 상태 변경을 알린다.
export function initializeScoreLibrary(onSelectScore, onLoadingChange) {
    uploadButton.addEventListener("click", function () {
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
            const pdf = await loadPdfFile(file);
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = file.name;

            const score = {
                name: file.name,
                size: file.size,
                lastModified: file.lastModified,
                pdf,
                pageNumber: 1,
                button,
                practice: createPracticeSettings(pdf.numPages)
            };
            button.addEventListener("click", function () {
                onSelectScore(score);
            });
            scores.push(score);
            sheetList.appendChild(button);
            libraryEmpty.hidden = true;
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
