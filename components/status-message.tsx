type StatusMessageProps = {
  children: React.ReactNode;
  className?: string;
  tone?: "status" | "alert";
  id?: string;
};

/** Announces an asynchronous result without moving keyboard focus. */
export function StatusMessage({
  children,
  className = "collab-notice",
  tone = "status",
  id,
}: StatusMessageProps) {
  return (
    <p
      id={id}
      className={className}
      role={tone === "alert" ? "alert" : "status"}
      aria-live={tone === "alert" ? "assertive" : "polite"}
      aria-atomic="true"
    >
      {children}
    </p>
  );
}
