export interface User {
  id: string;
  oidcSub: string | null;
  username: string;
  displayName: string | null;
  email: string | null;
  createdAt: number;
}

export interface ChatSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  chatId: string;
  position: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

export interface Chat extends ChatSummary {
  userId: string;
  messages: Message[];
}
