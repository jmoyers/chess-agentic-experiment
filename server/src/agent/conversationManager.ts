import { v4 as uuidv4 } from 'uuid';
import type { Conversation, ConversationMessage } from '@chess/shared';

export class ConversationManager {
  private conversations: Map<string, Conversation>;

  constructor() {
    this.conversations = new Map();
  }

  createConversation(providedId?: string): Conversation {
    const id = providedId || uuidv4();
    const now = Date.now();
    const conversation: Conversation = {
      id,
      title: `Conversation ${this.conversations.size + 1}`,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    this.conversations.set(id, conversation);
    return conversation;
  }

  getConversation(id: string): Conversation | undefined {
    return this.conversations.get(id);
  }

  getAllConversations(): Conversation[] {
    return Array.from(this.conversations.values()).sort(
      (a, b) => b.updatedAt - a.updatedAt
    );
  }

  addMessage(conversationId: string, message: Omit<ConversationMessage, 'id' | 'timestamp'>): ConversationMessage {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const fullMessage: ConversationMessage = {
      ...message,
      id: uuidv4(),
      timestamp: Date.now(),
    };

    conversation.messages.push(fullMessage);
    conversation.updatedAt = Date.now();

    return fullMessage;
  }

  deleteConversation(id: string): boolean {
    return this.conversations.delete(id);
  }

  updateTitle(id: string, title: string): void {
    const conversation = this.conversations.get(id);
    if (conversation) {
      conversation.title = title;
      conversation.updatedAt = Date.now();
    }
  }

  getOrCreateActiveConversation(): Conversation {
    const conversations = this.getAllConversations();
    if (conversations.length > 0) {
      return conversations[0];
    }
    return this.createConversation();
  }
}

