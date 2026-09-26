type Props = { compact?: boolean };

export function Brand({ compact = false }: Props) {
  return (
    <div className={`brand ${compact ? 'brand--compact' : ''}`} aria-label="AERVON Unified Trading">
      <svg className="brand__mark" viewBox="0 0 48 48" role="img" aria-hidden="true">
        <path d="M7 37 22 8c.8-1.6 3.1-1.6 3.9 0L41 37h-8.4l-3.2-6.4H18.6L15.4 37H7Zm14.8-13h4.4L24 19.4 21.8 24Z" />
        <path className="brand__pulse" d="m14 29 5-5 4 3 8-10 4 3" />
      </svg>
      <div>
        <div className="brand__name">AERVON</div>
        {!compact && <div className="brand__tag">UNIFIED TRADING</div>}
      </div>
    </div>
  );
}
