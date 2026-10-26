// PDF.js 준비, 파일 읽기, 페이지 그리기와 창 크기 대응을 담당한다.
// 다른 기능은 renderPage(score)에 표시할 악보 객체를 전달한다.
const sheet = document.querySelector(".sheet");
const canvas = document.querySelector("#sheet-canvas");
const emptyState = document.querySelector(".empty-state");
const pageCount = document.querySelector("#page-count");
const status = document.querySelector("#viewer-status");

const pdfLibraryPath = new URL("./vendor/pdfjs/", import.meta.url);
let pdfjsLib;
let displayedScore = null;
let renderNumber = 0;
let renderTask = null;
let resizeTimer;

export function showStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("is-error", isError);
}

export async function prepareViewer() {
    try {
        pdfjsLib = await import(new URL("pdf.min.mjs", pdfLibraryPath).href);
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdf.worker.min.mjs", pdfLibraryPath).href;
        showStatus("PDF를 추가하면 한 페이지씩 볼 수 있어요. 방향키로도 넘길 수 있어요.");
        return true;
    } catch (error) {
        console.error(error);
        showStatus("PDF 뷰어를 불러오지 못했어요. Live Server로 페이지를 열고 새로고침해 주세요.", true);
        return false;
    }
}

// 로컬 파일을 읽기만 하며, PDF 파일을 서버로 전송하지 않는다.
export async function loadPdfFile(file) {
    const data = new Uint8Array(await file.arrayBuffer());
    const loadingTask = pdfjsLib.getDocument({
        data,
        cMapUrl: new URL("cmaps/", pdfLibraryPath).href,
        cMapPacked: true,
        standardFontDataUrl: new URL("standard_fonts/", pdfLibraryPath).href,
        wasmUrl: new URL("wasm/", pdfLibraryPath).href,
        isEvalSupported: false
    });

    try {
        return await loadingTask.promise;
    } catch (error) {
        await loadingTask.destroy();
        throw error;
    }
}

export async function renderPage(score) {
    if (!score) return;
    displayedScore = score;

    // 이전 그리기 작업이 늦게 끝나도 새 페이지를 덮어쓰지 않게 한다.
    const currentRender = ++renderNumber;
    if (renderTask) {
        renderTask.cancel();
        renderTask = null;
    }

    const pageNumber = score.pageNumber;
    sheet.setAttribute("aria-busy", "true");
    canvas.hidden = true;
    emptyState.hidden = true;
    pageCount.textContent = pageNumber + " / " + score.pdf.numPages;
    showStatus("악보를 불러오고 있어요.");

    try {
        const page = await score.pdf.getPage(pageNumber);
        if (currentRender !== renderNumber) return;

        const originalSize = page.getViewport({ scale: 1 });
        const style = getComputedStyle(sheet);
        const availableWidth = sheet.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        const availableHeight = sheet.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
        if (availableWidth < 1 || availableHeight < 1) return;

        const scale = Math.min(
            availableWidth / originalSize.width,
            availableHeight / originalSize.height
        );
        const viewport = page.getViewport({ scale });
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

        const buffer = document.createElement("canvas");
        buffer.width = Math.ceil(viewport.width * pixelRatio);
        buffer.height = Math.ceil(viewport.height * pixelRatio);
        renderTask = page.render({
            canvasContext: buffer.getContext("2d"),
            viewport,
            transform: [pixelRatio, 0, 0, pixelRatio, 0, 0]
        });
        await renderTask.promise;
        if (currentRender !== renderNumber) return;

        canvas.width = buffer.width;
        canvas.height = buffer.height;
        canvas.style.width = Math.floor(viewport.width) + "px";
        canvas.style.height = Math.floor(viewport.height) + "px";
        canvas.getContext("2d").drawImage(buffer, 0, 0);
        canvas.setAttribute("aria-label", score.name + ", " + pageNumber + " / " + score.pdf.numPages + " 페이지");
        canvas.hidden = false;
        showStatus("화면 크기에 맞춰 표시해요. ← → 방향키로 페이지를 넘길 수 있어요.");
    } catch (error) {
        if (currentRender !== renderNumber || error.name === "RenderingCancelledException") return;
        console.error(error);
        emptyState.hidden = false;
        showStatus("이 페이지를 표시하지 못했어요. 다른 페이지나 PDF를 선택해 주세요.", true);
    } finally {
        if (currentRender === renderNumber) {
            renderTask = null;
            sheet.setAttribute("aria-busy", "false");
        }
    }
}

function scheduleResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
        if (displayedScore) renderPage(displayedScore);
    }, 100);
}

export function observeViewerResize() {
    new ResizeObserver(scheduleResize).observe(sheet);
    window.addEventListener("resize", scheduleResize);
}
