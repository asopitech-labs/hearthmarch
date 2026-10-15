import type { LogKey, NoticeKey, PlaceKey } from "../game/speech.ts";
import type { MessageKey } from "./en.ts";

type Assert<T extends MessageKey> = T;

export type LogKeysAreMessages = Assert<LogKey>;
export type NoticeKeysAreMessages = Assert<NoticeKey>;
export type PlaceKeysAreMessages = Assert<PlaceKey>;
