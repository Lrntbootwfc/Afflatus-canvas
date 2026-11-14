/** Shared messaging types for 1:1, groups, and media. */

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
  /** 1:1 thread */
  connectionId?: string;
  /** Group / community thread */
  groupId?: string;
  senderId: string;
  recipientId?: string;
  text: string;
  createdAt: string;
  read?: boolean;
  sharedPost?: {
    postId: string;
    url?: string;
    caption?: string;
    imageUrl?: string;
    authorName?: string;
    authorId?: string;
  };
  media?: MessageMedia;
}

export type GroupKind = 'group' | 'community';

export interface ChatGroup {
  id: string;
  name: string;
  description?: string;
  kind: GroupKind;
  createdBy: string;
  memberIds: string[];
  adminIds: string[];
  avatarUrl?: string;
  createdAt: string;
  updatedAt?: string;
  lastMessageAt?: string;
  lastMessageText?: string;
}
