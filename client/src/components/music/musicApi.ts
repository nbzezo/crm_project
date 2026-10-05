import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../api/client';
import {
  clearLegacyMusicLinks,
  readLegacyMusicLinks,
  type SavedMusicLink,
} from '../../lib/musicLinks';

/* Link nhac yeu thich theo tai khoan (v59, 1.20.0). */

export const MUSIC_LINKS_KEY = ['music-links'] as const;

export const musicApi = {
  list: () => api.get<SavedMusicLink[]>('/api/music-links'),
  save: (body: { url: string; title: string }) =>
    api.post<SavedMusicLink>('/api/music-links', body),
  remove: (id: number) => api.del<void>(`/api/music-links/${id}`),
};

export function useMusicFavorites(enabled = true) {
  return useQuery({
    queryKey: MUSIC_LINKS_KEY,
    queryFn: musicApi.list,
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: musicApi.save,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MUSIC_LINKS_KEY }),
  });
}

export function useRemoveFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: musicApi.remove,
    onMutate: (id) => {
      queryClient.setQueryData<SavedMusicLink[]>(MUSIC_LINKS_KEY, (rows) =>
        rows?.filter((row) => row.id !== id)
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: MUSIC_LINKS_KEY }),
  });
}

/**
 * Chuyen danh sach link cu (localStorage cua may nay, 1.14.1) len tai khoan, mot lan.
 * May chu gop link trung, nen chay lai (vd. lan truoc dut mang giua chung) khong sinh
 * dong thua. Link bi tu choi (400: qua gioi han, du lieu cu hong) thi bo qua.
 */
export async function importLegacyMusicLinks(): Promise<boolean> {
  const legacy = readLegacyMusicLinks();
  if (legacy.length === 0) return false;
  for (const item of [...legacy].reverse()) {
    try {
      await musicApi.save({ url: item.url, title: item.title.slice(0, 60) || 'Nhạc' });
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) continue;
      return false;
    }
  }
  clearLegacyMusicLinks();
  return true;
}
