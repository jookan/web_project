// 악보별 연습 설정의 기본값, 입력값 저장, 연주 순서 표시를 담당한다.
const bpmInput = document.querySelector("#bpm-input");
const beatsInput = document.querySelector("#beats-input");
const practiceControls = document.querySelector("#practice-controls");
const practiceSteps = document.querySelector("#practice-steps");

// 메인에서 전달받은 같은 악보 객체를 참조한다. 설정을 별도로 복사하지 않는다.
let selectedScore = null;

export function createPracticeSettings(pageCount) {
    const practice = {
        bpm: 120,
        beatsPerBar: 4,
        steps: []
    };

    for (let page = 1; page <= pageCount; page++) {
        practice.steps.push({
            pageNumber: page,
            bars: 16
        });
    }
    return practice;
}

export function setPracticeDisabled(disabled) {
    practiceControls.disabled = disabled;
}

export function showPracticeSettings(score) {
    selectedScore = score;
    bpmInput.value = score.practice.bpm;
    beatsInput.value = score.practice.beatsPerBar;
    renderPracticeSteps(score);
}

export function renderPracticeSteps(score) {
    practiceSteps.textContent = "";
    if (!score) return;

    score.practice.steps.forEach(function (step, index) {
        const row = document.createElement("label");
        row.textContent = (index + 1) + ". " + step.pageNumber + "p";
        const barsInput = document.createElement("input");
        barsInput.type = "number";
        barsInput.min = "1";
        barsInput.step = "1";
        barsInput.className = "short-input";
        barsInput.value = step.bars;
        row.appendChild(barsInput)
        practiceSteps.appendChild(row);
    });
}

// 페이지를 처음 열 때 한 번만 호출해 입력 이벤트를 연결한다.
export function initializePracticeSettings() {
    bpmInput.addEventListener("change", function () {
        if (!selectedScore) return;

        const bpm = Number(bpmInput.value);
        if (!Number.isFinite(bpm) || bpm < 1) {
            bpmInput.value = selectedScore.practice.bpm;
            return;
        }
        selectedScore.practice.bpm = bpm;
    });

    beatsInput.addEventListener("change", function () {
        if (!selectedScore) return;

        const beats = Number(beatsInput.value);
        if (!Number.isInteger(beats) || beats < 1) {
            beatsInput.value = selectedScore.practice.beatsPerBar;
            return;
        }
        selectedScore.practice.beatsPerBar = beats;
    });
}
