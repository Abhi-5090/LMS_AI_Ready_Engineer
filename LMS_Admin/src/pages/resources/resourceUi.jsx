import { BookOpen, Film, Link2 } from 'lucide-react';
import { ResourceType } from '@/shared';

/** Shared type metadata for the Resources section (order = display order). */
export const RES_TYPES = [
  { value: ResourceType.VIDEO, label: 'Videos', single: 'Video', Icon: Film },
  { value: ResourceType.ARTICLE, label: 'Articles', single: 'Article', Icon: BookOpen },
  { value: ResourceType.LINK, label: 'Links', single: 'Link', Icon: Link2 },
];

export const resTypeMeta = (type) => RES_TYPES.find((t) => t.value === type) ?? RES_TYPES[0];

/** Convert a YouTube/Vimeo watch URL to an embeddable player URL, or null. */
export function embedUrl(url = '') {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
}
