import api from './client'
import type { Meter } from '../types/meter'

export async function getMeters(): Promise<Meter[]> {
  const { data } = await api.get<Meter[]>('/meters')
  return data
}
