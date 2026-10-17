// RF-37: how other modules talk to the producer through the assistant (notices), without touching its conversations.
// Abstract class (not interface) so it doubles as the Nest DI token.
export abstract class AssistantInbox {
  /** Appends `text` as an assistant message in the user's latest conversation (opening one if none). */
  abstract deliver(userId: string, text: string): Promise<void>;
}
