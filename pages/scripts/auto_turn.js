// 연주 순서의 시간 계산과 시작·정지를 담당한다. 화면 변경은 메인에 맡긴다.
let changeDisplayedPage;
let notifyPlaybackChange;
let notifyStepReady = function () {};
let playback = null;
let pageTimer = null;
let progressTimer = null;
let runNumber = 0;

export function getStepDurationMs(practice, step) {
    if (!Number.isFinite(practice.bpm) || practice.bpm < 1) {
        throw new Error("BPM은 1 이상의 숫자로 입력해 주세요.");
    }
    if (!Number.isInteger(practice.beatsPerBar) || practice.beatsPerBar < 1) {
        throw new Error("마디당 박 수는 1 이상의 정수로 입력해 주세요.");
    }
    if (!Number.isInteger(step.bars) || step.bars < 1) {
        throw new Error("각 단계의 마디 수는 1 이상의 정수로 입력해 주세요.");
    }

    const duration = (60 / practice.bpm) * practice.beatsPerBar * step.bars * 1000;
    // setTimeout이 표현할 수 없는 값이 즉시 실행되는 것을 방지한다.
    if (!Number.isFinite(duration) || duration < 1 || duration > 2147483647) {
        throw new Error("단계의 연주 시간이 너무 짧거나 길어요. 설정값을 조정해 주세요.");
    }
    return duration;
}

export function initializeAutoTurn(onPageChange, onPlaybackChange, onStepReady = function () {}) {
    changeDisplayedPage = onPageChange;
    notifyPlaybackChange = onPlaybackChange;
    notifyStepReady = onStepReady;
}

export function isAutoTurning() {
    return playback !== null;
}

function reportProgress() {
    if (!playback) return;
    notifyPlaybackChange({
        running: true,
        stepIndex: playback.stepIndex,
        totalSteps: playback.steps.length,
        pageNumber: playback.steps[playback.stepIndex].pageNumber,
        remainingMs: playback.deadline === null ? null : Math.max(0, playback.deadline - performance.now())
    });
}

export function stopAutoTurn(message = "자동 넘기기를 정지했어요.", isError = false) {
    const wasRunning = playback !== null;
    runNumber++;
    clearTimeout(pageTimer);
    clearInterval(progressTimer);
    pageTimer = null;
    progressTimer = null;
    playback = null;

    if (wasRunning) {
        notifyPlaybackChange({ running: false, message, isError });
    }
}

// 첫 단계부터 시작한다. 실행 중 사용할 순서와 시간을 미리 확인해 둔다.
export async function startAutoTurn(score) {
    if (playback) return;

    try {
        if (!score || !score.practice.steps.length) {
            throw new Error("악보와 연주 단계를 먼저 준비해 주세요.");
        }
        const steps = score.practice.steps.map(function (step) {
            if (!Number.isInteger(step.pageNumber) || step.pageNumber < 1 || step.pageNumber > score.pdf.numPages) {
                throw new Error("연주 순서의 페이지 번호를 확인해 주세요.");
            }
            return {
                pageNumber: step.pageNumber,
                duration: getStepDurationMs(score.practice, step)
            };
        });

        playback = { score, steps, stepIndex: 0, deadline: null };
        const currentRun = ++runNumber;
        reportProgress();
        progressTimer = setInterval(reportProgress, 200);
        await playCurrentStep(currentRun);
    } catch (error) {
        if (playback) {
            stopAutoTurn("자동 넘기기를 시작하지 못했어요. " + error.message, true);
        } else {
            notifyPlaybackChange({ running: false, message: error.message, isError: true });
        }
    }
}

async function playCurrentStep(currentRun) {
    if (!playback || currentRun !== runNumber) return;
    playback.deadline = null;
    reportProgress();

    try {
        const step = playback.steps[playback.stepIndex];
        const displayed = await changeDisplayedPage(playback.score, step.pageNumber);
        if (!playback || currentRun !== runNumber) return;
        if (!displayed) {
            stopAutoTurn("페이지를 표시하지 못해 자동 넘기기를 정지했어요.", true);
            return;
        }

        // 페이지가 그려진 다음부터 해당 단계의 연주 시간을 센다.
        playback.deadline = performance.now() + step.duration;
        notifyStepReady(playback.score.practice, step.duration);
        reportProgress();
        pageTimer = setTimeout(function () {
            if (!playback || currentRun !== runNumber) return;
            if (playback.stepIndex === playback.steps.length - 1) {
                stopAutoTurn("마지막 단계의 연주 시간이 끝났어요.");
                return;
            }
            playback.stepIndex++;
            playCurrentStep(currentRun);
        }, step.duration);
    } catch (error) {
        if (!playback || currentRun !== runNumber) return;
        console.error(error);
        stopAutoTurn("페이지를 표시하지 못해 자동 넘기기를 정지했어요.", true);
    }
}
