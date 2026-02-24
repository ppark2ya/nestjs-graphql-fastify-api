# Login Page & UI Restructuring Design

**Date**: 2026-02-23
**Status**: Approved

## Overview

`apps/log-viewer` -> `apps/ui`로 이름 변경. 로그인 페이지(ID/PW + Google OTP 2FA)를 추가하고 반응형 UI로 구현한다.

## Decisions

- **토큰 저장**: localStorage (방식 B) - WAF 정책상 /graphql 외 REST 엔드포인트 사용 불가
- **토큰 만료**: accessToken 1시간, refreshToken 4시간
- **자동 갱신**: accessToken 만료 10분 전 자동 refresh
- **2FA UI**: 같은 카드 내 애니메이션 전환 (페이지 이동 없음)
- **디자인**: 다크 모드, 기존 log-viewer 톤과 일관
- **라우트 가드**: 미인증 시 /login으로 리다이렉트

## Directory Structure

```
apps/ui/
├── src/
│   ├── main.tsx
│   ├── App.tsx                    # AuthProvider → Router
│   ├── apollo.ts                  # authLink 추가
│   ├── index.css
│   ├── auth/
│   │   ├── AuthContext.tsx         # React Context: tokens, login/logout, isAuthenticated
│   │   ├── AuthGuard.tsx          # 미인증 시 /login 리다이렉트
│   │   ├── graphql.ts             # login, verifyTwoFactor, refreshToken, logout mutation
│   │   └── token.ts               # localStorage CRUD, 만료 체크, 자동 갱신 타이머
│   ├── pages/
│   │   ├── LoginPage.tsx          # ID/PW → OTP 전환 (단일 페이지)
│   │   ├── LiveStreamPage.tsx     # 기존
│   │   └── HistoryPage.tsx        # 기존
│   ├── components/
│   │   ├── Navigation.tsx         # 기존 + 로그아웃 버튼
│   │   └── OtpInput.tsx           # 6자리 OTP 입력
│   ├── graphql.ts                 # 기존
│   ├── history-graphql.ts         # 기존
│   ├── LogViewer.tsx              # 기존
│   ├── ContainerList.tsx          # 기존
│   ├── ServiceLogViewer.tsx       # 기존
│   └── utils.ts                   # 기존
```

## Authentication Flow

```
LoginPage Step 1: username + password
  → login mutation
    ├─ requiresTwoFactor: false → tokens 저장 → 메인 페이지
    └─ requiresTwoFactor: true  → Step 2 (애니메이션 전환)

LoginPage Step 2: OTP 6자리
  → verifyTwoFactor mutation → tokens 저장 → 메인 페이지
```

## Token Management

- localStorage에 accessToken, refreshToken 저장
- 자동 갱신: (expiresIn - 600초) 후 refreshToken mutation
- 페이지 로드 시: accessToken 유효 → 타이머 시작, 만료 → refresh 시도, 실패 → 로그인
- 로그아웃: localStorage 클리어 + logout mutation + Apollo cache reset

## Apollo Client Changes

- authLink: localStorage에서 accessToken → Authorization: Bearer 헤더
- 기존 X-API-Key 헤더 유지
- WebSocket connectionParams에 authorization 추가

## Login Page UI

- 반응형: 모바일(< 640px) 전체 너비, 데스크톱 max-w-sm 중앙 정렬
- 다크 카드: bg-gray-900 border-gray-800 rounded-xl
- 입력 필드: bg-gray-800 border-gray-700, focus ring-blue-500
- 버튼: bg-blue-600, 로딩 시 스피너
- OTP: 6개 개별 input, 자동 포커스 이동, 붙여넣기 지원
- 전환: CSS opacity + translateX 애니메이션
- 비밀번호 눈 아이콘 토글

## Auth Server Changes

- `libs/shared/src/constants/auth.constants.ts`:
  - ACCESS_TOKEN_EXPIRY: '15m' → '1h'
  - REFRESH_TOKEN_EXPIRY: '7d' → '4h'

## Navigation Changes

- 우측에 사용자명 표시 + 로그아웃 버튼 추가
