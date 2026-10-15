/** Player-facing lines are keys. The page turns them into English or Japanese. */

export type LogKey =
  | "log.keeps"
  | "log.tax"
  | "log.rite"
  | "log.hearth"
  | "log.ground"
  | "log.claim"
  | "log.break"
  | "log.hold"
  | "log.muster"
  | "log.levy";

export type NoticeKey =
  | "note.water"
  | "note.blocked"
  | "notice.nowhere"
  | "notice.offMarsh"
  | "notice.wrongGod"
  | "notice.settling"
  | "notice.cost"
  | "notice.seedbedWood"
  | "notice.hearthwarmOwn"
  | "notice.hearthwarmMax"
  | "notice.briarHearth"
  | "notice.briarMeadow"
  | "notice.shoreWater"
  | "notice.shoreLand"
  | "notice.cinderNeed"
  | "notice.tremorNeed"
  | "notice.cutHearth"
  | "notice.cutMeadow"
  | "notice.cutStuck"
  | "notice.drainWater"
  | "notice.drainLand"
  | "notice.undertowEnemy"
  | "notice.undertowHearth";

export type PlaceKey =
  | "place.somewhere"
  | "place.ownHearth"
  | "place.foreignHearth"
  | "place.wood"
  | "place.open"
  | "place.own"
  | "place.enemy";

export type SpeechArgs = Readonly<Record<string, string | number>>;

export interface LogEntry {
  day: number;
  key: LogKey;
  args: SpeechArgs;
}

export interface Notice {
  key: NoticeKey;
  args?: SpeechArgs;
}
