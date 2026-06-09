import { api } from './api';
import type { Role, User } from '@/types';

export interface UserFilters {
  role?: Role;
  departmentId?: string;
  search?: string;
}

export interface UpdateUserPayload {
  role?: Role;
  fullName?: string | null;
  departmentIds?: string[];
}

export interface CreateUserPayload {
  email: string;
  fullName?: string;
  role: Role;
  departmentIds?: string[];
}

export const userService = {
  async list(filters: UserFilters = {}): Promise<User[]> {
    const { data } = await api.get<{ users: User[] }>('/users', { params: filters });
    return data.users;
  },
  async create(payload: CreateUserPayload): Promise<{ user: User; tempPassword: string }> {
    const { data } = await api.post<{ user: User; tempPassword: string }>('/users', payload);
    return data;
  },
  async update(id: string, payload: UpdateUserPayload): Promise<User> {
    const { data } = await api.put<{ user: User }>(`/users/${id}`, payload);
    return data.user;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/users/${id}`);
  },
};
