import test from "node:test";
import assert from "node:assert/strict";
import {
    getStepDurationMs, initializeAutoTurn, startAutoTurn,
    stopAutoTurn, isAutoTurning
} from "../pages/scripts/auto_turn.js";

function makeScore() {
    return {
        pdf: { numPages: 2 },
        practice: {
            bpm: 120,
            beatsPerBar: 4,
            steps: [
                { pageNumber: 1, bars: 1 },
                { pageNumber: 2, bars: 2 },
                { pageNumber: 1, bars: 1 }
            ]
        }
    };
}

// 실제로 수십 초 기다리지 않고, 타이머가 실행되는 시점과 취소를 검증한다.
function fakeClock(t) {
    let now = 0;
    let nextId = 0;
    const timers = new Map();
    t.mock.method(performance, "now", () => now);
    t.mock.method(globalThis, "setTimeout", (callback, delay) => {
        const id = ++nextId;
        timers.set(id, { callback, at: now + delay });
        return id;
    });
    t.mock.method(globalThis, "setInterval", (callback, delay) => {
        const id = ++nextId;
        timers.set(id, { callback, at: now + delay, interval: delay });
        return id;
    });
    t.mock.method(globalThis, "clearTimeout", id => timers.delete(id));
    t.mock.method(globalThis, "clearInterval", id => timers.delete(id));
    t.after(() => {
        stopAutoTurn();
        t.mock.restoreAll();
    });

    return {
        timers,
        async advance(milliseconds) {
            const end = now + milliseconds;
            while (true) {
                const due = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
                if (!due || due[1].at > end) break;
                const [id, timer] = due;
                now = timer.at;
                if (timer.interval) timer.at += timer.interval;
                else timers.delete(id);
                timer.callback();
                // 페이지 표시 Promise가 처리되도록 기다린다.
                await Promise.resolve();
                await Promise.resolve();
                await Promise.resolve();
            }
            now = end;
        }
    };
}

test("BPM, beats and bars determine each step duration", () => {
    assert.equal(getStepDurationMs({ bpm: 120, beatsPerBar: 4 }, { bars: 16 }), 32000);
    assert.equal(getStepDurationMs({ bpm: 120, beatsPerBar: 3 }, { bars: 8 }), 12000);
    assert.throws(() => getStepDurationMs({ bpm: 0, beatsPerBar: 4 }, { bars: 16 }));
    assert.throws(() => getStepDurationMs({ bpm: 120, beatsPerBar: 2.5 }, { bars: 16 }));
    assert.throws(() => getStepDurationMs({ bpm: 120, beatsPerBar: 4 }, { bars: 0 }));
    assert.throws(() => getStepDurationMs({ bpm: 1, beatsPerBar: 4 }, { bars: 1e10 }));
});

test("repeat route 1-2-1 waits for every step including the final one", async t => {
    const clock = fakeClock(t);
    const pages = [];
    const states = [];
    initializeAutoTurn(async (_score, page) => { pages.push(page); return true; }, state => states.push(state));
    await startAutoTurn(makeScore());
    await startAutoTurn(makeScore());
    assert.deepEqual(pages, [1]);
    await clock.advance(1999);
    assert.deepEqual(pages, [1]);
    await clock.advance(1);
    assert.deepEqual(pages, [1, 2]);
    await clock.advance(3999);
    assert.deepEqual(pages, [1, 2]);
    await clock.advance(1);
    assert.deepEqual(pages, [1, 2, 1]);
    await clock.advance(1999);
    assert.equal(isAutoTurning(), true);
    await clock.advance(1);
    assert.equal(isAutoTurning(), false);
    assert.equal(clock.timers.size, 0);
    assert.match(states.at(-1).message, /마지막/);
});

test("stop clears old timers and restart starts from the first step", async t => {
    const clock = fakeClock(t);
    const pages = [];
    initializeAutoTurn(async (_score, page) => { pages.push(page); return true; }, () => {});
    const score = makeScore();
    await startAutoTurn(score);
    await clock.advance(1000);
    stopAutoTurn();
    await clock.advance(10000);
    assert.deepEqual(pages, [1]);
    assert.equal(clock.timers.size, 0);
    await startAutoTurn(score);
    assert.deepEqual(pages, [1, 1]);
    await clock.advance(1999);
    assert.deepEqual(pages, [1, 1]);
    await clock.advance(1);
    assert.deepEqual(pages, [1, 1, 2]);
});

test("stopping while a page is rendering prevents a later timer", async t => {
    const clock = fakeClock(t);
    let finishRendering;
    initializeAutoTurn(() => new Promise(resolve => { finishRendering = resolve; }), () => {});
    const starting = startAutoTurn(makeScore());
    assert.equal(isAutoTurning(), true);
    stopAutoTurn();
    finishRendering(true);
    await starting;
    await clock.advance(10000);
    assert.equal(isAutoTurning(), false);
    assert.equal(clock.timers.size, 0);
});

test("a page display failure stops playback", async t => {
    const clock = fakeClock(t);
    const states = [];
    initializeAutoTurn(async (_score, page) => page !== 2, state => states.push(state));
    await startAutoTurn(makeScore());
    await clock.advance(2000);
    assert.equal(isAutoTurning(), false);
    assert.equal(states.at(-1).isError, true);
    assert.equal(clock.timers.size, 0);
});

test("metronome is notified only after each page is displayed", async t => {
    const clock = fakeClock(t);
    const starts = [];
    let finishFirstPage;
    let calls = 0;
    initializeAutoTurn(() => {
        calls++;
        return calls === 1 ? new Promise(resolve => { finishFirstPage = resolve; }) : Promise.resolve(true);
    }, () => {}, (practice, duration) => starts.push([practice.bpm, duration]));
    const starting = startAutoTurn(makeScore());
    assert.deepEqual(starts, []);
    finishFirstPage(true);
    await starting;
    assert.deepEqual(starts, [[120, 2000]]);
    await clock.advance(2000);
    assert.deepEqual(starts, [[120, 2000], [120, 4000]]);
});

test("empty or out-of-range routes never start a timer", async t => {
    const clock = fakeClock(t);
    const states = [];
    initializeAutoTurn(async () => { throw new Error("must not render"); }, state => states.push(state));
    const score = makeScore();
    score.practice.steps = [];
    await startAutoTurn(score);
    assert.equal(states.at(-1).isError, true);
    score.practice.steps = [{ pageNumber: 3, bars: 1 }];
    await startAutoTurn(score);
    assert.equal(states.at(-1).isError, true);
    assert.equal(isAutoTurning(), false);
    assert.equal(clock.timers.size, 0);
});
