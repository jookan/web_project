// 이 파일은 페이지의 시작점이다. 기능 구현은 아래 파일에서 가져온다.
import { prepareViewer, renderPage, observeViewerResize } from "./pdf_viewer.js";
import { initializeScoreLibrary, updateLibraryButtons } from "./score_library.js";
import {
    initializePracticeSettings,
    showPracticeSettings,
    setPracticeDisabled
} from "./practice_settings.js";

const scoreTitle = document.querySelector("#score-title");
const previousButton = document.querySelector("#previous-page");
const nextButton = document.querySelector("#next-page");

let activeScore = null;
let loading = false;
let viewerReady = false;

function updateButtons() {
    updateLibraryButtons(!viewerReady || loading, activeScore);
    previousButton.disabled = loading || !activeScore || activeScore.pageNumber <= 1;
    nextButton.disabled = loading || !activeScore || activeScore.pageNumber >= activeScore.pdf.numPages;
    setPracticeDisabled(!activeScore || loading);
}

function setLoading(isLoading) {
    loading = isLoading;
    updateButtons();
}

// 악보 선택 → 제목과 설정 표시 → PDF 페이지 그리기.
function selectScore(score) {
    activeScore = score;
    scoreTitle.textContent = score.name;
    scoreTitle.title = score.name;
    showPracticeSettings(score);
    updateButtons();
    return renderPage(score);
}

function changePage(direction) {
    if (!activeScore || loading) return;

    const nextPage = activeScore.pageNumber + direction;
    if (nextPage < 1 || nextPage > activeScore.pdf.numPages) return;

    activeScore.pageNumber = nextPage;
    updateButtons();
    renderPage(activeScore);
}

previousButton.addEventListener("click", function () {
    changePage(-1);
});

nextButton.addEventListener("click", function () {
    changePage(1);
});

document.addEventListener("keydown", function (event) {
    if (!activeScore || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.target.closest("input, textarea, select, [contenteditable]")) return;

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        changePage(event.key === "ArrowLeft" ? -1 : 1);
    }
});

async function initializePage() {
    initializePracticeSettings();
    initializeScoreLibrary(selectScore, setLoading);
    observeViewerResize();
    updateButtons();

    viewerReady = await prepareViewer();
    updateButtons();
}

initializePage();
