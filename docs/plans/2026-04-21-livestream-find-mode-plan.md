# LiveStream Find 모드 구현 계획

설계 문서: `2026-04-21-livestream-find-mode-design.md`

## Step 1: highlight-html 유틸 함수

파일: `apps/ui/src/utils/highlight-html.ts`

HTML 문자열에서 텍스트 노드만 대상으로 키워드를 `<mark>` 태그로 감싸는 함수.
- HTML 태그 내부(속성 등)는 건드리지 않음
- 대소문자 무시
- 매치 위치별로 current/non-current 구분하여 클래스 부여
- 입력: `(html: string, query: string, currentPosition?: number)` → 출력: 하이라이팅된 HTML 문자열 + 총 매치 수

## Step 2: HighlightedAnsiText 컴포넌트

파일: `apps/ui/src/components/HighlightedAnsiText.tsx`

- query가 없으면 기존 AnsiText와 동일 동작
- query가 있으면: ANSI→HTML 변환 후 highlight-html 유틸로 하이라이팅 적용
- props: `text, className, query?, currentMatchPositionInLine?`

## Step 3: useLogSearch 훅

파일: `apps/ui/src/hooks/useLogSearch.ts`

- mode 상태 ('filter' | 'find')
- filter 모드: 기존 useLogFilter 로직 그대로
- find 모드: 전체 logs 반환 + matches 배열 계산 (logIndex, 줄 내 매치 수)
- currentMatchIndex, next(), prev()
- currentMatchLogIndex 계산 (스크롤 대상)
- debounced query 사용

## Step 4: LogViewer / ServiceLogViewer UI 통합

수정 파일:
- `apps/ui/src/features/live-stream/components/LogViewer.tsx`
- `apps/ui/src/features/live-stream/components/ServiceLogViewer.tsx`
- `apps/ui/src/features/live-stream/components/LogRow.tsx`

변경 사항:
- useLogFilter → useLogSearch로 교체
- 모드 토글 버튼 추가 (ListFilter ↔ Search 아이콘)
- find 모드 카운터 표시 (`3/15 matches`)
- LogRow에서 HighlightedAnsiText 사용
- n/Shift+N 키바인딩 이벤트 리스너 등록
- n/N 시 virtualizer.scrollToIndex 호출
- find 모드 시 auto-scroll 비활성

## Step 5: 스타일링

CSS/Tailwind 클래스:
- `.match-highlight` — `bg-yellow-300/40 text-inherit rounded-sm`
- `.match-highlight-current` — `bg-orange-400/70 text-inherit rounded-sm`
- 다크 테마 대응 (현재 다크 기반이므로 밝은 배경 하이라이트)

## Step 6: 테스트

- highlight-html 유틸 단위 테스트 (HTML 태그 보존, 매치 정확도)
- useLogSearch 훅 테스트 (모드 전환, 매치 계산, next/prev)
- 통합: 키바인딩 동작 확인
