import { expect, it } from 'vitest';
import { change, fillDays, formatDuration, hourLabel, monthRange, periodRange, toCSV } from './reports';

it('builds whole-day rolling periods and calendar months', () => {
  const now = new Date(2026, 10, 4, 15, 30);
  const week = periodRange('7d', now);
  expect(week.from).toEqual(new Date(2026, 9, 29));
  expect(week.to).toBe(now);
  expect(periodRange('last_month', now)).toEqual({ from: new Date(2026, 9, 1), to: new Date(2026, 10, 1) });
  expect(periodRange('this_month', now).from).toEqual(new Date(2026, 10, 1));
  expect(monthRange('2026-12')).toEqual({ from: new Date(2026, 11, 1), to: new Date(2027, 0, 1) });
  expect(() => monthRange('2026-13')).toThrow();
});

it('compares with the previous period only when there is one', () => {
  expect(change(150, 100)).toBe(50);
  expect(change(50, 100)).toBe(-50);
  expect(change(10, 0)).toBeNull();
});

it('formats durations and hours for tiles', () => {
  expect(formatDuration(45)).toBe('45 min');
  expect(formatDuration(90)).toBe('1.5 h');
  expect(hourLabel(0)).toBe('12 am');
  expect(hourLabel(20)).toBe('8 pm');
  expect(hourLabel(null)).toBe('—');
});

it('writes CSV with quoting', () => {
  const csv = toCSV([{ name: 'News, "Live"', minutes: 30 }, { name: 'Plain', minutes: null }],
    [{ key: 'name', label: 'Name' }, { key: 'minutes', label: 'Minutes' }, { label: 'Hours', value: r => (r.minutes || 0) / 60 }]);
  expect(csv).toBe('Name,Minutes,Hours\r\n"News, ""Live""",30,0.5\r\nPlain,,0\r\n');
});

it('fills days with no plays', () => {
  const days = fillDays([{ day: '2026-11-02', live_minutes: 5 }], new Date(2026, 10, 1), new Date(2026, 10, 3, 12));
  expect(days.map(d => d.day)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
  expect(days[1].live_minutes).toBe(5);
});
