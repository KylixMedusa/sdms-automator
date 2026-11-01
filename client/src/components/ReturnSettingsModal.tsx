import { useState, useEffect, useRef } from 'react';
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
} from '@heroui/react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import MiniSpinner from './MiniSpinner';
import { getReturnSettings, updateReturnSettings } from '../api/client';

interface ReturnSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ReturnSettingsModal({ isOpen, onClose }: ReturnSettingsModalProps) {
  const [deliveryBoy, setDeliveryBoy] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 640px)');

  const originalRef = useRef({ deliveryBoy: '', reason: '' });

  const hasChanges =
    deliveryBoy !== originalRef.current.deliveryBoy ||
    reason !== originalRef.current.reason;

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setFetching(true);
    setError('');
    setSuccess(false);
    getReturnSettings()
      .then((s) => {
        if (cancelled) return;
        setDeliveryBoy(s.deliveryBoy);
        setReason(s.reason);
        originalRef.current = { deliveryBoy: s.deliveryBoy, reason: s.reason };
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load settings');
      })
      .finally(() => {
        if (!cancelled) setFetching(false);
      });
    return () => { cancelled = true; };
  }, [isOpen]);

  const handleOpenChange = (open: boolean) => {
    if (!open) handleCancel();
  };

  const handleCancel = () => {
    setDeliveryBoy(originalRef.current.deliveryBoy);
    setReason(originalRef.current.reason);
    setError('');
    setSuccess(false);
    onClose();
  };

  const handleSave = async () => {
    setLoading(true);
    setError('');
    setSuccess(false);
    try {
      const updates: Record<string, string> = {};
      if (deliveryBoy !== originalRef.current.deliveryBoy) updates.deliveryBoy = deliveryBoy;
      if (reason !== originalRef.current.reason) updates.reason = reason;

      await updateReturnSettings(updates);
      originalRef.current = { deliveryBoy, reason };
      setSuccess(true);
      setTimeout(() => onClose(), 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  const formContent = fetching ? (
    <div className="flex items-center justify-center py-8">
      <MiniSpinner size={20} />
    </div>
  ) : (
    <div className="flex flex-col gap-5">
      <div>
        <label
          className="text-sm font-bold mb-2 block"
          style={{ color: 'var(--muted)' }}
        >
          Delivery Boy
        </label>
        <Input
          value={deliveryBoy}
          onChange={(e) => setDeliveryBoy(e.target.value)}
          placeholder="Enter delivery boy value"
          fullWidth
          className="min-h-[48px] text-sm w-full"
        />
      </div>
      <div>
        <label
          className="text-sm font-bold mb-2 block"
          style={{ color: 'var(--muted)' }}
        >
          Return Reason
        </label>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Enter return reason"
          fullWidth
          className="min-h-[48px] text-sm w-full"
        />
      </div>

      {error && (
        <div
          className="text-sm px-3 py-2"
          style={{ color: 'var(--fail)', backgroundColor: 'var(--fail-tint)', borderRadius: '0.75rem' }}
        >
          {error}
        </div>
      )}
      {success && (
        <div
          className="text-sm px-3 py-2"
          style={{ color: 'var(--done)', backgroundColor: 'var(--done-tint)', borderRadius: '0.75rem' }}
        >
          Settings saved
        </div>
      )}
    </div>
  );

  const footerButtons = hasChanges ? (
    <div className="flex gap-3 w-full">
      <Button
        onPress={handleCancel}
        className="flex-1 font-semibold text-base min-h-[52px]"
        style={{
          backgroundColor: 'var(--tile)',
          color: 'var(--ink)',
          borderRadius: 8,
          border: '1px solid var(--line)',
        }}
      >
        Cancel
      </Button>
      <Button
        onPress={handleSave}
        isDisabled={loading}
        className="flex-1 font-bold text-base transition-transform active:scale-[0.98] min-h-[52px]"
        style={{
          background: loading ? 'var(--muted)' : 'var(--gold)',
          color: 'var(--ink)',
          borderRadius: 8,
          border: 'none',
        }}
      >
        {loading ? <MiniSpinner /> : 'Save'}
      </Button>
    </div>
  ) : (
    <Button
      onPress={handleCancel}
      className="w-full font-semibold text-base min-h-[52px]"
      style={{
        backgroundColor: 'var(--tile)',
        color: 'var(--ink)',
        borderRadius: 8,
        border: '1px solid var(--line)',
      }}
    >
      Close
    </Button>
  );

  if (isDesktop) {
    return (
      <Modal isOpen={isOpen} onOpenChange={handleOpenChange}>
        <ModalBackdrop className="bg-black/30 backdrop-blur-sm">
          <ModalContainer size="md">
            <ModalDialog style={{ borderRadius: 14, backgroundColor: 'var(--tile)' }}>
              <ModalHeader className="display text-[28px]" style={{ color: 'var(--ink)' }}>
                Return settings
              </ModalHeader>
              <ModalBody className="overflow-visible">{formContent}</ModalBody>
              <ModalFooter>{footerButtons}</ModalFooter>
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
            style={{ backgroundColor: 'var(--tile)', borderTopLeftRadius: '1.5rem', borderTopRightRadius: '1.5rem' }}
          >
            <div className="w-10 h-1 rounded-full mx-auto mt-3" style={{ backgroundColor: 'var(--line)' }} />
            <DrawerHeader className="display text-[28px]" style={{ color: 'var(--ink)' }}>
              Return settings
            </DrawerHeader>
            <DrawerBody className="overflow-visible">{formContent}</DrawerBody>
            <DrawerFooter>{footerButtons}</DrawerFooter>
          </DrawerDialog>
        </DrawerContent>
      </DrawerBackdrop>
    </Drawer>
  );
}
