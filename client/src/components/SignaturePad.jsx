import { useRef } from 'react';

// A minimal signature pad — draw with mouse or touch, exported as a PNG data URL. Shared by the
// public, token-gated estimate approval page (EstimateApproval.jsx) and the in-app "Sign" modal
// (SignEstimateModal.jsx, Sept 2026) that lets staff capture the same signature in person, from
// inside the app, instead of only over a texted/emailed link.
export default function SignaturePad({ onChange }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);

  // The canvas's drawing buffer is a fixed 560×160 (its width/height attributes below), but the
  // CSS renders it at width: 100% — on any screen narrower than 560px (i.e. basically every
  // phone) the on-screen box is smaller than the buffer, so a touch position in on-screen pixels
  // has to be scaled up to buffer pixels or the ink lands in the wrong place entirely. Desktops
  // wide enough to render it near 1:1 never showed this, which is why it only broke on mobile.
  function point(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (src.clientX - rect.left) * scaleX, y: (src.clientY - rect.top) * scaleY };
  }
  function start(e) {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function move(e) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = point(e);
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#1f2a24';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvasRef.current.toDataURL('image/png'));
  }
  function clear() {
    const canvas = canvasRef.current;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    onChange(null);
  }

  return (
    <div>
      <canvas
        ref={canvasRef} className="sign-pad" width={560} height={160}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
      />
      <button type="button" className="btn subtle sm" style={{ marginTop: 6 }} onClick={clear}>Clear</button>
    </div>
  );
}
