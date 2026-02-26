import DataLoader from 'dataloader';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';

// URL 템플릿만 받아서 로더를 뱉어주는 함수
export function createApiLoader<T>(
  httpService: HttpService,
  urlPattern: (id: string | number) => string,
): DataLoader<string | number, T | null> {
  return new DataLoader<string | number, T | null>(
    async (keys) => {
      const responses = await Promise.all(
        keys.map((key) =>
          lastValueFrom(httpService.get<T>(urlPattern(key)))
            .then((res) => res.data)
            .catch(() => null),
        ),
      );
      return responses;
    },
    { cache: true },
  );
}
