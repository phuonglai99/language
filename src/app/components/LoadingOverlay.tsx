type LoadingOverlayProps = {
  /** A concise status message describing the work in progress. */
  label: string;
  /** Optional supporting context, such as a note about the next screen. */
  description?: string;
};

/** A blocking, accessible loading state for client-side actions across the app. */
export function LoadingOverlay({ label, description }: LoadingOverlayProps) {
  return (
    <div className="loading-overlay" role="status" aria-live="polite" aria-atomic="true">
      <div className="loading-overlay-card" aria-busy="true">
        <span className="loading-spinner" aria-hidden="true" />
        <div>
          <p className="loading-overlay-label">{label}</p>
          {description && <p className="loading-overlay-description">{description}</p>}
        </div>
      </div>
    </div>
  );
}
