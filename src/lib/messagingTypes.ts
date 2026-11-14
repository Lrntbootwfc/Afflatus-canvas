/** Shared messaging types (DM + groups/communities). */

export type MediaKind = 'image' | 'video' | 'audio' | 'file';

export interface MessageMedia {
  kind: MediaKind;
  url: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface ChatMessageDoc {
  id: string;
  connectionId?: string;
  groupId?: string;
  senderId: string;
  recipientId?: string;
  text: string;
  createdAt: string;
  read?: boolean;
  media?: MessageMedia;
  senderName?: string;
}

export interface ChatGroup {
  id: string;
  name: string;
  description?: string;
  kind: 'group' | 'community';
  createdBy: string;
  memberIds: string[];
  adminIds?: string[];
  createdAt: string;
  updatedAt?: string;
  lastMessageAt?: string;
  lastMessageText?: string;
}
