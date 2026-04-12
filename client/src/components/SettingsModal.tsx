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
  Spinner,
} from '@heroui/react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { getCashMemoSettings, updateCashMemoSettings } from '../api/client';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [toolUrl, setToolUrl] = useState('');
  const [toolUsername, setToolUsername] = useState('');
  const [toolPassword, setToolPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 640px)');

  // Track original values to detect changes
  const originalRef = useRef({ toolUrl: '', toolUsername: '', toolPassword: '' });

  const hasChanges =
    toolUrl !== originalRef.current.toolUrl ||
    toolUsername !== originalRef.current.toolUsername ||
    toolPassword !== originalRef.current.toolPassword;

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setFetching(true);
    setError('');
    setSuccess(false);
    getCashMemoSettings()
      .then((s) => {
        if (cancelled) return;
        setToolUrl(s.toolUrl);
        setToolUsername(s.toolUsername);
        setToolPassword(s.toolPassword);
        originalRef.current = { toolUrl: s.toolUrl, toolUsername: s.toolUsername, toolPassword: s.toolPassword };
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
    setToolUrl(originalRef.current.toolUrl);
    setToolUsername(originalRef.current.toolUsername);
    setToolPassword(originalRef.current.toolPassword);
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
      if (toolUrl !== originalRef.current.toolUrl) updates.toolUrl = toolUrl;
      if (toolUsername !== originalRef.current.toolUsername) updates.toolUsername = toolUsername;
      if (toolPassword !== originalRef.current.toolPassword) updates.toolPassword = toolPassword;

      await updateCashMemoSettings(updates);
      originalRef.current = { toolUrl, toolUsername, toolPassword };
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
      <Spinner size="lg" color="current" />
    </div>
  ) : (
    <div className="flex flex-col gap-5">
      <div>
        <label
          className="text-[10px] font-bold uppercase tracking-widest mb-2 block"
          style={{ color: '#8a7266' }}
        >
          Portal URL
        </label>
        <Input
          value={toolUrl}
          onChange={(e) => setToolUrl(e.target.value)}
          placeholder="https://sdms-portal.example.com"
          fullWidth
          className="min-h-[48px] text-sm w-full"
        />
      </div>
      <div>
        <label
          className="text-[10px] font-bold uppercase tracking-widest mb-2 block"
          style={{ color: '#8a7266' }}
        >
          Username
        </label>
        <Input
          value={toolUsername}
          onChange={(e) => setToolUsername(e.target.value)}
          placeholder="Enter username"
          fullWidth
          className="min-h-[48px] text-sm w-full"
        />
      </div>
      <div>
        <label
          className="text-[10px] font-bold uppercase tracking-widest mb-2 block"
          style={{ color: '#8a7266' }}
        >
          Password
        </label>
        <div className="flex gap-2">
          <Input
            value={toolPassword}
            onChange={(e) => setToolPassword(e.target.value)}
            placeholder="Enter password"
            type={showPassword ? 'text' : 'password'}
            fullWidth
            className="min-h-[48px] text-sm w-full flex-1"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="w-12 h-12 flex items-center justify-center flex-shrink-0"
            style={{
              backgroundColor: '#f5f3ef',
              borderRadius: '1rem',
              border: 'none',
              cursor: 'pointer',
              color: '#8a7266',
            }}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div
          className="text-sm px-3 py-2"
          style={{ color: '#ba1a1a', backgroundColor: '#ffdad6', borderRadius: '0.75rem' }}
        >
          {error}
        </div>
      )}
      {success && (
        <div
          className="text-sm px-3 py-2"
          style={{ color: '#1a6b37', backgroundColor: '#d4f5e0', borderRadius: '0.75rem' }}
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
          backgroundColor: '#f5f3ef',
          color: '#564338',
          borderRadius: '3rem',
          border: 'none',
        }}
      >
        Cancel
      </Button>
      <Button
        onPress={handleSave}
        isDisabled={loading}
        className="flex-1 font-semibold text-white text-base transition-transform active:scale-[0.98] min-h-[52px]"
        style={{
          background: loading ? '#8a7266' : 'linear-gradient(135deg, #974400, #bb5808)',
          borderRadius: '3rem',
          border: 'none',
        }}
      >
        {loading ? <Spinner size="sm" color="current" /> : 'Save'}
      </Button>
    </div>
  ) : (
    <Button
      onPress={handleCancel}
      className="w-full font-semibold text-base min-h-[52px]"
      style={{
        backgroundColor: '#f5f3ef',
        color: '#564338',
        borderRadius: '3rem',
        border: 'none',
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
            <ModalDialog className="bg-white" style={{ borderRadius: '1.5rem' }}>
              <ModalHeader
                className="text-lg font-bold"
                style={{ color: '#1b1c1a', fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                Cash Memo Settings
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
            className="bg-white max-h-[85vh]"
            style={{ borderTopLeftRadius: '1.5rem', borderTopRightRadius: '1.5rem' }}
          >
            <div className="w-10 h-1 rounded-full mx-auto mt-3" style={{ backgroundColor: '#e4e2de' }} />
            <DrawerHeader
              className="text-lg font-bold"
              style={{ color: '#1b1c1a', fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              Cash Memo Settings
            </DrawerHeader>
            <DrawerBody className="overflow-visible">{formContent}</DrawerBody>
            <DrawerFooter>{footerButtons}</DrawerFooter>
          </DrawerDialog>
        </DrawerContent>
      </DrawerBackdrop>
    </Drawer>
  );
}
