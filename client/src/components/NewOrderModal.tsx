import { useState } from 'react';
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
  Spinner,
} from '@heroui/react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { createJob } from '../api/client';
import type { IdentifierType } from '../types';

interface NewOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function NewOrderModal({ isOpen, onClose, onCreated }: NewOrderModalProps) {
  const [orderNumber, setOrderNumber] = useState('');
  const [identifierType, setIdentifierType] = useState<IdentifierType>('consumer');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isDesktop = useMediaQuery('(min-width: 640px)');

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  const handleSubmit = async () => {
    if (!orderNumber.trim()) {
      setError('Number is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await createJob(orderNumber.trim(), 'cash_memo', identifierType);
      setOrderNumber('');
      setIdentifierType('consumer');
      onCreated();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create order';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const inputLabel = identifierType === 'consumer' ? 'Consumer Number' : 'Phone Number';
  const inputPlaceholder = identifierType === 'consumer' ? 'e.g. 1234567890' : 'e.g. 9876543210';

  const formContent = (
    <div className="flex flex-col gap-5">
      {/* Identifier type segmented control */}
      <div>
        <label
          className="text-[10px] font-bold uppercase tracking-widest mb-2 block"
          style={{ color: '#8a7266' }}
        >
          Lookup Type
        </label>
        <div className="flex rounded-full p-1" style={{ backgroundColor: '#f5f3ef' }}>
          <button
            type="button"
            onClick={() => setIdentifierType('consumer')}
            className="flex-1 py-2.5 px-4 rounded-full text-sm font-semibold transition-all min-h-[44px]"
            style={
              identifierType === 'consumer'
                ? { background: 'linear-gradient(135deg, #974400, #bb5808)', color: 'white' }
                : { background: 'transparent', color: '#564338' }
            }
          >
            Consumer No.
          </button>
          <button
            type="button"
            onClick={() => setIdentifierType('phone')}
            className="flex-1 py-2.5 px-4 rounded-full text-sm font-semibold transition-all min-h-[44px]"
            style={
              identifierType === 'phone'
                ? { background: 'linear-gradient(135deg, #974400, #bb5808)', color: 'white' }
                : { background: 'transparent', color: '#564338' }
            }
          >
            Phone No.
          </button>
        </div>
      </div>

      {/* Number input */}
      <div>
        <label
          className="text-[10px] font-bold uppercase tracking-widest mb-2 block"
          style={{ color: '#8a7266' }}
        >
          {inputLabel}
        </label>
        <Input
          value={orderNumber}
          onChange={(e) => setOrderNumber(e.target.value)}
          placeholder={inputPlaceholder}
          autoFocus
          fullWidth
          className="min-h-[52px] text-base w-full"
          style={{
            fontFamily: "'Plus Jakarta Sans', monospace",
          }}
        />
      </div>

      {error && (
        <div
          className="text-sm px-3 py-2"
          style={{
            color: '#ba1a1a',
            backgroundColor: '#ffdad6',
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
      className="w-full font-semibold text-white text-base transition-transform active:scale-[0.98]"
      style={{
        background: loading ? '#8a7266' : 'linear-gradient(135deg, #974400, #bb5808)',
        borderRadius: '3rem',
        border: 'none',
        minHeight: '56px',
      }}
    >
      {loading ? <Spinner size="sm" color="current" /> : 'Submit Order'}
    </Button>
  );

  if (isDesktop) {
    return (
      <Modal isOpen={isOpen} onOpenChange={handleOpenChange}>
        <ModalBackdrop className="bg-black/30 backdrop-blur-sm">
          <ModalContainer size="md">
            <ModalDialog className="bg-white" style={{ borderRadius: '1.5rem' }}>
              <ModalHeader
                className="text-lg font-bold"
                style={{ color: '#1b1c1a', fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                New Cash Memo
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
            className="bg-white max-h-[85vh]"
            style={{ borderTopLeftRadius: '1.5rem', borderTopRightRadius: '1.5rem' }}
          >
            <div className="w-10 h-1 rounded-full mx-auto mt-3" style={{ backgroundColor: '#e4e2de' }} />
            <DrawerHeader
              className="text-lg font-bold"
              style={{ color: '#1b1c1a', fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              New Cash Memo
            </DrawerHeader>
            <DrawerBody className="overflow-visible">{formContent}</DrawerBody>
            <DrawerFooter>{submitButton}</DrawerFooter>
          </DrawerDialog>
        </DrawerContent>
      </DrawerBackdrop>
    </Drawer>
  );
}
