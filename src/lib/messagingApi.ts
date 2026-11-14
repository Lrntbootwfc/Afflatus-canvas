/**
 * Place at: src/lib/messagingApi.ts
 * Groups + media messaging. Uses shared Firestore listener registry from firebase.ts.
 */
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  limit,
  serverTimestamp,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db, shareOnSnapshot } from './firebase';
import affilApi from './affilApi';
import type { ChatGroup, ChatMessageDoc, MediaKind, MessageMedia } from './messagingTypes';

const IMAGE_MAX = 2 * 1024 * 1024;
const GENERIC_MAX = 12 * 1024 * 1024;

/** Prevent double-submit group creates */
const __creatingGroups = new Set<string>();

function uid(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function detectMediaKind(file: File): MediaKind {
  const t = (file.type || '').toLowerCase();
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('audio/')) return 'audio';
  return 'file';
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export async function uploadChatMedia(file: File): Promise<MessageMedia> {
  const kind = detectMediaKind(file);
  const max = kind === 'image' ? IMAGE_MAX : GENERIC_MAX;
  if (file.size > max) {
    throw new Error(`File too large (max ${Math.round(max / (1024 * 1024))}MB for ${kind}).`);
  }

  let url = '';
  if (kind === 'image') {
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await affilApi.uploadImage(dataUrl, 'chat');
      url = (res as any)?.url || dataUrl;
    } catch {
      url = await fileToDataUrl(file);
    }
  } else {
    url = await fileToDataUrl(file);
  }

  return {
    kind,
    url,
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  };
}

export async function sendChatMessage(params: {
  connectionId: string;
  senderId: string;
  recipientId: string;
  text?: string;
  media?: MessageMedia;
}): Promise<ChatMessageDoc> {
  const current = auth.currentUser;
  if (!current || current.uid !== params.senderId) {
    throw new Error('You must be signed in to send messages.');
  }
  const text = (params.text || '').trim();
  if (!text && !params.media) throw new Error('Message cannot be empty.');

  const id = `msg_${uid()}`;
  const createdAt = new Date().toISOString();
  const payload: Record<string, unknown> = {
    id,
    connectionId: params.connectionId,
    senderId: params.senderId,
    recipientId: params.recipientId,
    text: text || (params.media ? `Sent ${params.media.kind}` : ''),
    createdAt,
    read: false,
    createdAtTs: serverTimestamp(),
  };
  if (params.media) payload.media = params.media;

  await setDoc(doc(db, 'messages', id), payload);

  try {
    const connRef = doc(db, 'connections', params.connectionId);
    const connSnap = await getDoc(connRef);
    if (connSnap.exists()) {
      const prev = ((connSnap.data() as any).unreadCounts || {}) as Record<string, number>;
      await updateDoc(connRef, {
        unreadCounts: {
          ...prev,
          [params.recipientId]: (Number(prev[params.recipientId]) || 0) + 1,
          [params.senderId]: Number(prev[params.senderId]) || 0,
        },
        lastMessageAt: createdAt,
        lastMessageText: String(payload.text).slice(0, 120),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (e) {
    console.warn('[sendChatMessage] connection update', e);
  }

  return payload as unknown as ChatMessageDoc;
}

export async function createGroup(params: {
  name: string;
  description?: string;
  kind: 'group' | 'community';
  memberIds: string[];
  createdBy: string;
}): Promise<ChatGroup> {
  const current = auth.currentUser;
  if (!current) throw new Error('Sign in required');
  const creatorUid = current.uid;
  if (params.createdBy && params.createdBy !== creatorUid) {
    throw new Error('You can only create a group as yourself.');
  }

  const name = params.name.trim().slice(0, 80);
  if (!name) throw new Error('Group name is required.');

  const dedupeKey = `${creatorUid}:${name.toLowerCase()}`;
  if (__creatingGroups.has(dedupeKey)) {
    throw new Error('Group creation already in progress.');
  }
  __creatingGroups.add(dedupeKey);

  try {
    const id = `grp_${uid()}`;
    const memberIds = Array.from(new Set([creatorUid, ...params.memberIds.filter(Boolean)]));
    const now = new Date().toISOString();
    const kind = params.kind === 'community' ? 'community' : 'group';

    const group: ChatGroup = {
      id,
      name,
      description: (params.description || '').trim().slice(0, 300),
      kind,
      createdBy: creatorUid,
      memberIds,
      adminIds: [creatorUid],
      createdAt: now,
      updatedAt: now,
    };

    const payload: Record<string, unknown> = {
      id: group.id,
      name: group.name,
      description: group.description || '',
      kind: group.kind,
      createdBy: creatorUid,
      memberIds: group.memberIds,
      adminIds: [creatorUid],
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      lastMessageAt: '',
      lastMessageText: '',
      createdAtTs: serverTimestamp(),
      updatedAtTs: serverTimestamp(),
    };

    await setDoc(doc(db, 'groups', id), payload);
    return group;
  } catch (err: any) {
    const msg = String(err?.message || err || '');
    console.error('[createGroup] failed', msg);
    if (/permission|insufficient/i.test(msg)) {
      throw new Error(
        'Could not create group (permission denied). Publish firestore.rules with groups allow read/create for signed-in users.'
      );
    }
    throw new Error(msg || 'Could not create group.');
  } finally {
    __creatingGroups.delete(dedupeKey);
  }
}

/**
 * Real-time groups for a member. Uses shareOnSnapshot so StrictMode / multi-mount
 * cannot register duplicate Firestore targets.
 */
export function subscribeToMyGroups(
  userId: string,
  onChange: (groups: ChatGroup[]) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  const uid = auth.currentUser?.uid || userId;
  if (!uid || !auth.currentUser) {
    onChange([]);
    return () => {};
  }

  const key = `groups:memberIds:array-contains:${uid}`;

  return shareOnSnapshot<ChatGroup[]>(
    key,
    (onData, onErr) => {
      const q = query(
        collection(db, 'groups'),
        where('memberIds', 'array-contains', uid),
        limit(50)
      );
      return onSnapshot(
        q,
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as ChatGroup[];
          list.sort((a, b) =>
            String(b.lastMessageAt || b.updatedAt || '').localeCompare(
              String(a.lastMessageAt || a.updatedAt || '')
            )
          );
          onData(list);
        },
        (err) => onErr(err as Error)
      );
    },
    onChange,
    onError
  );
}

export async function sendGroupMessage(params: {
  groupId: string;
  senderId: string;
  text?: string;
  media?: MessageMedia;
}): Promise<ChatMessageDoc> {
  const current = auth.currentUser;
  if (!current || current.uid !== params.senderId) throw new Error('Sign in required');
  const text = (params.text || '').trim();
  if (!text && !params.media) throw new Error('Message cannot be empty.');

  const gRef = doc(db, 'groups', params.groupId);
  const gSnap = await getDoc(gRef);
  if (!gSnap.exists()) throw new Error('Group not found');
  const g = gSnap.data() as ChatGroup;
  if (!Array.isArray(g.memberIds) || !g.memberIds.includes(params.senderId)) {
    throw new Error('You are not a member of this group');
  }

  const id = `gmsg_${uid()}`;
  const createdAt = new Date().toISOString();
  const payload: Record<string, unknown> = {
    id,
    groupId: params.groupId,
    senderId: params.senderId,
    text: text || (params.media ? `Sent ${params.media.kind}` : ''),
    createdAt,
    createdAtTs: serverTimestamp(),
  };
  if (params.media) payload.media = params.media;
  await setDoc(doc(db, 'groupMessages', id), payload);

  await updateDoc(gRef, {
    lastMessageAt: createdAt,
    lastMessageText: String(payload.text).slice(0, 120),
    updatedAt: createdAt,
    updatedAtTs: serverTimestamp(),
  });

  return payload as unknown as ChatMessageDoc;
}

export function subscribeToGroupMessages(
  groupId: string,
  onChange: (messages: ChatMessageDoc[]) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  if (!groupId) {
    onChange([]);
    return () => {};
  }
  const key = `groupMessages:groupId:${groupId}`;
  return shareOnSnapshot<ChatMessageDoc[]>(
    key,
    (onData, onErr) => {
      const q = query(
        collection(db, 'groupMessages'),
        where('groupId', '==', groupId),
        limit(200)
      );
      return onSnapshot(
        q,
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as ChatMessageDoc[];
          list.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
          onData(list);
        },
        (err) => onErr(err as Error)
      );
    },
    onChange,
    onError
  );
}
