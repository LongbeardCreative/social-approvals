import { z } from 'zod';

const PostInput = z.object({
  copy: z.string(),
  img: z.string().regex(/^https:\/\//, 'must be an https URL').nullable(),
  note: z.string(),
});

const PlatformInput = z.object({
  on: z.boolean(),
  cur: z.number().int().min(0),
  posts: z.array(PostInput).min(1).max(6),
});

export const CreateReviewInput = z
  .object({
    campaign: z.string().trim().min(1),
    account: z.string().trim().min(1),
    handle: z.string().trim().min(1),
    asanaTaskGid: z.string().regex(/^\d{8,}$/),
    platforms: z.record(z.string(), PlatformInput),
  })
  .refine((v) => Object.values(v.platforms).some((p) => p.on), {
    message: 'At least one platform must be enabled',
  });

export type CreateReviewInput = z.infer<typeof CreateReviewInput>;
