import { useEffect } from "react";

interface ToastProps {
  message: string;
  duration?: number;
  onClose: () => void;
}

export function Toast({ message, duration = 3000, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(20,20,20,0.9)",
        color: "white",
        padding: "8px 16px",
        borderRadius: 12,
        fontSize: 13,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        pointerEvents: "none",
      }}
    >
      {message}
    </div>
  );
}
