import React from "react";
import { Icon } from "../core/Icon.jsx";

/**
 * Lynia empty/dead-end state — a calm card that turns a dead-end into an action. A round mint-wash
 * tile holds a Lucide line icon (dark text-green), then a bold title, a short reassuring message,
 * and one primary action passed as children. Used for no-offers / no-orders / not-verified /
 * error-retry states. `icon` is a Lucide name; a legacy emoji string still renders as text.
 */
export function EmptyState({ icon, title, message, children, style, ...rest }) {
  const isEmoji = typeof icon === "string" && /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(icon);
  return (
    <div
      className="lynia-empty"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        padding: "var(--space-xl) 0",
        ...style,
      }}
      {...rest}
    >
      {icon != null ? (
        <div
          aria-hidden="true"
          style={{
            width: 88,
            height: 88,
            borderRadius: "50%",
            background: "var(--accent-wash)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "var(--space-md)",
          }}
        >
          {isEmoji ? (
            <span style={{ fontSize: 36 }}>{icon}</span>
          ) : (
            <Icon name={icon} size={36} color="var(--accent-text)" />
          )}
        </div>
      ) : null}
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-title)",
          fontWeight: "var(--weight-bold)",
          color: "var(--ink)",
        }}
      >
        {title}
      </div>
      {message != null ? (
        <div
          style={{
            marginTop: 6,
            maxWidth: 260,
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-caption)",
            lineHeight: "var(--leading-body)",
            color: "var(--muted)",
          }}
        >
          {message}
        </div>
      ) : null}
      {children ? <div style={{ alignSelf: "stretch", marginTop: "var(--space-md)" }}>{children}</div> : null}
    </div>
  );
}
