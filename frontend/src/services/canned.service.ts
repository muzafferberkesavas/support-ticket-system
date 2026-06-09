import { api } from './api';
import type { CannedResponse } from '@/types';

export interface CannedPayload {
  title: string;
  body: string;
  departmentId?: string | null;
}

export const cannedService = {
  async list(): Promise<CannedResponse[]> {
    const { data } = await api.get<{ responses: CannedResponse[] }>('/canned');
    return data.responses;
  },
  async create(payload: CannedPayload): Promise<CannedResponse> {
    const { data } = await api.post<{ response: CannedResponse }>('/canned', payload);
    return data.response;
  },
  async update(id: string, payload: Partial<CannedPayload>): Promise<CannedResponse> {
    const { data } = await api.put<{ response: CannedResponse }>(`/canned/${id}`, payload);
    return data.response;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/canned/${id}`);
  },
};
