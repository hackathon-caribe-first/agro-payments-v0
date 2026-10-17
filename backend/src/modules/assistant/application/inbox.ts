import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { AssistantInbox } from "../ports/assistant-inbox";
import { AssistantStore } from "../ports/assistant-store";
import { MESSAGE_ROLE } from "./assistant";

// RF-37: notices land where the producer already talks to the assistant, so «no entendí» right after one escalates it.
@Injectable()
export class ConversationInbox extends AssistantInbox {
  constructor(private readonly store: AssistantStore) {
    super();
  }

  async deliver(userId: string, text: string) {
    let conversation = await this.store.findLatestConversation(userId);
    if (!conversation) {
      conversation = { id: randomUUID(), userId, needsTechnician: false, createdAt: new Date() };
      await this.store.createConversation(conversation);
    }
    await this.store.appendMessages([{ id: randomUUID(), conversationId: conversation.id, role: MESSAGE_ROLE.ASSISTANT, text, createdAt: new Date() }]);
  }
}
