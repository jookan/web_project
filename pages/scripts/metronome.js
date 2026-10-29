// 자동 넘기기의 각 단계가 시작될 때 박자를 들려준다.
let audioContext;
let timer;
let sounds = new Set();
let run = 0;

// 브라우저의 소리 재생 제한 때문에 버튼 클릭 안에서 호출한다.
export function prepareMetronome() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error("이 브라우저는 메트로놈 소리를 지원하지 않아요.");
    if (!audioContext) audioContext = new Audio();
    return audioContext.resume();
}

export function stopMetronome() {
    run++;
    clearTimeout(timer);
    for (const sound of sounds) {
        try { sound.stop(); } catch (_) { /* 이미 끝난 소리 */ }
    }
    sounds.clear();
}

export function startMetronome(practice, durationMs) {
    stopMetronome();
    if (!practice.metronome || !audioContext) return;
    const currentRun = run;
    const interval = 60 / practice.bpm;
    const start = audioContext.currentTime;
    const beatCount = Math.round(durationMs / 1000 / interval);
    let beat = 0;

    function schedule() {
        if (run !== currentRun) return;
        // 짧은 구간을 미리 예약해 타이머 오차로 인한 박자 흔들림을 줄인다.
        while (beat < beatCount && start + beat * interval < audioContext.currentTime + 0.12) {
            const when = Math.max(audioContext.currentTime, start + beat * interval);
            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();
            oscillator.frequency.value = beat % practice.beatsPerBar === 0 ? 1000 : 700;
            gain.gain.setValueAtTime(0.12, when);
            gain.gain.exponentialRampToValueAtTime(0.001, when + 0.045);
            oscillator.connect(gain).connect(audioContext.destination);
            sounds.add(oscillator);
            oscillator.onended = () => { sounds.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
            oscillator.start(when);
            oscillator.stop(when + 0.05);
            beat++;
        }
        if (beat < beatCount) timer = setTimeout(schedule, 25);
    }
    schedule();
}
