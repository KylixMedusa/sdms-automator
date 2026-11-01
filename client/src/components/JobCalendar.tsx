import { useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { DateSelectArg, DayCellContentArg, EventContentArg, EventInput } from '@fullcalendar/core';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { addOptimisticJob, prefetchCalendarJobs, useCalendarJobs } from '../hooks/useCalendarJobs';
import { createJob } from '../api/client';
import type { CalendarJob, JobType } from '../types';
import { addDays, dayCount, formatMonth, formatRange, monthWeeks, toISODate, todayISO } from '../lib/dates';
import { dayOutcome, jobOutcome, outcomeStyle, type Outcome } from '../lib/jobStatus';
import ReturnNewOrderModal from './ReturnNewOrderModal';
import ReturnSettingsModal from './ReturnSettingsModal';
import JobDetailDrawer from './JobDetailDrawer';
import MiniSpinner from './MiniSpinner';
import { NAV_WIDTH } from '../lib/layout';

interface JobCalendarProps {
  jobType: JobType;
  title: string;
}

interface Range {
  start: string;
  end: string; // inclusive
}

const LIST_LIMIT = 8;

function monthRange(year: number, month: number) {
  const weeks = monthWeeks(year, month);
  return { from: weeks[0][0], to: addDays(weeks[weeks.length - 1][6], 1) };
}

function shiftView(view: { year: number; month: number }, delta: number) {
  const d = new Date(view.year, view.month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

function runLabel(job: CalendarJob, outcome: Outcome): string {
  const { total, failed } = job.counts;
  const orders = total === 0 ? 'no orders' : `${total} order${total === 1 ? '' : 's'}`;
  switch (outcome) {
    case 'running':
      return job.cancelRequested ? 'Stopping' : total ? `Running, ${orders}` : 'Running';
    case 'queued':
      return 'Queued';
    case 'stopped':
      return total ? `Stopped at ${orders}` : 'Stopped';
    case 'attention':
      return failed ? `${failed} of ${total} failed` : 'Failed';
    default:
      return job.filtered ? `Retried ${orders}` : total === 0 ? 'No orders' : orders;
  }
}

// Consecutive past days with nothing done yet, grouped into runnable ranges.
function leftToRun(days: string[], outcomeOf: (d: string) => Outcome | null): Range[] {
  const ranges: Range[] = [];
  for (const day of days) {
    const o = outcomeOf(day);
    if (o !== null && o !== 'stopped') continue;
    const last = ranges[ranges.length - 1];
    if (last && addDays(last.end, 1) === day) last.end = day;
    else ranges.push({ start: day, end: day });
  }
  return ranges;
}

const primaryButton = 'btn btn-gold h-10 px-4 text-sm';
const quietButton = 'btn btn-quiet h-10 px-3 text-sm';
const goldButton = 'btn btn-gold h-9 px-4 text-sm';

export default function JobCalendar({ jobType, title }: JobCalendarProps) {
  const isDesktop = useMediaQuery('(min-width: 640px)');
  const isWide = useMediaQuery('(min-width: 1180px)');
  const today = todayISO();
  const calendarRef = useRef<FullCalendar>(null);

  const [view, setView] = useState(() => ({ year: new Date().getFullYear(), month: new Date().getMonth() }));
  const [selection, setSelection] = useState<Range | null>(null);
  const [openJob, setOpenJob] = useState<CalendarJob | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [showAllRuns, setShowAllRuns] = useState(false);

  const { from, to } = monthRange(view.year, view.month);
  const monthPrefix = `${view.year}-${String(view.month + 1).padStart(2, '0')}`;
  const monthStart = `${monthPrefix}-01`;
  const nextMonthStart = toISODate(new Date(view.year, view.month + 1, 1));
  const { jobs, loaded, failed, refresh } = useCalendarJobs(jobType, from, to);

  const hasActive = jobs.some((j) => j.status === 'pending' || j.status === 'running');
  useEffect(() => {
    const timer = setInterval(refresh, hasActive ? 4000 : 30000);
    return () => clearInterval(timer);
  }, [refresh, hasActive]);

  useEffect(() => {
    if (!loaded) return;
    const prev = shiftView(view, -1);
    const p = monthRange(prev.year, prev.month);
    prefetchCalendarJobs(jobType, p.from, p.to);
    prefetchCalendarJobs(jobType === 'return' ? 'cancel' : 'return', from, to);
  }, [loaded, view, jobType, from, to]);

  useEffect(() => {
    calendarRef.current?.getApi().gotoDate(monthStart);
    setSelection(null);
    setShowAllRuns(false);
  }, [monthStart]);

  const jobsByDay = useMemo(() => {
    const map = new Map<string, CalendarJob[]>();
    for (const job of jobs) {
      for (let d = job.fromDate > from ? job.fromDate : from; d < job.toDate && d < to; d = addDays(d, 1)) {
        map.set(d, [...(map.get(d) ?? []), job]);
      }
    }
    return map;
  }, [jobs, from, to]);

  const outcomeOf = (day: string) => dayOutcome(jobsByDay.get(day) ?? []);

  const pastDaysInMonth = useMemo(() => {
    const days: string[] = [];
    for (let d = monthStart; d < nextMonthStart && d <= today; d = addDays(d, 1)) days.push(d);
    return days;
  }, [monthStart, nextMonthStart, today]);

  const tally = { done: 0, attention: 0, active: 0, left: 0 };
  for (const day of pastDaysInMonth) {
    const o = outcomeOf(day);
    if (o === 'done') tally.done++;
    else if (o === 'attention') tally.attention++;
    else if (o === 'running' || o === 'queued') tally.active++;
    else tally.left++;
  }
  const toRun = leftToRun(pastDaysInMonth.filter((d) => d < today), outcomeOf);

  const events: EventInput[] = useMemo(
    () =>
      jobs.map((job) => ({
        id: String(job.id),
        start: job.fromDate,
        end: job.toDate,
        allDay: true,
        extendedProps: { job, outcome: jobOutcome(job) },
      })),
    [jobs],
  );

  // Programmatic api.select() also fires `select`; those carry no jsEvent and are ignored.
  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    if (selection) api.select({ start: selection.start, end: addDays(selection.end, 1), allDay: true });
    else api.unselect();
  }, [selection]);

  const handleSelect = (info: DateSelectArg) => {
    if (!info.jsEvent) return;
    const start = toISODate(info.start);
    const end = addDays(toISODate(info.end), -1);
    setActionError('');
    setSelection((current) =>
      current && current.start === start && current.end === end ? null : { start, end },
    );
  };

  const run = async (range: Range) => {
    const key = `${range.start}:${range.end}`;
    setSubmitting(key);
    setActionError('');
    try {
      const toDate = addDays(range.end, 1);
      const created = await createJob(range.start, jobType, JSON.stringify({ toDate }));
      addOptimisticJob(jobType, {
        id: created.id,
        status: 'pending',
        fromDate: range.start,
        toDate,
        filtered: false,
        cancelRequested: false,
        errorMessage: null,
        hasScreenshot: false,
        counts: { total: 0, done: 0, alreadyDone: 0, failed: 0, verified: 0 },
        createdAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
      });
      setSelection(null);
      refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `Couldn't start the ${jobType}`);
    } finally {
      setSubmitting(null);
    }
  };

  const listedRuns = jobs
    .filter((j) =>
      selection ? j.fromDate <= selection.end && j.toDate > selection.start : j.fromDate < nextMonthStart && j.toDate > monthStart,
    )
    .sort((a, b) => b.id - a.id);

  const selectionDays = selection ? dayCount(selection.start, addDays(selection.end, 1)) : 0;
  const selectionDone = selection
    ? Array.from({ length: selectionDays }, (_, i) => addDays(selection.start, i)).filter((d) => outcomeOf(d) === 'done').length
    : 0;
  const isCurrentMonth = monthPrefix === today.slice(0, 7);

  const calendar = (
    <div
      className={isWide ? 'sheet overflow-hidden h-full min-h-0' : 'sheet overflow-hidden'}
      style={{ border: '1px solid var(--line)', borderRadius: 12, backgroundColor: 'var(--tile)' }}
    >
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        initialDate={monthStart}
        headerToolbar={false}
        firstDay={1}
        fixedWeekCount={false}
        height={isWide ? '100%' : 'auto'}
        events={events}
        eventOrder="start,-duration,-id"
        dayMaxEvents={isWide ? true : isDesktop ? 3 : 2}
        moreLinkContent={(arg) => `+${arg.num} more`}
        eventClassNames={(arg) => ['run', `run-${arg.event.extendedProps.outcome as Outcome}`]}
        eventContent={(arg: EventContentArg) => {
          const job = arg.event.extendedProps.job as CalendarJob;
          const outcome = arg.event.extendedProps.outcome as Outcome;
          return (
            <div className="run-band" title={`Job #${job.id}, ${formatRange(job.fromDate, job.toDate)}: ${runLabel(job, outcome)}`}>
              {runLabel(job, outcome)}
            </div>
          );
        }}
        eventClick={(arg) => setOpenJob(arg.event.extendedProps.job as CalendarJob)}
        dayHeaderContent={(arg) => arg.date.toLocaleDateString('en-GB', { weekday: isDesktop ? 'short' : 'narrow' })}
        dayCellClassNames={(arg) => {
          const day = toISODate(arg.date);
          if (day > today) return ['day-future'];
          const o = outcomeOf(day);
          return o ? [`day-${o}`] : [];
        }}
        dayCellContent={(arg: DayCellContentArg) => {
          const day = toISODate(arg.date);
          const o = day > today ? null : outcomeOf(day);
          return (
            <div className="day-head">
              <span className={day === today ? 'day-num day-num-today' : 'day-num'}>{arg.date.getDate()}</span>
              {o && <span className={`stamp stamp-${o}`} />}
            </div>
          );
        }}
        selectable
        unselectAuto={false}
        selectLongPressDelay={150}
        selectAllow={(span) => addDays(toISODate(span.end), -1) <= today}
        select={handleSelect}
      />
    </div>
  );

  const sectionTitle = (text: string) => (
    <h2>{text}</h2>
  );

  const skeleton = failed ? (
    <p className="text-sm" style={{ color: 'var(--muted)' }}>Not loaded.</p>
  ) : (
    <div className="flex flex-col gap-4 pt-2" aria-hidden>
      {[70, 50, 60].map((w) => (
        <div key={w} className="skeleton-row" style={{ width: `${w}%` }} />
      ))}
    </div>
  );

  // Side by side, the screen fills the viewport and only the run list scrolls.
  const scrollRuns = isWide;
  const visibleRuns = scrollRuns || showAllRuns ? listedRuns : listedRuns.slice(0, LIST_LIMIT);

  const sidePanel = (
    <div
      className={scrollRuns ? 'h-full min-h-0 flex flex-col gap-4' : 'flex flex-col gap-4'}
    >
      <section className="side-card flex-shrink-0">
        {sectionTitle('Left to run')}
        {!loaded ? (
          skeleton
        ) : toRun.length === 0 ? (
          <p className="text-sm pb-2" style={{ color: 'var(--muted)' }}>
            {pastDaysInMonth.length > 1 ? 'Every day up to yesterday has a run.' : 'No past days in this month yet.'}
          </p>
        ) : (
          <ul className="flex flex-col">
            {toRun.map((range) => {
              const days = dayCount(range.start, addDays(range.end, 1));
              const key = `${range.start}:${range.end}`;
              return (
                <li key={key} className="side-row flex items-center gap-3 py-2 px-1">
                  <button
                    onClick={() => setSelection(range)}
                    className="flex-1 text-left"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    <span className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{formatRange(range.start, addDays(range.end, 1))}</span>
                    <span className="text-sm ml-2" style={{ color: 'var(--muted)' }}>{days} day{days === 1 ? '' : 's'}</span>
                  </button>
                  <button
                    onClick={() => run(range)}
                    disabled={submitting !== null}
                    className="btn btn-quiet h-8 px-3 text-[13px]"
                  >
                    {submitting === key ? <MiniSpinner label="Starting run" /> : 'Run'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={scrollRuns ? 'side-card flex flex-col min-h-0' : 'side-card'}>
        {sectionTitle(selection ? `Runs covering ${formatRange(selection.start, addDays(selection.end, 1))}` : 'Runs this month')}
        {!loaded ? (
          skeleton
        ) : listedRuns.length === 0 ? (
          <p className="text-sm pb-2" style={{ color: 'var(--muted)' }}>
            {selection ? 'Nothing has run for these days yet.' : `No ${jobType} runs in ${formatMonth(view.year, view.month)}.`}
          </p>
        ) : (
          <ul className={scrollRuns ? 'run-scroll flex flex-col overflow-y-auto min-h-0 -mx-2 px-2 pb-6' : 'flex flex-col'}>
            {visibleRuns.map((job) => {
              const outcome = jobOutcome(job);
              return (
                <li key={job.id}>
                  <button
                    onClick={() => setOpenJob(job)}
                    className="side-row w-full flex items-center gap-3 py-2.5 px-1 text-left"
                    style={{ border: 'none', cursor: 'pointer' }}
                  >
                    <span className={`stamp stamp-${outcome}`} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold" style={{ color: 'var(--ink)' }}>
                        {formatRange(job.fromDate, job.toDate)}
                      </span>
                      <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                        Job #{job.id}, {new Date(job.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </span>
                    <span className="text-xs font-bold text-right" style={{ color: outcomeStyle[outcome].fg }}>
                      {runLabel(job, outcome)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {!scrollRuns && listedRuns.length > LIST_LIMIT && (
          <button
            onClick={() => setShowAllRuns(!showAllRuns)}
            className="mt-1 mb-2 text-[13px] font-bold"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink)', padding: 0, textDecoration: 'underline' }}
          >
            {showAllRuns ? 'Show fewer' : `Show all ${listedRuns.length} runs`}
          </button>
        )}
      </section>
    </div>
  );

  return (
    <div
      className={isWide ? 'h-screen flex flex-col overflow-hidden px-8 pt-8' : 'px-4 sm:px-8 pt-5 sm:pt-8'}
      style={{ paddingBottom: selection ? (isWide ? 104 : 140) : isWide ? 24 : 32 }}
    >
      <header className="flex items-start justify-between gap-4 mb-5 flex-wrap flex-shrink-0">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="display text-[32px] sm:text-[44px] leading-none mr-1 whitespace-nowrap" style={{ color: 'var(--ink)' }}>
              {formatMonth(view.year, view.month)}
            </h1>
            <button onClick={() => setView((v) => shiftView(v, -1))} className="chev text-xl" aria-label="Previous month">‹</button>
            <button onClick={() => setView((v) => shiftView(v, 1))} className="chev text-xl" aria-label="Next month">›</button>
            {!isCurrentMonth && (
              <button
                onClick={() => setView({ year: new Date().getFullYear(), month: new Date().getMonth() })}
                className="btn btn-quiet h-8 px-2.5 text-[13px] ml-1 whitespace-nowrap"
              >
                {isDesktop ? 'This month' : 'Now'}
              </button>
            )}
          </div>
          <p className="text-sm mt-2 flex items-center gap-2 min-h-5" style={{ color: 'var(--muted)' }}>
            {failed ? (
              <>
                <span style={{ color: 'var(--fail)' }}>Couldn't load {jobType} runs. Check the connection.</span>
                <button onClick={refresh} className="font-bold underline" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink)', padding: 0 }}>
                  Try again
                </button>
              </>
            ) : !loaded ? (
              <>
                <MiniSpinner size={12} />
                Loading {jobType} runs…
              </>
            ) : (
              <span>
                {title}: <strong style={{ color: 'var(--done)' }}>{tally.done} of {pastDaysInMonth.length} day{pastDaysInMonth.length === 1 ? '' : 's'} done</strong>
                {tally.attention > 0 && <>, <strong style={{ color: 'var(--fail)' }}>{tally.attention} need a look</strong></>}
                {tally.active > 0 && <>, <strong style={{ color: 'var(--run)' }}>{tally.active} in progress</strong></>}
                {tally.left > 0 && <>, {tally.left} not run</>}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setSettingsOpen(true)} className={quietButton}>
            {title} settings
          </button>
          <button onClick={() => { setSelection(null); setOptionsOpen(true); }} className={primaryButton}>
            New {jobType}
          </button>
        </div>
      </header>

      <div
        className={isWide ? 'grid gap-8 flex-1 min-h-0' : 'flex flex-col gap-8'}
        style={isWide ? { gridTemplateColumns: 'minmax(0, 1fr) 320px' } : undefined}
      >
        {calendar}
        {sidePanel}
      </div>

      {selection && (
        <div
          className="fixed z-20 px-4"
          style={{ left: isDesktop ? NAV_WIDTH : 0, right: 0, bottom: isDesktop ? 24 : 'calc(68px + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="selection-bar mx-auto max-w-2xl flex items-center gap-3 flex-wrap py-3 pl-5 pr-3">
            <div className="flex-1 min-w-[150px]">
              <div className="text-[15px] font-bold" style={{ color: '#FFFFFF' }}>
                {formatRange(selection.start, addDays(selection.end, 1))}
                <span className="font-normal" style={{ color: 'rgba(255, 255, 255, 0.72)' }}>, {selectionDays} day{selectionDays === 1 ? '' : 's'}</span>
              </div>
              {selectionDone > 0 && !actionError && (
                <div className="text-xs" style={{ color: 'rgba(255, 255, 255, 0.72)' }}>
                  {selectionDone === selectionDays ? 'Already done.' : `${selectionDone} already done.`} Done orders are re-checked, not redone.
                </div>
              )}
              {actionError && <div className="text-xs" style={{ color: '#F6A89E' }}>{actionError}</div>}
            </div>
            <button onClick={() => setSelection(null)} className="h-9 px-3 text-sm font-bold" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255, 255, 255, 0.72)' }}>
              Clear
            </button>
            <button onClick={() => setOptionsOpen(true)} className="btn h-9 px-3 text-sm" style={{ background: 'var(--bar-soft)', color: '#FFFFFF', border: 'none' }}>
              Options
            </button>
            <button
              onClick={() => run(selection)}
              disabled={submitting !== null}
              className={goldButton}
            >
              {submitting ? <MiniSpinner label="Starting run" /> : `Run ${jobType}`}
            </button>
          </div>
        </div>
      )}

      <ReturnNewOrderModal
        isOpen={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        onCreated={() => { setSelection(null); refresh(); }}
        jobType={jobType}
        initialFrom={selection?.start}
        initialLast={selection?.end}
      />
      <ReturnSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <JobDetailDrawer initial={openJob} jobType={jobType} onClose={() => setOpenJob(null)} onChanged={refresh} />
    </div>
  );
}
