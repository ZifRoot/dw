import { Fragment } from "../resp";

export type MessageFragmentCreate = Fragment & { sessionId: string; messageId: number; };
