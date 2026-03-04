# React 19 + React Compiler 리팩토링 설계

## 목표

React Compiler가 이미 활성화된 UI 프로젝트에서, 컴파일러의 자동 최적화를 방해하는 수동 메모이제이션 코드를 제거하고 React 19에서 deprecated된 `forwardRef` 패턴을 최신 문법으로 교체한다.

## 변경 범위

### 1. forwardRef -> ref prop (30+ 컴포넌트)

React 19에서 `ref`는 일반 prop으로 전달 가능. `forwardRef` 래퍼와 `displayName` 설정 불필요.

**Before:**
```tsx
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, ...props }, ref) => <button ref={ref} {...props} />
);
Button.displayName = 'Button';
```

**After:**
```tsx
function Button({ className, ref, ...props }: ButtonProps & { ref?: React.Ref<HTMLButtonElement> }) {
  return <button ref={ref} {...props} />;
}
```

대상 파일:
- `components/ui/button.tsx`
- `components/ui/input.tsx`
- `components/ui/card.tsx` (6개 컴포넌트)
- `components/ui/label.tsx`
- `components/ui/select.tsx` (7개 컴포넌트)
- `components/ui/sheet.tsx` (4개 컴포넌트)
- `components/ui/table.tsx` (8개 컴포넌트)
- `components/ui/scroll-area.tsx` (2개 컴포넌트)

### 2. memo() 제거 (3개 컴포넌트)

React Compiler가 props 변경 감지 및 자동 메모이제이션.

대상:
- `pages/live-stream/LogRow.tsx`: `LogRow`, `ServiceLogRow`
- `components/AnsiText.tsx`: `AnsiText`

### 3. useCallback 제거 (10+개)

React Compiler가 함수 참조 안정성을 자동 관리.

대상:
- `auth/AuthContext.tsx`: `handleLogout`, `doRefresh`, `handleLogin`
- `pages/live-stream/LiveStreamPage.tsx`: `openTab`, `closeTab`
- `pages/live-stream/LogViewer.tsx`: `flushBatch`
- `pages/live-stream/ServiceLogViewer.tsx`: `flushBatch`, `handleLog`
- `pages/history/HistoryPage.tsx`: `addTab`, `closeTab`, `updateTabLabel`

### 4. useMemo 제거 (6개)

React Compiler가 파생 값 자동 메모이제이션.

대상:
- `pages/live-stream/LogViewer.tsx`: `filteredLogs`
- `pages/live-stream/ServiceLogViewer.tsx`: `containerColorMap`, `containerNodeMap`, `filteredLogs`
- `pages/live-stream/ContainerList.tsx`: `filtered`
- `pages/history/SearchPanel.tsx`: `parsedMetadata`

### 5. eslint-disable 주석 정리

- `auth/AuthContext.tsx:168`: `eslint-disable-line react-hooks/exhaustive-deps` 제거

## 하지 않는 것

- `useActionState`, `useTransition` 등 React 19 신규 API 도입 (Apollo Client 기반이므로 부적합)
- `use(Context)` API 전환 (현재 패턴이 적절)
- `input-otp.tsx`, `resizable.tsx` (서드파티 래퍼라 변경 불필요)

## 검증

- `pnpm run lint` 통과
- `nx build ui` 성공
- 기존 동작 변경 없음 (순수 리팩토링)
