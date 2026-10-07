import { useRef, useEffect, useState, useCallback } from "react";
import { X, RotateCcw, CheckCircle } from "lucide-react";

interface Props {
  driverName?: string;
  onConfirm: (dataUrl: string) => void;
  onClose: () => void;
}

export default function SignaturePad({ driverName, onConfirm, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  // Resize canvas to match display size
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr  = window.devicePixelRatio || 1;
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
  }, []);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  const getPos = (e: React.TouchEvent | React.MouseEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      const t = e.touches[0] || e.changedTouches[0];
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const startDraw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    setDrawing(true);
    lastPos.current = getPos(e, canvas);
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!drawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current?.x ?? pos.x, lastPos.current?.y ?? pos.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
    setHasDrawn(true);
  };

  const endDraw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    setDrawing(false);
    lastPos.current = null;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const confirm = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) return;
    // Create a white-background version for saving
    const offscreen = document.createElement("canvas");
    offscreen.width  = canvas.width;
    offscreen.height = canvas.height;
    const ctx = offscreen.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, offscreen.width, offscreen.height);
    ctx.drawImage(canvas, 0, 0);
    onConfirm(offscreen.toDataURL("image/png", 0.85));
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-white rounded-t-3xl shadow-2xl overflow-hidden" dir="rtl">

        {/* Header */}
        <div className="bg-[#103c68] px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-white font-black text-sm">توقيع وبصمة السائق</p>
            {driverName && (
              <p className="text-white/70 text-xs mt-0.5">{driverName}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Instruction */}
        <div className="px-5 pt-4 pb-2">
          <p className="text-xs text-gray-500 text-center">
            ارسم توقيعك بإصبعك أو بالفأرة في المربع أدناه — ثم اضغط "تأكيد التوقيع"
          </p>
        </div>

        {/* Canvas area */}
        <div className="mx-5 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 overflow-hidden relative"
             style={{ height: 200 }}>
          <canvas
            ref={canvasRef}
            className="w-full h-full cursor-crosshair touch-none"
            style={{ width: "100%", height: "100%" }}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
          />
          {!hasDrawn && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p className="text-gray-300 text-sm font-medium select-none">وقّع هنا ✍️</p>
            </div>
          )}
        </div>

        {/* Divider line (like a paper signature line) */}
        <div className="mx-5 mt-1 mb-4">
          <div className="border-b border-gray-400 w-full" />
          <p className="text-[10px] text-gray-400 text-center mt-1">التوقيع / Signature</p>
        </div>

        {/* Actions */}
        <div className="px-5 pb-6 flex gap-3">
          <button
            onClick={clearCanvas}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold transition-colors"
          >
            <RotateCcw size={14} /> مسح
          </button>
          <button
            onClick={confirm}
            disabled={!hasDrawn}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            <CheckCircle size={16} /> تأكيد التوقيع
          </button>
        </div>
      </div>
    </div>
  );
}
