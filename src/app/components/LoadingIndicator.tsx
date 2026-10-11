type LoadingIndicatorProps = {
  /** A short, specific description of what is loading. */
  label?: string;
  /** Optional supporting copy for longer operations. */
  description?: string;
  /** Controls placement without changing the shared loading indicator. */
  variant?: 'inline' | 'section' | 'page' | 'overlay';
};

/** The single accessible loading indicator used throughout the app. */
export function LoadingIndicator({
  label = 'Đang tải…',
  description,
  variant = 'section',
}: LoadingIndicatorProps) {
  return (
    <span
      className={`loading-indicator loading-indicator--${variant}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-busy="true"
    >
      <span className="loading-indicator__content">
        <span className="loading-indicator__spinner" aria-hidden="true" />
        <span className="loading-indicator__copy">
          <span className="loading-indicator__label">{label}</span>
          {description && <span className="loading-indicator__description">{description}</span>}
        </span>
      </span>
    </span>
  );
}
