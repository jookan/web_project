// 시작점: 악보 목록, PDF 표시, 연습 설정과 자동 넘기기를 연결한다.
import { prepareViewer, renderPage, observeViewerResize } from "./pdf_viewer.js";
import { initializeScoreLibrary, updateLibraryButtons, restoreScoreLibrary } from "./score_library.js";
import { saveScore } from "./score_storage.js";
import { prepareMetronome, startMetronome, stopMetronome } from "./metronome.js";
import {
    initializePracticeSettings, showPracticeSettings,
    setPracticeDisabled, highlightPracticeStep
} from "./practice_settings.js";
import {
    initializeAutoTurn, startAutoTurn, stopAutoTurn, isAutoTurning
} from "./auto_turn.js";

const scoreTitle = document.querySelector("#score-title");
const previousButton = document.querySelector("#previous-page");
const nextButton = document.querySelector("#next-page");
const startButton = document.querySelector("#start-auto-turn");
const stopButton = document.querySelector("#stop-auto-turn");
const playbackStatus = document.querySelector("#auto-turn-status");

let activeScore = null;
let loading = false;
let viewerReady = false;
let starting = false;
let startRequest = 0;

function updateButtons() {
    const running = isAutoTurning();
    updateLibraryButtons(!viewerReady || loading, activeScore);
    previousButton.disabled = loading || !activeScore || activeScore.pageNumber <= 1;
    nextButton.disabled = loading || !activeScore || activeScore.pageNumber >= activeScore.pdf.numPages;
    setPracticeDisabled(!activeScore || loading || running);
    startButton.disabled = !viewerReady || loading || starting || running || !activeScore || !activeScore.practice.steps.length;
    stopButton.disabled = !running;
}

function setLoading(isLoading) {
    if (isLoading) startRequest++;
    if (isLoading) stopAutoTurn("파일을 읽기 위해 자동 넘기기를 정지했어요.");
    loading = isLoading;
    updateButtons();
}

function selectScore(score) {
    startRequest++;
    stopAutoTurn("악보를 선택하여 자동 넘기기를 정지했어요.");
    activeScore = score;
    scoreTitle.textContent = score.name;
    scoreTitle.title = score.name;
    showPracticeSettings(score);
    playbackStatus.textContent = "처음부터 시작하면 연주 순서의 1단계부터 진행해요.";
    playbackStatus.classList.remove("is-error");
    playbackStatus.dataset.running = "false";
    playbackStatus.dataset.phase = "stopped";
    updateButtons();
    return renderPage(score);
}

function changePage(direction) {
    if (!activeScore || loading) return;
    startRequest++;
    stopAutoTurn("수동으로 페이지를 이동하여 자동 넘기기를 정지했어요.");
    const nextPage = activeScore.pageNumber + direction;
    if (nextPage < 1 || nextPage > activeScore.pdf.numPages) return;
    activeScore.pageNumber = nextPage;
    saveScore(activeScore);
    updateButtons();
    renderPage(activeScore);
}

// 자동 넘기기는 이 함수를 통해 같은 PDF 뷰어를 사용한다.
async function showAutoTurnPage(score, pageNumber) {
    if (score !== activeScore || loading) return false;
    score.pageNumber = pageNumber;
    saveScore(score);
    updateButtons();
    return await renderPage(score);
}

function showPlaybackState(state) {
    if (!state.running || state.remainingMs === null) stopMetronome();
    playbackStatus.dataset.running = String(state.running);
    playbackStatus.classList.toggle("is-error", Boolean(state.isError));
    highlightPracticeStep(state.running ? state.stepIndex : -1);

    if (state.running) {
        playbackStatus.dataset.stepIndex = state.stepIndex;
        playbackStatus.dataset.phase = state.remainingMs === null ? "rendering" : "playing";
        const remaining = state.remainingMs === null
            ? "페이지 준비 중"
            : (state.remainingMs / 1000).toFixed(1) + "초 남음";
        playbackStatus.textContent = (state.stepIndex + 1) + " / " + state.totalSteps
            + "단계 · " + state.pageNumber + "페이지 · " + remaining;
    } else {
        playbackStatus.dataset.phase = "stopped";
        delete playbackStatus.dataset.stepIndex;
        playbackStatus.textContent = state.message;
    }
    updateButtons();
}

previousButton.addEventListener("click", function () { changePage(-1); });
nextButton.addEventListener("click", function () { changePage(1); });
startButton.addEventListener("click", async function () {
    if (starting || !activeScore) return;
    const score = activeScore;
    const request = ++startRequest;
    starting = true;
    updateButtons();
    try {
        if (score.practice.metronome) {
            if (score.practice.bpm > 600) throw new Error("메트로놈은 BPM 600 이하에서 사용할 수 있어요.");
            await prepareMetronome();
        }
        if (request === startRequest && score === activeScore && !loading && !document.hidden) await startAutoTurn(score);
    } catch (error) {
        playbackStatus.textContent = "메트로놈을 시작하지 못했어요. " + error.message;
        playbackStatus.classList.add("is-error");
    } finally {
        starting = false;
        updateButtons();
    }
});
stopButton.addEventListener("click", function () { stopAutoTurn(); });

document.addEventListener("keydown", function (event) {
    if (!activeScore || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.target.closest("input, textarea, select, [contenteditable]")) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        changePage(event.key === "ArrowLeft" ? -1 : 1);
    }
});

document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
        startRequest++;
        stopAutoTurn("탭을 벗어나 자동 넘기기를 정지했어요.");
    }
});
window.addEventListener("pagehide", function () { stopAutoTurn(); });

async function initializePage() {
    initializeAutoTurn(showAutoTurnPage, showPlaybackState, startMetronome);
    initializePracticeSettings(function () { saveScore(activeScore); updateButtons(); });
    initializeScoreLibrary(selectScore, setLoading, function () {
        startRequest++;
        stopAutoTurn("파일을 선택하기 위해 자동 넘기기를 정지했어요.");
    });
    observeViewerResize();
    updateButtons();
    const prepared = await prepareViewer();
    if (prepared) await restoreScoreLibrary(selectScore);
    viewerReady = prepared;
    updateButtons();
}

initializePage();
