import { Resolver, Query, Args } from '@nestjs/graphql';
import { LogHistoryService } from './log-history.service';
import { LogApp } from './models/log-app.model';
import { LogSearchResult } from './models/log-search-result.model';
import { LogSearchInput } from './dto/log-search.input';

@Resolver()
export class LogHistoryResolver {
  constructor(private readonly service: LogHistoryService) {}

  @Query(() => [LogApp], { description: '로그 앱 목록 조회' })
  async logApps(): Promise<LogApp[]> {
    return this.service.listApps();
  }

  @Query(() => LogSearchResult, { description: '로그 검색' })
  async logSearch(
    @Args('input') input: LogSearchInput,
  ): Promise<LogSearchResult> {
    return this.service.search(input);
  }
}
