import { useMemo } from "react";
import { ChevronLeft, ChevronRight, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface BeginnerGuideStep {
  id: string;
  title: string;
  description: string;
  details: string[];
  note?: string;
}

interface BeginnerGuideOverlayProps {
  open: boolean;
  stepIndex: number;
  steps: BeginnerGuideStep[];
  targetRect: DOMRect | null;
  onClose: () => void;
  onBack: () => void;
  onNext: () => void;
  onComplete: () => void;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function BeginnerGuideOverlay({
  open,
  stepIndex,
  steps,
  targetRect,
  onClose,
  onBack,
  onNext,
  onComplete,
}: BeginnerGuideOverlayProps) {
  const step = steps[stepIndex] ?? null;
  const isFirst = stepIndex <= 0;
  const isLast = stepIndex >= steps.length - 1;

  const cardStyle = useMemo(() => {
    const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1280;
    const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 800;
    const cardWidth = Math.min(460, viewportWidth - 32);
    const margin = 16;

    if (!targetRect) {
      return {
        width: `${cardWidth}px`,
        left: `${Math.max(margin, (viewportWidth - cardWidth) / 2)}px`,
        top: `${Math.max(88, (viewportHeight - 420) / 2)}px`,
      };
    }

    const belowTop = targetRect.bottom + 18;
    const aboveTop = targetRect.top - 18 - 420;
    const preferBelow = belowTop + 420 < viewportHeight - margin || aboveTop < 72;
    const left = clamp(targetRect.left, margin, viewportWidth - cardWidth - margin);
    const top = preferBelow
      ? clamp(belowTop, 72, viewportHeight - 440)
      : clamp(aboveTop, 72, viewportHeight - 440);

    return {
      width: `${cardWidth}px`,
      left: `${left}px`,
      top: `${top}px`,
    };
  }, [targetRect]);

  if (!open || !step) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[140]">
      {targetRect ? (
        <div
          className="absolute rounded-[28px] border-2 border-amber-300/95 shadow-[0_0_0_10px_rgba(251,191,36,0.12),0_20px_60px_rgba(0,0,0,0.18)] transition-all duration-300"
          style={{
            left: `${targetRect.left - 10}px`,
            top: `${targetRect.top - 10}px`,
            width: `${targetRect.width + 20}px`,
            height: `${targetRect.height + 20}px`,
          }}
        />
      ) : null}

      <div
        className="pointer-events-auto absolute overflow-hidden rounded-[28px] border border-amber-200/25 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.12),transparent_34%),linear-gradient(180deg,rgba(22,20,18,0.98),rgba(14,13,12,0.98))] p-5 text-foreground shadow-[0_28px_90px_rgba(0,0,0,0.46)]"
        style={cardStyle}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-8 top-0 h-24 w-24 rounded-full bg-amber-300/10 blur-2xl" />
          <div className="absolute right-0 top-6 h-20 w-20 rounded-full bg-primary/10 blur-2xl" />
        </div>

        <div className="relative">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-amber-200/85">
                <Sparkles className="h-3.5 w-3.5" />
                新手引导 {stepIndex + 1}/{steps.length}
              </div>
              <h3 className="mt-2 text-xl font-semibold tracking-[0.04em] text-foreground">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-foreground/78">{step.description}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/40 bg-background/10 text-muted-foreground transition-fast hover:bg-background/20 hover:text-foreground"
              aria-label="关闭新手引导"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 rounded-2xl border border-border/40 bg-background/10 px-4 py-3">
            <ol className="space-y-2 text-sm leading-6 text-foreground/84">
              {step.details.map((item, index) => (
                <li key={`${step.id}-${index}`} className="flex gap-3">
                  <span className="mt-[2px] inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-300/18 text-[11px] font-semibold text-amber-100">
                    {index + 1}
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ol>
          </div>

          {step.note ? (
            <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/8 px-4 py-3 text-sm leading-6 text-foreground/80">
              {step.note}
            </div>
          ) : null}

          <div className="mt-5 flex items-center justify-between gap-3">
            <Button variant="ghost" size="sm" onClick={onClose}>
              暂时跳过
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onBack} disabled={isFirst}>
                <ChevronLeft className="h-4 w-4" />
                上一步
              </Button>
              {isLast ? (
                <Button size="sm" onClick={onComplete}>
                  开始使用
                </Button>
              ) : (
                <Button size="sm" onClick={onNext}>
                  下一步
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
