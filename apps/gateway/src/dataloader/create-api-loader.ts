import DataLoader from 'dataloader';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';

// URL 템플릿만 받아서 로더를 뱉어주는 함수
export function createApiLoader(httpService: HttpService, urlPattern: (id: any) => string) {
  return new DataLoader(async (keys) => {
    const responses = await Promise.all(
      keys.map(key => 
        lastValueFrom(httpService.get(urlPattern(key))).then(res => res.data).catch(() => null)
      )
    );
    return responses;
  }, { cache: true });
}