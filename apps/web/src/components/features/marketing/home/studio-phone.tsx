"use client";

import { PhoneFrame } from "@/components/shell/phone-frame";
import { ReviewScreen } from "./review-screen";
import { StudioScreen, useStudioLoop } from "./studio-screen";

/** The animated mini Studio in a phone: plays while on screen, loops, and shows the finished state under reduced motion. */
export function StudioPhone({ width = 300 }: { width?: number }) {
  const studio = useStudioLoop();
  return (
    <div ref={studio.ref} className="mx-auto w-fit">
      <PhoneFrame width={width} label="Studio on a phone: the brief's script at the lens, a live checklist, then a Hook Score with timecoded reasons and a one-tap fix.">
        <StudioScreen state={studio.state} />
      </PhoneFrame>
    </div>
  );
}

/** The brand's review queue in a phone (static). */
export function ReviewPhone({ width = 300 }: { width?: number }) {
  return (
    <div className="mx-auto w-fit">
      <PhoneFrame width={width} label="The review queue on a phone: a submission with its decision deadline, a checklist score, fraud and compliance checks, and a timecoded note.">
        <ReviewScreen />
      </PhoneFrame>
    </div>
  );
}
