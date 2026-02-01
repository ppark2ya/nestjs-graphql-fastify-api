# NestJS GraphQL Fastify API

Nx Monorepo 기반의 고성능 마이크로서비스 아키텍처 예제 프로젝트입니다.
**Gateway (GraphQL)**와 **Auth (REST)** 두 개의 애플리케이션으로 구성되어 있으며, 인프라 및 배포 파이프라인까지 포함합니다.

## 🏗 아키텍처

이 프로젝트는 **Nx Integrated Monorepo** 패턴을 따릅니다.

- **Gateway (Port 4000)**: GraphQL 엔드포인트. 외부 REST API 및 Auth 서비스를 GraphQL 스키마로 통합하여 제공합니다.
- **Auth (Port 4001)**: 인증 전담 서버. JWT 발급, 검증, 2FA(TOTP), Refresh Token Rotation을 수행합니다.
- **Shared Lib**: 공통 상수, 타입, 유틸리티를 공유합니다.

### 핵심 기능

| 기능 | 설명 | 기술 스택 |
|---|---|---|
| **GraphQL Gateway** | 단일 API 진입점, REST to GraphQL 변환 | Apollo Server, DataLoader |
| **인증 시스템** | JWT RS256 비대칭 키 서명, Refresh Token Rotation | jose, Passport, bcrypt |
| **2FA** | TOTP 기반 2단계 인증 | otplib |
| **안정성** | 외부 서비스 호출 시 서킷 브레이커 적용 | Opossum |
| **성능** | Fastify 기반의 높은 처리량 | Fastify Adapter |

## 🛠 기술 스택

- **Framework**: NestJS v11, Fastify
- **Language**: TypeScript (ES2023)
- **GraphQL**: Code-First, DataLoader
- **Database**: MySQL, Drizzle ORM
- **Build**: SWC, Nx
- **Infrastructure**: Docker Swarm, Portainer, Drone CI

## 🚀 시작하기

### 사전 요구사항
- Node.js v20+
- pnpm
- Docker & Docker Compose (선택사항)

### 설치

```bash
pnpm install
```

### 키 생성 (로컬 개발용)
Auth 서버 구동을 위해 RS256 키 쌍이 필요합니다.

```bash
# keys 디렉토리에 public.pem, private.pem 생성
./generate_keys.sh
```
*(주의: 실제 배포 시에는 Docker Swarm Secrets를 사용하므로 키 파일이 필요 없습니다.)*

### 실행

```bash
# 개발 모드 (Watch)
pnpm run start:gateway:dev
pnpm run start:auth:dev

# 프로덕션 모드
pnpm run start:gateway:prod
pnpm run start:auth:prod
```

### 테스트

```bash
pnpm run test           # Unit Test
pnpm run test:e2e:auth  # E2E Test
```

## 🐳 인프라 및 배포

이 프로젝트는 **Docker Swarm**을 이용한 무중단 배포 환경을 지원합니다.

### 주요 특징
- **Docker Secrets**: 민감한 키 파일을 이미지에 포함하지 않고 안전하게 주입
- **Overlay Network**: 마이크로서비스 간 사설 네트워크 통신
- **Healthcheck**: 서비스 상태 모니터링 및 자동 복구

### 배포 파이프라인
1. **Drone CI**: 코드 푸시 감지 및 Docker 이미지 빌드
2. **Docker Registry**: 빌드된 이미지 푸시
3. **Portainer**: Webhook 또는 UI를 통해 Swarm Stack 업데이트

자세한 인프라 설정 및 아키텍처는 [CLAUDE.md](./CLAUDE.md) 파일을 참고하세요.

## 📝 문서

더 상세한 개발 가이드와 아키텍처 설명은 `CLAUDE.md` 파일에 기술되어 있습니다. LLM(Claude 등)을 활용하여 개발할 때 이 파일을 컨텍스트로 제공하면 효율적입니다.

## License

[MIT licensed](LICENSE)
