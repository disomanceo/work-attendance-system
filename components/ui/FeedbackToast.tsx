"use client";

import styles from "./FeedbackToast.module.css";

type FeedbackToastProps = {
  message: string;
  type: "success" | "error";
};

export default function FeedbackToast({ message, type }: FeedbackToastProps) {
  if (!message) return null;

  return (
    <div className={`${styles.toast} ${styles[type]}`} role="status">
      <span className={styles.indicator} />
      <p>{message}</p>
    </div>
  );
}
