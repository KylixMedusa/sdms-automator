export default function MiniSpinner({ size = 14, label = 'Loading' }: { size?: number; label?: string }) {
  return <span className="mini-spinner" style={{ width: size, height: size }} role="status" aria-label={label} />;
}
