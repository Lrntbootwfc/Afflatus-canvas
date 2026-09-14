/**
 * Affil Main Backend API client (Batch F).
 * All calls go through Vite proxy → Main Backend (/api).
 */
import axios from 'axios';

const client = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

/** Attach identity for Main Backend (dev: user id; prod: also set Firebase Bearer) */
export function setAuth(userId: string | null, firebaseIdToken?: string | null) {
  if (userId) client.defaults.headers.common['x-user-id'] = userId;
  else delete client.defaults.headers.common['x-user-id'];
  if (firebaseIdToken) {
    client.defaults.headers.common['Authorization'] = `Bearer ${firebaseIdToken}`;
  } else {
    delete client.defaults.headers.common['Authorization'];
  }
}

export const affilApi = {
  // Catalog
  getProfessions: () => client.get('/professions').then((r) => r.data),
  getSkills: () => client.get('/skills').then((r) => r.data),
  getInterests: () => client.get('/interests').then((r) => r.data),

  // Profile
  getMyProfile: () => client.get('/profiles/me').then((r) => r.data),
  updateMyProfile: (patch: Record<string, unknown>) =>
    client.patch('/profiles/me', patch).then((r) => r.data),
  putSkills: (skills: Record<string, number>) =>
    client.put('/profiles/me/skills', { skills }).then((r) => r.data),
  putInterests: (interests: Record<string, number>) =>
    client.put('/profiles/me/interests', { interests }).then((r) => r.data),
  putAvailability: (availability: Record<string, unknown>) =>
    client.put('/profiles/me/availability', { availability }).then((r) => r.data),
  addPortfolioItem: (item: Record<string, unknown>) =>
    client.post('/profiles/me/portfolio', item).then((r) => r.data),
  removePortfolioItem: (id: string) =>
    client.delete(`/profiles/me/portfolio/${id}`).then((r) => r.data),
  refreshEmbedding: () => client.post('/profiles/me/embed').then((r) => r.data),

  // Past projects / experience
  getPastProjects: () => client.get('/profiles/me/projects').then((r) => r.data),
  addPastProject: (entry: Record<string, unknown>) =>
    client.post('/profiles/me/projects', entry).then((r) => r.data),
  updatePastProject: (id: string, patch: Record<string, unknown>) =>
    client.patch(`/profiles/me/projects/${id}`, patch).then((r) => r.data),
  deletePastProject: (id: string) =>
    client.delete(`/profiles/me/projects/${id}`).then((r) => r.data),

  // Recommendations
  searchRecommendations: (body: Record<string, unknown>) =>
    client.post('/recommendations/search', body).then((r) => r.data),
  searchFromChat: (message: string, extra?: Record<string, unknown>) =>
    client.post('/recommendations/from-chat', { message, ...extra }).then((r) => r.data),
  recommendTeam: (body: Record<string, unknown>) =>
    client.post('/recommendations/team', body).then((r) => r.data),

  // Projects
  createProject: (body: Record<string, unknown>) =>
    client.post('/projects', body).then((r) => r.data),
  listProjects: () => client.get('/projects').then((r) => r.data),
  getProject: (id: string) => client.get(`/projects/${id}`).then((r) => r.data),
  updateProject: (id: string, patch: Record<string, unknown>) =>
    client.patch(`/projects/${id}`, patch).then((r) => r.data),
  deleteProject: (id: string) => client.delete(`/projects/${id}`).then((r) => r.data),
  completeProject: (id: string) => client.post(`/projects/${id}/complete`).then((r) => r.data),
  getMembers: (id: string) => client.get(`/projects/${id}/members`).then((r) => r.data),

  // Invitations
  invite: (projectId: string, body: Record<string, unknown>) =>
    client.post(`/projects/${projectId}/invitations`, body).then((r) => r.data),
  listInvitations: () => client.get('/invitations').then((r) => r.data),
  acceptInvitation: (id: string) => client.post(`/invitations/${id}/accept`).then((r) => r.data),
  rejectInvitation: (id: string) => client.post(`/invitations/${id}/reject`).then((r) => r.data),

  // Chat
  createConversation: (title?: string) =>
    client.post('/chat/conversations', { title }).then((r) => r.data),
  listConversations: () => client.get('/chat/conversations').then((r) => r.data),
  getMessages: (conversationId: string) =>
    client.get(`/chat/conversations/${conversationId}/messages`).then((r) => r.data),
  sendMessage: (conversationId: string, content: string) =>
    client
      .post(`/chat/conversations/${conversationId}/messages`, { content })
      .then((r) => r.data),

  // Notifications
  registerDevice: (token: string, platform?: string) =>
    client.post('/notifications/register-device', { token, platform }).then((r) => r.data),
  listNotifications: () => client.get('/notifications').then((r) => r.data),
  markNotificationRead: (id: string) =>
    client.post(`/notifications/${id}/read`).then((r) => r.data),
  markAllNotificationsRead: () => client.post('/notifications/read-all').then((r) => r.data),

  // Collaboration
  myCollaborations: () => client.get('/collaborations/me').then((r) => r.data),
  collaborationScore: (userA: string, userB: string) =>
    client.get('/collaborations/score', { params: { userA, userB } }).then((r) => r.data),
  collaborationFeedback: (otherUserId: string, rating: number) =>
    client.post('/collaborations/feedback', { otherUserId, rating }).then((r) => r.data),

  // Brief
  parseBriefV2: (text: string) => client.post('/briefs/parse-v2', { text }).then((r) => r.data),

  // Assistant → Main Backend → AI Backend
  assistantChat: (prompt: string, userId?: string, currentUserProfile?: unknown) =>
    client
      .post('/assistant/chat', { prompt, userId, currentUserProfile })
      .then((r) => r.data),
};

export default affilApi;
