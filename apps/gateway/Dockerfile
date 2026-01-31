# ================================================================
# Gateway Dockerfile
# 빌드 컨텍스트: 프로젝트 루트
# 사용법: docker build -f apps/gateway/Dockerfile -t gateway:tag .
# ================================================================

# ---- Stage 1: Production dependencies ----
FROM node:24-alpine AS deps

WORKDIR /app

# pnpm 활성화 (lockfile 버전과 일치시킴)
RUN corepack enable && corepack prepare pnpm@8.10.5 --activate

# 의존성 파일 복사 및 설치 (production only)
COPY pnpm-lock.yaml package.json ./
RUN pnpm install --frozen-lockfile --prod

# ---- Stage 2: Build ----
FROM node:24-alpine AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@8.10.5 --activate

# 전체 의존성 설치 (devDependencies 포함)
COPY pnpm-lock.yaml package.json ./
RUN pnpm install --frozen-lockfile

# 소스 코드 및 설정 파일 복사
COPY tsconfig.base.json nest-cli.json nx.json ./
COPY apps/gateway ./apps/gateway
COPY libs ./libs

# Gateway 빌드
RUN pnpm build:gateway

# ---- Stage 3: Production ----
FROM node:24-alpine AS production

WORKDIR /app

# 프로덕션 의존성만 복사
COPY --from=deps /app/node_modules ./node_modules

# 빌드 결과물 복사
COPY --from=build /app/dist ./dist

# package.json 복사 (버전 정보 등)
COPY package.json ./

# 보안: non-root 사용자로 실행
USER node

EXPOSE 4000

# 환경변수 기본값
ENV NODE_ENV=production
ENV PORT=4000

CMD ["node", "dist/apps/gateway/main.js"]
