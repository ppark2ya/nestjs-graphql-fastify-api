import DataLoader from 'dataloader';
import { Post } from '../models/post.model';

export interface IDataLoaders {
  postsLoader: DataLoader<number, Post[]>;
}
