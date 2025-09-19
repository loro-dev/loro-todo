import type { TodoStatus } from "../state/doc";

export type Todo = { $cid: string; text: string; status: TodoStatus };
