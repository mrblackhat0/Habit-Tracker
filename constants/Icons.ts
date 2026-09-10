import { Colors } from './Colors';

export interface HabitIconOption {
  name: string;
  color: string;
}

export const HABIT_ICONS: HabitIconOption[] = [
  { name: 'flame', color: '#F97316' },
  { name: 'water', color: '#0EA5E9' },
  { name: 'book', color: '#8B5CF6' },
  { name: 'barbell', color: '#EF4444' },
  { name: 'bicycle', color: '#10B981' },
  { name: 'moon', color: '#6366F1' },
  { name: 'leaf', color: '#22C55E' },
  { name: 'walk', color: '#F59E0B' },
  { name: 'code-slash', color: '#06B6D4' },
  { name: 'brush', color: '#EC4899' },
  { name: 'musical-notes', color: '#A855F7' },
  { name: 'nutrition', color: '#84CC16' },
  // more relevant
  { name: 'heart', color: '#F43F5E' },
  { name: 'star', color: '#F59E0B' },
  { name: 'trophy', color: '#EAB308' },
  { name: 'alarm', color: '#EF4444' },
  { name: 'calendar', color: '#6366F1' },
  { name: 'school', color: '#0EA5E9' },
  { name: 'briefcase', color: '#64748B' },
  { name: 'cash', color: '#10B981' },
  { name: 'restaurant', color: '#F97316' },
  { name: 'bed', color: '#8B5CF6' },
  { name: 'pulse', color: '#EC4899' },
  { name: 'fitness', color: '#06B6D4' },
  { name: 'cafe', color: '#A16207' },
  { name: 'game-controller', color: '#A855F7' },
  { name: 'bulb', color: '#EAB308' },
  { name: 'medkit', color: '#10B981' },
  { name: 'sunny', color: '#F59E0B' },
  { name: 'create', color: '#6366F1' },
];

export function getIconColor(iconName: string): string {
  const found = HABIT_ICONS.find((ic) => ic.name === iconName);
  return found ? found.color : Colors.primary;
}
