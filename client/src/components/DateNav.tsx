import { useState } from 'react';
import {
  Calendar,
  CalendarHeader,
  CalendarHeading,
  CalendarNavButton,
  CalendarGrid,
  CalendarGridHeader,
  CalendarGridBody,
  CalendarHeaderCell,
  CalendarCell,
} from '@heroui/react';
import { today, getLocalTimeZone, CalendarDate } from '@internationalized/date';
import type { DateValue } from 'react-aria-components';

interface DateNavProps {
  date: Date;
  onPrev: () => void;
  onNext: () => void;
  onDateChange: (date: Date) => void;
  canGoNext: boolean;
}

function formatDateLabel(date: Date): string {
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const diffMs = todayDate.getTime() - target.getTime();
  const diffDays = Math.round(diffMs / 86400000);

  if (diffDays === 0) {
    return `Today, ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }
  if (diffDays === 1) {
    return `Yesterday, ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }

  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function toCalendarDate(date: Date): CalendarDate {
  return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function fromCalendarDate(cd: DateValue): Date {
  return new Date(cd.year, cd.month - 1, cd.day);
}

export default function DateNav({ date, onPrev, onNext, onDateChange, canGoNext }: DateNavProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const maxDate = today(getLocalTimeZone());

  const handleCalendarChange = (value: DateValue) => {
    onDateChange(fromCalendarDate(value));
    setCalendarOpen(false);
  };

  return (
    <div
      className="mx-4 mb-4 px-4 py-3 flex items-center justify-between"
      style={{ backgroundColor: '#f5f3ef', borderRadius: '1.5rem' }}
    >
      <button
        onClick={onPrev}
        className="w-11 h-11 flex items-center justify-center"
        style={{
          backgroundColor: '#efeeea',
          borderRadius: '1rem',
          border: 'none',
          cursor: 'pointer',
          color: '#1b1c1a',
        }}
        aria-label="Previous day"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="text-center relative">
        <div
          className="text-[10px] font-semibold uppercase tracking-widest mb-0.5"
          style={{ color: '#8a7266' }}
        >
          Current Period
        </div>
        <button
          onClick={() => setCalendarOpen(!calendarOpen)}
          className="text-sm font-semibold flex items-center gap-1.5 min-h-[28px] px-2 rounded-lg transition-colors"
          style={{
            color: '#1b1c1a',
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            border: 'none',
            cursor: 'pointer',
            backgroundColor: calendarOpen ? '#e4e2de' : 'transparent',
          }}
        >
          {formatDateLabel(date)}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8a7266" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </button>

        {calendarOpen && (
          <div
            className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50"
            style={{
              borderRadius: '1.5rem',
              backgroundColor: '#ffffff',
              boxShadow: '0 12px 32px rgba(86, 67, 56, 0.15)',
              padding: '12px',
            }}
          >
            <Calendar
              value={toCalendarDate(date)}
              onChange={handleCalendarChange}
              maxValue={maxDate}
            >
              <CalendarHeader className="flex items-center justify-between px-2 pb-2">
                <CalendarNavButton slot="previous" />
                <CalendarHeading className="text-sm font-semibold" style={{ color: '#1b1c1a' }} />
                <CalendarNavButton slot="next" />
              </CalendarHeader>
              <CalendarGrid>
                <CalendarGridHeader>
                  {(day) => <CalendarHeaderCell>{day}</CalendarHeaderCell>}
                </CalendarGridHeader>
                <CalendarGridBody>
                  {(date) => <CalendarCell date={date} />}
                </CalendarGridBody>
              </CalendarGrid>
            </Calendar>
          </div>
        )}

        {/* Click-away overlay */}
        {calendarOpen && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setCalendarOpen(false)}
          />
        )}
      </div>

      <button
        onClick={onNext}
        disabled={!canGoNext}
        className="w-11 h-11 flex items-center justify-center"
        style={{
          backgroundColor: canGoNext ? '#efeeea' : 'transparent',
          borderRadius: '1rem',
          border: 'none',
          cursor: canGoNext ? 'pointer' : 'default',
          color: canGoNext ? '#1b1c1a' : '#ddc1b3',
        }}
        aria-label="Next day"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M7.5 5L12.5 10L7.5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
