import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * 이 데코레이터가 붙은 쿼리/뮤테이션은 인증 없이 접근 가능합니다.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
