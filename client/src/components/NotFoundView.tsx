import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle } from "lucide-react";

export const NotFoundView: React.FC = () => {
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    const redirect = setTimeout(() => {
      navigate("/");
    }, 3000);

    return () => {
      clearInterval(timer);
      clearTimeout(redirect);
    };
  }, [navigate]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        color: "var(--text-main)",
        textAlign: "center",
      }}
    >
      <div className="liquid-glass-container">
        <div className="liquid-glass-backdrop"></div>
        <div className="liquid-glass-distortion top"></div>
        <div className="liquid-glass-distortion bottom"></div>
      </div>

      <div
        style={{
          background: "var(--glass-bg)",
          backdropFilter: "blur(20px)",
          border: "1px solid var(--glass-border)",
          padding: "3rem",
          borderRadius: "24px",
          boxShadow: "var(--glass-shadow)",
          maxWidth: "400px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1.5rem",
          position: "relative",
          zIndex: 10,
        }}
      >
        <div
          style={{
            background: "rgba(255, 59, 48, 0.1)",
            padding: "1rem",
            borderRadius: "50%",
            color: "var(--color-error)",
          }}
        >
          <AlertCircle size={48} />
        </div>

        <h1 style={{ fontSize: "2rem", margin: 0 }}>Room Not Found</h1>

        <p style={{ color: "var(--text-dim)", fontSize: "1.1rem" }}>
          This room does not exist or has been deleted by the owner.
        </p>

        <div
          style={{
            marginTop: "1rem",
            fontSize: "0.9rem",
            color: "var(--text-dim)",
            fontFeatureSettings: "'tnum' on, 'lnum' on",
          }}
        >
          Redirecting to home in{" "}
          <strong style={{ color: "var(--text-main)" }}>{countdown}</strong>{" "}
          seconds...
        </div>

        <button
          onClick={() => navigate("/")}
          style={{
            marginTop: "1rem",
            width: "100%",
            background: "var(--color-primary)",
            color: "white",
            border: "none",
          }}
        >
          Go Home Now
        </button>
      </div>
    </div>
  );
};
