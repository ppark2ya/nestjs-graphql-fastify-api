# ================================================================
# Gateway Dockerfile (pre-built)
# 빌드 컨텍스트: 프로젝트 루트
# 전제: Drone CI에서 pnpm install --prod + pnpm build:gateway 완료
# 사용법: docker build -f apps/gateway/Dockerfile -t gateway:tag .
# ================================================================
FROM node:24-alpine

WORKDIR /app

# 프로덕션 의존성 복사
COPY node_modules ./node_modules

# 빌드 결과물 복사
COPY dist ./dist

# package.json 복사 (버전 정보 등)
COPY package.json ./

# 로그 디렉토리 권한 설정
RUN mkdir -p logs && chown -R node:node .

# 보안: non-root 사용자로 실행
USER node

EXPOSE 4000

ENV NODE_ENV=production
ENV PORT=4000

CMD ["node", "dist/apps/gateway/main.js"]
