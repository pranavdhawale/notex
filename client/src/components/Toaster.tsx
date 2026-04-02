import { Toaster as SonnerToaster, toast } from "sonner";
import { useEffect, useState } from "react";
import { CheckCircle, XCircle, Info, AlertTriangle } from "lucide-react";

export { toast };

export const Toaster = () => {
  const [position, setPosition] = useState<"bottom-right" | "top-center">(
    typeof window !== "undefined" && window.innerWidth < 768
      ? "top-center"
      : "bottom-right"
  );

  useEffect(() => {
    const handleResize = () => {
      setPosition(window.innerWidth < 768 ? "top-center" : "bottom-right");
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <SonnerToaster
      position={position}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: "notex-toast-base",
          success: "notex-toast-success",
          error: "notex-toast-error",
          info: "notex-toast-info",
          warning: "notex-toast-warning",
          content: "notex-toast-content",
          icon: "notex-toast-icon",
          title: "notex-toast-title",
          closeButton: "notex-toast-close",
        },
      }}
      icons={{
        success: <CheckCircle size={18} />,
        error: <XCircle size={18} />,
        info: <Info size={18} />,
        warning: <AlertTriangle size={18} />,
        close: null,
      }}
      expand={false}
      richColors
    />
  );
};