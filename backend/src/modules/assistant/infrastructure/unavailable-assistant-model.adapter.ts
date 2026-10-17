import { AssistantModel, AssistantUnavailableError } from "../ports/assistant-model";

// Bound when ANTHROPIC_API_KEY is not set: the chat answers 503 and the rest of the app is unaffected.
export class UnavailableAssistantModel extends AssistantModel {
  async next(): Promise<never> {
    throw new AssistantUnavailableError();
  }
}
