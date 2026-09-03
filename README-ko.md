# mdbe

브라우저 확장 프로그램에서 실행되는 로컬 우선 Markdown 워크벤치입니다.

> 현재 개발 버전은 0.2.0입니다. 0.1.0 압축 파일은 GitHub에 공개했으며 Chrome Web Store 등록은 아직 준비 중입니다.

## 주요 기능

- 선택한 폴더의 Markdown 파일을 왼쪽 워크트리에 표시
- [Milkdown Crepe](https://milkdown.dev/) 기반의 Typora 스타일 WYSIWYG 편집
- 워크트리에서 파일을 클릭해 열고 `Cmd/Ctrl+S`로 같은 로컬 파일에 저장
- `.md`, `.mdx`, `.mkd`, `.markdown` 개별 파일 열기와 저장
- 직접 저장을 지원하지 않는 환경에서는 파일 다운로드로 대체
- 같은 편집기 탭을 새로고침했을 때 미저장 초안 복구, 30일이 지난 초안은 자동 정리
- 확장 안에 포함된 Pretendard를 기본으로 사용하며 글꼴·크기·줄 간격 설정 저장
- 밝은 테마와 어두운 테마, 접거나 너비를 바꿀 수 있는 사이드바
- Aside가 현재 열린 로컬 문서를 안전하게 수정·저장할 수 있는 revision 확인 브리지
- 미저장 변경이 있을 때 재시작을 막는 안전한 업데이트 준비 알림
- 기존 Markdown URL 리더와 그 렌더링 플러그인 유지

파일 내용은 브라우저 안에서만 처리합니다. 업로드, 분석, 계정 서버를 추가하지 않았습니다.

## 로컬 실행

Node.js 18 이상과 pnpm 9 이상이 필요합니다.

```bash
pnpm install --frozen-lockfile
pnpm build
```

브라우저의 확장 프로그램 관리 화면에서 개발자 모드를 켜고 생성된 `extension/` 폴더를 압축 해제된 확장 프로그램으로 불러옵니다. 확장 아이콘에서 **Open mdbe editor**를 선택하면 됩니다.

배포용 압축 파일은 `dist/mdbe-<version>.zip`에 생성됩니다.

## 단축키

| 작업          | 단축키             |
| ------------- | ------------------ |
| 저장          | `Cmd/Ctrl+S`       |
| 다른 이름으로 | `Cmd/Ctrl+Shift+S` |
| 파일 열기     | `Cmd/Ctrl+O`       |
| 폴더 열기     | `Cmd/Ctrl+Shift+O` |
| 새 문서       | `Cmd/Ctrl+Alt+N`   |
| 워크트리 전환 | `Cmd/Ctrl+Alt+B`   |

## Aside 실시간 편집

mdbe 0.2는 편집기 페이지 안에 범위를 제한한 `window.mdbe` 브리지를 제공합니다. Aside는 현재 열린 Markdown과 revision을 읽고, 그 revision을 기준으로 내용을 교체하고, 복구 초안을 즉시 기록한 뒤 사용자가 이미 허용한 파일 핸들로 저장할 수 있습니다. 임의의 로컬 경로를 선택하거나 Chrome의 권한을 우회할 수는 없습니다. 자세한 내용은 [Aside 연동 문서](./docs/ASIDE_INTEGRATION.md)를 참고하세요.

## 업데이트

Chrome Web Store에서 설치한 빌드는 Chrome의 기본 업데이트 채널을 사용합니다. 새 버전이 준비되면 mdbe가 **Restart to update**를 보여 주지만 문서에 미저장 변경이 있으면 실행할 수 없습니다. 최초 스토어 등록을 마친 뒤에는 GitHub 태그 릴리스가 Web Store API v2 제출까지 수행할 수 있습니다. 자세한 내용은 [릴리스와 업데이트 흐름](./docs/RELEASING.md)을 참고하세요.

## 현재 제약

- 폴더 워크트리와 원본 파일 저장은 File System Access API를 사용하므로 Chromium 계열 브라우저에서 가장 안정적입니다. 그 외 환경에서는 개별 파일을 열고 편집본을 다운로드할 수 있습니다.
- 파일과 폴더 권한은 현재 탭에서만 유지됩니다. 새로고침이나 확장 업데이트 후 복구된 초안은 **Save…**에서 저장 위치를 다시 연결해야 하며 폴더도 다시 열어야 합니다.
- 자동 배포는 Unlisted Chrome Web Store 항목을 한 번 생성하고 그 스토어 버전을 설치한 뒤부터 동작합니다. 압축 해제 설치와 GitHub ZIP 설치는 계속 수동 업데이트가 필요합니다.
- WYSIWYG 편집기는 Markdown 문서 모델을 다시 직렬화합니다. 공백이나 원문 서식이 정리될 수 있고 지원하지 않는 확장 문법은 완전히 보존되지 않을 수 있습니다. MVP 기간에는 중요한 파일의 백업을 권장합니다.
- Markdown 내부의 raw HTML은 실행하지 않고 비활성 Markdown 내용으로 표시합니다.
- 브라우저 파일 핸들에는 일반 파일 경로가 없으므로 로컬 상대 경로 이미지는 아직 처리하지 않습니다.

## 원본과 라이선스

mdbe는 Bener가 만든 [md-reader/md-reader](https://github.com/md-reader/md-reader)의 공개 2.x 소스를 포크했습니다. 원본 저작권 표시를 유지하며 [MIT License](./LICENSE)로 배포합니다.

WYSIWYG 편집기에는 MIT License의 Milkdown/Crepe를 사용합니다. 자세한 내용은 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)를 참고하세요.
