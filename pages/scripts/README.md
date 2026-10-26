# 악보 페이지 JavaScript 구성

HTML은 `sheet_functions.js` 하나를 `type="module"`로 불러온다.
나머지 파일은 이 파일의 `import`를 따라 연결된다.

| 파일 | 역할 |
| --- | --- |
| `sheet_functions.js` | 시작점. 현재 악보 선택, 이전·다음 이동, 기능 연결 |
| `score_library.js` | 파일 선택, 중복 확인, 악보 객체 생성, 목록 버튼 |
| `pdf_viewer.js` | PDF.js 준비, PDF 읽기, 페이지 그리기, 화면 크기 대응 |
| `practice_settings.js` | BPM·박 수 저장과 검사, 기본 연주 순서, 설정 표시 |
| `vendor/pdfjs/` | 외부 PDF.js 라이브러리. 직접 수정하는 학습 코드가 아님 |

## 악보를 선택했을 때

1. `score_library.js`가 메인에서 전달받은 `selectScore(score)`를 호출한다.
2. 메인은 선택한 악보를 `activeScore`에 저장한다.
3. `showPracticeSettings(score)`가 입력값과 연주 순서를 표시한다.
4. `renderPage(score)`가 해당 악보의 현재 페이지를 그린다.

각 기능은 같은 `score` 객체를 전달받는다. 설정을 다른 객체로 복사하지
않으므로, BPM을 바꾸고 다른 악보를 선택했다 돌아와도 변경값이 유지된다.
현재 악보와 설정은 탭 안에만 보관하며, 새로고침하면 초기화된다.

공부할 때는 메인의 `selectScore()`부터 시작해 호출하는 함수로 따라가면 된다.
연주 순서 편집과 자동 넘기기는 이후 추가할 기능이다.
