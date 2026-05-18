/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_KEY: string;
  readonly VITE_AUTH_USER_TYPE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
