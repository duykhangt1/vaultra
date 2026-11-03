import { Button, Input } from '@/ui';

export type Hours = Record<string, [string, string]>;
export const WEEK: [string, string][] = [['mon', 'Thứ 2'], ['tue', 'Thứ 3'], ['wed', 'Thứ 4'], ['thu', 'Thứ 5'], ['fri', 'Thứ 6'], ['sat', 'Thứ 7'], ['sun', 'Chủ nhật']];
export const hoursError = (h: Hours) => Object.entries(h).filter(([, [a, b]]) => !a || !b || a >= b).map(([d]) => WEEK.find(([k]) => k === d)?.[1]).join(', ');
