import { api } from './api';
import type { Department } from '@/types';

export interface DepartmentPayload {
  name: string;
  description?: string | null;
  memberIds?: string[];
}

export const departmentService = {
  async list(): Promise<Department[]> {
    const { data } = await api.get<{ departments: Department[] }>('/departments');
    return data.departments;
  },
  async get(id: string): Promise<Department> {
    const { data } = await api.get<{ department: Department }>(`/departments/${id}`);
    return data.department;
  },
  async create(payload: DepartmentPayload): Promise<Department> {
    const { data } = await api.post<{ department: Department }>('/departments', payload);
    return data.department;
  },
  async update(id: string, payload: Partial<DepartmentPayload>): Promise<Department> {
    const { data } = await api.put<{ department: Department }>(`/departments/${id}`, payload);
    return data.department;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/departments/${id}`);
  },
};
