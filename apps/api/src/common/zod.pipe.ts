import { BadRequestException, type PipeTransform } from "@nestjs/common";
import type { ZodSchema } from "zod";

type ZodFlatten = { formErrors: string[]; fieldErrors: Record<string, string[] | undefined> };

/**
 * UX-2026-07-15: a plain-object `HttpException` body is used VERBATIM as the HTTP response (Nest's
 * `HttpException.createBody` returns a non-string/array/number `arg0` unchanged) — so the previous
 * `flatten()`-only body carried no top-level `message`. The mobile client's `friendlyMessage()` only
 * ever reads `message`, so EVERY zod-rejected request app-wide (order creation, rider signup, profile
 * edits, offers, KYC uploads…) fell through to a generic "check your connection" string, even though the
 * request reached the server fine and was rejected for a fixable content reason. Keep the full
 * `flatten()` shape (still useful for logs/ops) and add `message` summarizing the first concrete
 * complaint, field-qualified when it's a field error.
 */
function firstZodMessage(flat: ZodFlatten): string {
  const [field, messages] = Object.entries(flat.fieldErrors).find(([, m]) => m && m.length > 0) ?? [];
  if (field && messages?.[0]) return `${field}: ${messages[0]}`;
  if (flat.formErrors[0]) return flat.formErrors[0];
  return "Check the highlighted details and try again.";
}

/** Validates a request body against a shared zod contract (@lynia/shared). */
export class ZodBody<T> implements PipeTransform {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const flat = result.error.flatten();
      throw new BadRequestException({ message: firstZodMessage(flat), ...flat });
    }
    return result.data;
  }
}
