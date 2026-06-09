import { api } from './api';
import type {
  Attachment,
  AuditEntry,
  CreateTicketPayload,
  Priority,
  Status,
  Ticket,
  TicketEstimate,
  TicketFilters,
  TicketReply,
  UpdateTicketPayload,
} from '@/types';

export const ticketService = {
  async list(filters: TicketFilters = {}): Promise<Ticket[]> {
    const { data } = await api.get<{ tickets: Ticket[] }>('/tickets', { params: filters });
    return data.tickets;
  },

  async get(id: string): Promise<Ticket> {
    const { data } = await api.get<{ ticket: Ticket }>(`/tickets/${id}`);
    return data.ticket;
  },

  async create(payload: CreateTicketPayload): Promise<Ticket> {
    const { data } = await api.post<{ ticket: Ticket }>('/tickets', payload);
    return data.ticket;
  },

  async update(id: string, payload: UpdateTicketPayload): Promise<Ticket> {
    const { data } = await api.put<{ ticket: Ticket }>(`/tickets/${id}`, payload);
    return data.ticket;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/tickets/${id}`);
  },

  async assign(id: string, assigneeIds: string[]): Promise<Ticket> {
    const { data } = await api.patch<{ ticket: Ticket }>(`/tickets/${id}/assign`, { assigneeIds });
    return data.ticket;
  },

  async addReply(id: string, message: string, isInternal = false): Promise<TicketReply> {
    const { data } = await api.post<{ reply: TicketReply }>(`/tickets/${id}/replies`, {
      message,
      isInternal,
    });
    return data.reply;
  },

  async escalate(id: string, reason = 'manual'): Promise<Ticket> {
    const { data } = await api.patch<{ ticket: Ticket }>(`/tickets/${id}/escalate`, { reason });
    return data.ticket;
  },

  async reopen(id: string): Promise<Ticket> {
    const { data } = await api.post<{ ticket: Ticket }>(`/tickets/${id}/reopen`);
    return data.ticket;
  },

  async activity(id: string): Promise<AuditEntry[]> {
    const { data } = await api.get<{ activity: AuditEntry[] }>(`/tickets/${id}/activity`);
    return data.activity;
  },

  async estimate(priority: Priority, departmentId?: string | null): Promise<TicketEstimate> {
    const { data } = await api.get<TicketEstimate>('/tickets/estimate', {
      params: { priority, ...(departmentId ? { departmentId } : {}) },
    });
    return data;
  },

  async uploadAttachments(id: string, files: File[]): Promise<Attachment[]> {
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    const { data } = await api.post<{ attachments: Attachment[] }>(`/tickets/${id}/attachments`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data.attachments;
  },

  async downloadAttachment(id: string): Promise<Blob> {
    const { data } = await api.get(`/attachments/${id}`, { responseType: 'blob' });
    return data as Blob;
  },

  async deleteAttachment(id: string): Promise<void> {
    await api.delete(`/attachments/${id}`);
  },

  async submitCsat(id: string, rating: number, comment?: string): Promise<Ticket> {
    const { data } = await api.post<{ ticket: Ticket }>(`/tickets/${id}/csat`, { rating, comment });
    return data.ticket;
  },

  async tags(): Promise<string[]> {
    const { data } = await api.get<{ tags: string[] }>('/tickets/tags');
    return data.tags;
  },

  async bulk(
    ids: string[],
    action: 'status' | 'delete' | 'assign',
    opts: { status?: Status; assigneeIds?: string[] } = {},
  ): Promise<{ updated: number; skipped: number }> {
    const { data } = await api.post<{ updated: number; skipped: number }>('/tickets/bulk', {
      ids,
      action,
      ...opts,
    });
    return data;
  },
};
