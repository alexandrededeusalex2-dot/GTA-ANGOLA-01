/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RotateCcw, Zap } from 'lucide-react';
import { useRef, useState } from 'react';

interface TouchControlsProps {
  readonly onStickMove: (x: number, y: number) => void;
  readonly onSprintChange: (active: boolean) => void;
  readonly onResetCamera: () => void;
}

const MAX_RADIUS_PX = 38;

export function TouchControls({
  onStickMove,
  onSprintChange,
  onResetCamera,
}: TouchControlsProps) {
  const padRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const [knobOffset, setKnobOffset] = useState({ x: 0, y: 0 });
  const [sprintActive, setSprintActive] = useState(false);

  const updateStickFromEvent = (clientX: number, clientY: number) => {
    const pad = padRef.current;
    if (!pad) return;
    const rect = pad.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(dist, MAX_RADIUS_PX);
    const angle = Math.atan2(dy, dx);

    const nx = dist > 0 ? Math.cos(angle) * clampedDist : 0;
    const ny = dist > 0 ? Math.sin(angle) * clampedDist : 0;

    setKnobOffset({ x: nx, y: ny });
    onStickMove(nx / MAX_RADIUS_PX, -ny / MAX_RADIUS_PX);
  };

  const resetStick = () => {
    pointerIdRef.current = null;
    setKnobOffset({ x: 0, y: 0 });
    onStickMove(0, 0);
  };

  return (
    <>
      {/* Left Thumb Zone: Virtual Movement Joystick */}
      <div className="pointer-events-auto fixed bottom-5 left-5 z-20 flex flex-col items-center gap-1.5">
        <div
          ref={padRef}
          role="slider"
          aria-label="Joystick tátil de movimento"
          aria-valuemin={-1}
          aria-valuemax={1}
          aria-valuenow={Math.round(knobOffset.y)}
          tabIndex={-1}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            pointerIdRef.current = e.pointerId;
            updateStickFromEvent(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (pointerIdRef.current !== e.pointerId) return;
            updateStickFromEvent(e.clientX, e.clientY);
          }}
          onPointerUp={(e) => {
            if (pointerIdRef.current === e.pointerId) {
              resetStick();
            }
          }}
          onPointerCancel={resetStick}
          className="relative h-28 w-28 rounded-full bg-[#0e1116]/75 border border-white/15 touch-none-surface flex items-center justify-center shadow-lg"
        >
          <div className="h-14 w-14 rounded-full border border-amber-400/25 pointer-events-none" />
          <div
            style={{
              transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)`,
            }}
            className="absolute h-12 w-12 rounded-full bg-amber-500/90 border-2 border-amber-200 shadow-md pointer-events-none"
          />
        </div>
      </div>

      {/* Right Thumb Zone: Sprint & Camera Reset */}
      <div className="pointer-events-auto fixed bottom-5 right-5 z-20 flex items-center gap-2.5">
        <button
          type="button"
          aria-label="Repor vista da câmara"
          tabIndex={-1}
          onClick={(e) => {
            e.currentTarget.blur();
            onResetCamera();
          }}
          className="min-h-[48px] min-w-[48px] rounded-full bg-[#0e1116]/85 border border-white/15 text-slate-100 hover:bg-slate-800 active:scale-95 flex items-center justify-center shadow-lg cursor-pointer"
        >
          <RotateCcw className="w-5 h-5" aria-hidden="true" />
        </button>

        <button
          type="button"
          aria-label="Acelerar movimento"
          aria-pressed={sprintActive}
          tabIndex={-1}
          onPointerDown={() => {
            setSprintActive(true);
            onSprintChange(true);
          }}
          onPointerUp={() => {
            setSprintActive(false);
            onSprintChange(false);
          }}
          onPointerCancel={() => {
            setSprintActive(false);
            onSprintChange(false);
          }}
          onClick={(e) => e.currentTarget.blur()}
          className={`min-h-[52px] min-w-[52px] rounded-full border text-xs font-semibold flex items-center justify-center shadow-lg cursor-pointer transition-colors ${
            sprintActive
              ? 'bg-amber-500 border-amber-300 text-slate-950'
              : 'bg-[#0e1116]/85 border-white/15 text-slate-100 hover:bg-slate-800'
          }`}
        >
          <Zap className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>
    </>
  );
}
