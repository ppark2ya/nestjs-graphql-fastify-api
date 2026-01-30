import { Injectable } from '@nestjs/common';
import DataLoader from 'dataloader';
import { AppService } from '../app.service';
import { IDataLoaders } from './dataloader.interface';
import { Post } from '../models/post.model';

@Injectable()
export class DataLoaderService {
  constructor(private readonly appService: AppService) {}

  createLoaders(authToken?: string): IDataLoaders {
    const postsLoader = new DataLoader<number, Post[]>(
      async (userIds: readonly number[]) => {
        const posts = await this.appService.getPostsByUserIds(
          [...userIds],
          authToken,
        );

        const postsMap = new Map<number, Post[]>();
        for (const post of posts) {
          const existing = postsMap.get(post.userId) || [];
          existing.push(post);
          postsMap.set(post.userId, existing);
        }

        return userIds.map((id) => postsMap.get(id) || []);
      },
    );

    return { postsLoader };
  }
}
