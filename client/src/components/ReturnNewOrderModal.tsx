import { useEffect, useState } from 'react';
import {
  Modal,
  ModalBackdrop,
  ModalContainer,
  ModalDialog,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Drawer,
  DrawerBackdrop,
  DrawerContent,
  DrawerDialog,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  Input,
  Button,
  DateRangePicker,
  DateField,
  RangeCalendar,
  Label,
  Description,
} from '@heroui/react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import MiniSpinner from './MiniSpinner';
import { parseDate } from '@internationalized/date';
import { createJob } from '../api/client';
import { addDays, formatRange, todayISO } from '../lib/dates';

interface ReturnNewOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  jobType?: 'return' | 'cancel';
  initialFrom?: string;
  initialLast?: string; // inclusive
}

function parseOrderList(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))];
}

const textareaStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 72,
  padding: '12px 14px',
  fontSize: 14,
  fontFamily: 'inherit',
  backgroundColor: 'var(--paper)',
  border: 'none',
  borderRadius: '0.75rem',
  outline: 'none',
  resize: 'vertical',
  color: 'var(--ink)',
};

export default function ReturnNewOrderModal({
  isOpen,
  onClose,
  onCreated,
  jobType = 'return',
  initialFrom,
  initialLast,
}: ReturnNewOrderModalProps) {
  const title = jobType === 'cancel' ? 'New Cancel' : 'New Return';
  const [fromDate, setFromDate] = useState(todayISO());
  const [lastDate, setLastDate] = useState(todayISO());
  const [startAfterOrderNumber, setStartAfterOrderNumber] = useState('');
  const [includeText, setIncludeText] = useState('');
  const [excludeText, setExcludeText] = useState('');
  const [useDeliveryBoy, setUseDeliveryBoy] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isDesktop = useMediaQuery('(min-width: 640px)');

  useEffect(() => {
    if (!isOpen) return;
    const from = initialFrom ?? todayISO();
    setFromDate(from);
    setLastDate(initialLast ?? from);
    setStartAfterOrderNumber('');
    setIncludeText('');
    setExcludeText('');
    setUseDeliveryBoy(true);
    setError('');
  }, [isOpen, initialFrom, initialLast]);

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  const handleSubmit = async () => {
    if (!fromDate || !lastDate) {
      setError('Both dates are required');
      return;
    }
    if (lastDate < fromDate) {
      setError("Last date can't be before the first date");
      return;
    }

    const include = parseOrderList(includeText);
    const exclude = parseOrderList(excludeText);

    setLoading(true);
    setError('');

    try {
      const details = JSON.stringify({
        toDate: addDays(lastDate, 1),
        ...(startAfterOrderNumber.trim() ? { startAfterOrderNumber: startAfterOrderNumber.trim() } : {}),
        ...(include.length ? { includeOrderNumbers: include } : {}),
        ...(exclude.length ? { excludeOrderNumbers: exclude } : {}),
        ...(useDeliveryBoy ? {} : { useDeliveryBoy: false }),
      });
      await createJob(fromDate, jobType, details);
      onCreated();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : `Failed to create ${jobType} job`;
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const formContent = (
    <div className="flex flex-col gap-5">
      <DateRangePicker
        className="w-full"
        value={fromDate && lastDate ? { start: parseDate(fromDate), end: parseDate(lastDate) } : null}
        onChange={(range) => {
          if (!range) return;
          setFromDate(range.start.toString());
          setLastDate(range.end.toString());
        }}
        maxValue={parseDate(todayISO())}
        firstDayOfWeek="mon"
        shouldForceLeadingZeros
      >
        <Label className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Order dates</Label>
        <DateField.Group fullWidth className="min-h-[48px]">
          <DateField.Input slot="start">{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
          <DateRangePicker.RangeSeparator />
          <DateField.Input slot="end">{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
          <DateField.Suffix>
            <DateRangePicker.Trigger aria-label="Pick order dates">
              <DateRangePicker.TriggerIndicator />
            </DateRangePicker.Trigger>
          </DateField.Suffix>
        </DateField.Group>
        <Description className="text-xs" style={{ color: 'var(--muted)' }}>
          Both dates are included.
        </Description>
        <DateRangePicker.Popover>
          <RangeCalendar aria-label="Order dates">
            <RangeCalendar.Header>
              <RangeCalendar.Heading />
              <RangeCalendar.NavButton slot="previous" />
              <RangeCalendar.NavButton slot="next" />
            </RangeCalendar.Header>
            <RangeCalendar.Grid>
              <RangeCalendar.GridHeader>
                {(day) => <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>}
              </RangeCalendar.GridHeader>
              <RangeCalendar.GridBody>{(date) => <RangeCalendar.Cell date={date} />}</RangeCalendar.GridBody>
            </RangeCalendar.Grid>
          </RangeCalendar>
        </DateRangePicker.Popover>
      </DateRangePicker>

      <label className="flex items-start gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={useDeliveryBoy}
          onChange={(e) => setUseDeliveryBoy(e.target.checked)}
          className="mt-0.5 w-5 h-5 flex-shrink-0 cursor-pointer"
          style={{ accentColor: 'var(--ink)' }}
        />
        <span>
          <span className="text-sm font-semibold block" style={{ color: 'var(--ink)' }}>
            Filter by delivery boy
          </span>
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            Uses the delivery boy from settings. Untick to search all orders in the date range.
          </span>
        </span>
      </label>

      <div>
        <label
          className="text-sm font-bold mb-2 block"
          style={{ color: 'var(--muted)' }}
        >
          Start After Sales Order # (optional)
        </label>
        <Input
          value={startAfterOrderNumber}
          onChange={(e) => setStartAfterOrderNumber(e.target.value)}
          placeholder="e.g. 2-006030411573"
          fullWidth
          className="min-h-[52px] text-base w-full"
          style={{ fontFamily: 'inherit' }}
        />
        <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
          Skips every order up to and including this one, then processes from there on. Ignored when Include is filled in.
        </p>
      </div>

      <div>
        <label
          className="text-sm font-bold mb-2 block"
          style={{ color: 'var(--muted)' }}
        >
          Include Only (optional)
        </label>
        <textarea
          value={includeText}
          onChange={(e) => setIncludeText(e.target.value)}
          placeholder="One or more sales order #s, separated by commas, spaces or new lines"
          style={textareaStyle}
        />
        <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
          When set, only these orders are processed and the job finishes once they're all handled.
        </p>
      </div>

      <div>
        <label
          className="text-sm font-bold mb-2 block"
          style={{ color: 'var(--muted)' }}
        >
          Exclude (optional)
        </label>
        <textarea
          value={excludeText}
          onChange={(e) => setExcludeText(e.target.value)}
          placeholder="Sales order #s to never touch"
          style={textareaStyle}
        />
      </div>

      {error && (
        <div
          className="text-sm px-3 py-2"
          style={{
            color: 'var(--fail)',
            backgroundColor: 'var(--fail-tint)',
            borderRadius: '0.75rem',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );

  const submitButton = (
    <Button
      onPress={handleSubmit}
      isDisabled={loading}
      className="w-full font-bold text-base transition-transform active:scale-[0.98]"
      style={{
        background: loading ? 'var(--muted)' : 'var(--gold)',
        color: 'var(--ink)',
        borderRadius: 8,
        border: 'none',
        minHeight: '52px',
      }}
    >
      {loading ? (
        <MiniSpinner />
      ) : fromDate && lastDate >= fromDate ? (
        `Run ${jobType} for ${formatRange(fromDate, addDays(lastDate, 1))}`
      ) : (
        'Run'
      )}
    </Button>
  );

  if (isDesktop) {
    return (
      <Modal isOpen={isOpen} onOpenChange={handleOpenChange}>
        <ModalBackdrop className="bg-black/30 backdrop-blur-sm">
          <ModalContainer size="md">
            <ModalDialog style={{ borderRadius: 14, backgroundColor: 'var(--tile)' }}>
              <ModalHeader className="display text-[28px]" style={{ color: 'var(--ink)' }}>
                {title}
              </ModalHeader>
              <ModalBody className="overflow-visible">{formContent}</ModalBody>
              <ModalFooter>{submitButton}</ModalFooter>
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </Modal>
    );
  }

  return (
    <Drawer isOpen={isOpen} onOpenChange={handleOpenChange}>
      <DrawerBackdrop className="bg-black/30 backdrop-blur-sm">
        <DrawerContent placement="bottom">
          <DrawerDialog
            className="max-h-[85vh]"
            style={{ backgroundColor: 'var(--tile)', borderTopLeftRadius: 24, borderTopRightRadius: 24 }}
          >
            <div className="w-10 h-1 rounded-full mx-auto mt-3" style={{ backgroundColor: 'var(--line)' }} />
            <DrawerHeader className="display text-[28px]" style={{ color: 'var(--ink)' }}>
              {title}
            </DrawerHeader>
            <DrawerBody className="overflow-y-auto">{formContent}</DrawerBody>
            <DrawerFooter>{submitButton}</DrawerFooter>
          </DrawerDialog>
        </DrawerContent>
      </DrawerBackdrop>
    </Drawer>
  );
}
