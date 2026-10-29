// 악보별 연습 설정, 연주 순서 편집과 입력값 검사를 담당한다.
import { getStepDurationMs } from "./auto_turn.js";

const metronomeInput = document.querySelector("#metronome-enabled");
const bpmInput = document.querySelector("#bpm-input");
const beatsInput = document.querySelector("#beats-input");
const practiceControls = document.querySelector("#practice-controls");
const practiceSteps = document.querySelector("#practice-steps");
const stepsPanel = document.querySelector("#practice-steps-panel");
const addStepButton = document.querySelector("#add-practice-step");
const summary = document.querySelector("#practice-summary");

let selectedScore = null;
let notifyPracticeChange = function () {};

export function createPracticeSettings(pageCount) {
    const practice = { bpm: 120, beatsPerBar: 4, steps: [] };
    for (let page = 1; page <= pageCount; page++) {
        practice.steps.push({ pageNumber: page, bars: 16 });
    }
    return practice;
}

export function setPracticeDisabled(disabled) {
    practiceControls.disabled = disabled;
    metronomeInput.disabled = disabled;
}

export function showPracticeSettings(score) {
    selectedScore = score;
    metronomeInput.checked = Boolean(score.practice.metronome);
    bpmInput.value = score.practice.bpm;
    beatsInput.value = score.practice.beatsPerBar;
    renderPracticeSteps(score);
}

function updatePracticeSummary() {
    if (!selectedScore) return;
    const practice = selectedScore.practice;
    summary.classList.remove("is-error");

    try {
        let duration = 0;
        for (const step of practice.steps) {
            duration += getStepDurationMs(practice, step);
        }
        const seconds = Math.ceil(duration / 1000);
        summary.textContent = practice.steps.length + "단계 · 예상 "
            + Math.floor(seconds / 60) + "분 " + (seconds % 60) + "초";
    } catch (error) {
        summary.textContent = error.message;
        summary.classList.add("is-error");
    }
}

export function renderPracticeSteps(score) {
    practiceSteps.textContent = "";
    if (!score) return;

    if (!score.practice.steps.length) {
        const empty = document.createElement("p");
        empty.className = "hint";
        empty.textContent = "현재 페이지를 추가해 연주 순서를 만들어 주세요.";
        practiceSteps.appendChild(empty);
    }

    score.practice.steps.forEach(function (step, index) {
        const row = document.createElement("div");
        row.className = "practice-step";
        const order = document.createElement("span");
        order.className = "step-order";
        order.textContent = index + 1;

        const pageInput = document.createElement("input");
        pageInput.type = "number";
        pageInput.min = "1";
        pageInput.max = score.pdf.numPages;
        pageInput.step = "1";
        pageInput.className = "short-input step-page-input";
        pageInput.value = step.pageNumber;
        pageInput.setAttribute("aria-label", (index + 1) + "번째 단계 페이지");
        pageInput.addEventListener("change", function () {
            if (practiceControls.disabled || selectedScore !== score) return;
            const page = Number(pageInput.value);
            if (!Number.isInteger(page) || page < 1 || page > score.pdf.numPages) {
                pageInput.value = step.pageNumber;
                return;
            }
            step.pageNumber = page;
            updatePracticeSummary();
            notifyPracticeChange();
        });

        const barsInput = document.createElement("input");
        barsInput.type = "number";
        barsInput.min = "1";
        barsInput.step = "1";
        barsInput.className = "short-input step-bars-input";
        barsInput.value = step.bars;
        barsInput.setAttribute("aria-label", (index + 1) + "번째 단계 마디 수");
        barsInput.addEventListener("change", function () {
            if (practiceControls.disabled || selectedScore !== score) return;
            const bars = Number(barsInput.value);
            if (!Number.isInteger(bars) || bars < 1) {
                barsInput.value = step.bars;
                return;
            }
            step.bars = bars;
            updatePracticeSummary();
            notifyPracticeChange();
        });

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "remove-step";
        removeButton.textContent = "×";
        removeButton.setAttribute("aria-label", (index + 1) + "번째 단계 삭제");
        removeButton.addEventListener("click", function () {
            if (practiceControls.disabled || selectedScore !== score) return;
            score.practice.steps.splice(index, 1);
            renderPracticeSteps(score);
            notifyPracticeChange();
        });

        row.append(order, pageInput, barsInput, removeButton);
        practiceSteps.appendChild(row);
    });
    updatePracticeSummary();
}

export function highlightPracticeStep(stepIndex) {
    const rows = practiceSteps.querySelectorAll(".practice-step");
    rows.forEach(function (row, index) {
        const wasActive = row.classList.contains("is-active");
        const active = index === stepIndex;
        row.classList.toggle("is-active", active);
        if (active) {
            row.setAttribute("aria-current", "step");
            // 단계 목록만 스크롤하고, 시작·정지 버튼의 위치는 유지한다.
            if (!wasActive) {
                const box = stepsPanel.getBoundingClientRect();
                const item = row.getBoundingClientRect();
                if (item.top < box.top + 26) stepsPanel.scrollTop -= box.top + 26 - item.top;
                if (item.bottom > box.bottom) stepsPanel.scrollTop += item.bottom - box.bottom;
            }
        } else {
            row.removeAttribute("aria-current");
        }
    });
}

export function initializePracticeSettings(onChange = function () {}) {
    notifyPracticeChange = onChange;

    metronomeInput.addEventListener("change", function () {
        if (!selectedScore || metronomeInput.disabled) return;
        selectedScore.practice.metronome = metronomeInput.checked;
        notifyPracticeChange();
    });

    bpmInput.addEventListener("change", function () {
        if (!selectedScore || practiceControls.disabled) return;
        const bpm = Number(bpmInput.value);
        if (!Number.isFinite(bpm) || bpm < 1) {
            bpmInput.value = selectedScore.practice.bpm;
            return;
        }
        selectedScore.practice.bpm = bpm;
        updatePracticeSummary();
        notifyPracticeChange();
    });

    beatsInput.addEventListener("change", function () {
        if (!selectedScore || practiceControls.disabled) return;
        const beats = Number(beatsInput.value);
        if (!Number.isInteger(beats) || beats < 1) {
            beatsInput.value = selectedScore.practice.beatsPerBar;
            return;
        }
        selectedScore.practice.beatsPerBar = beats;
        updatePracticeSummary();
        notifyPracticeChange();
    });

    addStepButton.addEventListener("click", function () {
        if (!selectedScore || practiceControls.disabled) return;
        selectedScore.practice.steps.push({
            pageNumber: selectedScore.pageNumber,
            bars: 16
        });
        renderPracticeSteps(selectedScore);
        stepsPanel.scrollTop = stepsPanel.scrollHeight;
        notifyPracticeChange();
    });
}
