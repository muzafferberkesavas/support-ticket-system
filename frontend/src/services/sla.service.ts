import { api } from './api';

export interface SlaTargets {
  high: { response: number; resolution: number };
  medium: { response: number; resolution: number };
  low: { response: number; resolution: number };
}

export const slaService = {
  async get(): Promise<SlaTargets> {
    const { data } = await api.get<{ targets: SlaTargets }>('/sla');
    return data.targets;
  },
  async update(targets: SlaTargets): Promise<SlaTargets> {
    const { data } = await api.put<{ targets: SlaTargets }>('/sla', targets);
    return data.targets;
  },
};
