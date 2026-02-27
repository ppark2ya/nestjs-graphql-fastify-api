import { PipeTransform, BadRequestException } from '@nestjs/common';
import type { ZodSchema, output } from 'zod';

export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: unknown): output<ZodSchema> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const messages = result.error.errors.map(
        (e) => `${e.path.join('.')}: ${e.message}`,
      );
      throw new BadRequestException(messages.join(', '));
    }
    return result.data;
  }
}
