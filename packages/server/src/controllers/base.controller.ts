import { z } from "zod";
import { IProgram } from "src/iprogram";

export const ErrorResponseSchema = z.object({
  error: z.string(),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export const ParamsIdSchema = z.object({
  id: z
    .string()
    .min(1)
    .openapi({ param: { name: "id", in: "path" }, example: "session-123" }),
});

export const updateatSchema  = z.object({
  id: z
    .date()
    .optional()
    .openapi({ param: { name: "updateat", in: "query" }, example: "session-123" }),
});
export type ParamsId = z.infer<typeof ParamsIdSchema>;

export const ParamsFragmentSchema = z.object({
  id: z.string().min(1),
  fragment_id: z.string().min(1).openapi({ example: "msg_1_frag_2" }),
});
export type ParamsFragment = z.infer<typeof ParamsFragmentSchema>;

export const SessionInfoSchema = z.object({
  id: z.string(),
  title: z.string(),
  size_bytes: z.number(),
  models: z.array(z.string()),
  fragments: z.array(z.any()),
  messages: z.array(z.any()),
});
export type SessionInfo = z.infer<typeof SessionInfoSchema>;

export abstract class BaseController {
  constructor(protected program: IProgram) {}
  protected get repo() {
    return this.program.repo();
  }
}
