import { Thumb } from "@/components/brand/thumb";
import { cn } from "@/lib/utils";
import { DEMO_APP, type FormatsPageData } from "./formats-data";

const POSITION = [
  "left-[1%] top-[11%] -rotate-[7deg] z-10",
  "left-1/2 top-0 -translate-x-1/2 z-20",
  "right-[1%] top-[13%] rotate-[7deg] z-10",
] as const;

/** Three generated video covers fanned like a hand of cards: the top formats, Pure art, so it is hidden from assistive tech. */
export function FormatsHero({ data }: { data: FormatsPageData }) {
  // Centre card is the top-ranked format; the other two flank it.
  const picks = [data.formats[1], data.formats[0], data.formats[2]].filter((format): format is NonNullable<typeof format> => format !== undefined);
  return (
    <div aria-hidden="true" className="relative mx-auto h-[25rem] w-full max-w-[34rem] sm:h-[29rem]">
      {picks.map((format, index) => {
        return (
          <div key={format.id} className={cn("absolute w-[9.5rem] drop-shadow-[0_24px_40px_rgb(1_4_20/0.45)] sm:w-[11.5rem]", POSITION[index])}>
            <Thumb art={format.art} hook={format.name} aspect="9:16" app={{ name: DEMO_APP.name, art: format.art }} caption={`Format ${format.rank}`} durationSec={format.maxSeconds} radius="2xl" />
          </div>
        );
      })}
    </div>
  );
}
