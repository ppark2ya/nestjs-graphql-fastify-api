# ================================================================
# Nginx Dockerfile (UI 정적 파일 + 리버스 프록시)
# 빌드 컨텍스트: 프로젝트 루트
# 사용법: docker build -f docker/nginx/Dockerfile -t nginx-ui:tag .
# ================================================================

# ---- Stage 1: UI 빌드 ----
FROM node:24-alpine AS builder

ARG VITE_API_KEY
ENV VITE_API_KEY=$VITE_API_KEY

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@8.10.5 --activate

COPY pnpm-lock.yaml package.json ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY tsconfig.base.json nx.json ./
COPY apps/ui ./apps/ui
COPY libs ./libs

RUN (pnpm nx build shared && pnpm nx build ui || true) \
    && test -f dist/apps/ui/index.html

# ---- Stage 2: Nginx ----
FROM nginx:1.27-alpine

# Nginx 설정 복사
COPY docker/nginx/nginx.conf /etc/nginx/nginx.conf
COPY docker/nginx/whitelist.conf /etc/nginx/whitelist.conf

# UI 빌드 결과물 복사
COPY --from=builder /app/dist/apps/ui /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
