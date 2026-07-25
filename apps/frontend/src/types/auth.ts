export type UserRole = 'admin' | 'object_manager' | 'consumer' | 'auditor'

/** Профиль пользователя из POST /auth/login и GET /auth/me (без passwordHash). */
export interface AuthUser {
  id: string
  fullName: string
  email: string
  role: UserRole | string
  status: string
  consumerId: string | null
  createdAt: string
  updatedAt: string
}

/** Ответ POST /auth/login */
export interface LoginResponse {
  accessToken: string
  user: AuthUser
}
