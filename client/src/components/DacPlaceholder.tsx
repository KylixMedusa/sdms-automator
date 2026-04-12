export default function DacPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
        style={{ backgroundColor: '#f5f3ef' }}
      >
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#8a7266"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      </div>
      <h2
        className="text-xl font-bold mb-2"
        style={{ color: '#1b1c1a', fontFamily: 'Plus Jakarta Sans, sans-serif' }}
      >
        Coming Soon
      </h2>
      <p className="text-sm text-center" style={{ color: '#8a7266' }}>
        DAC automation is under development.
      </p>
    </div>
  );
}
