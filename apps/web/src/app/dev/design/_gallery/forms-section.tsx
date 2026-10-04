"use client";

import { useEffect, useRef, useState } from "react";
import { AtSign, Link2, Sparkles } from "lucide-react";
import {
  Checkbox,
  Field,
  Input,
  RadioGroup,
  RadioGroupItem,
  SearchInput,
  Select,
  Slider,
  Switch,
  Textarea,
  formatMoneyText,
  type SelectGroupDef,
} from "@/components/ui";
import { Cols, Panel, Row, Section, Spec } from "./kit";

const NICHES: readonly SelectGroupDef[] = [
  {
    label: "Health",
    options: [
      { value: "fitness", label: "Fitness", description: "Workouts, habits, nutrition apps" },
      { value: "sleep", label: "Sleep", description: "Wind-down, tracking, white noise" },
    ],
  },
  {
    label: "Learn",
    options: [
      { value: "language", label: "Language learning", description: "Vocabulary, speaking practice" },
      { value: "study", label: "Study tools", description: "Flashcards, note taking, exam prep" },
    ],
  },
  { label: "Make", options: [{ value: "ai", label: "AI tools" }, { value: "productivity", label: "Productivity", disabled: true, description: "Full this week" }] },
];

const RESULTS = ["Nap Nest · Wind-down routine hook", "Fernlingo · Speak in 7 days", "Loafly · Dough day diary", "Quill Notes · Study with me"];

export function FormsSection() {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [cpm, setCpm] = useState<number[]>([240]);
  const [budget, setBudget] = useState<number[]>([500, 5000]);
  const [hook, setHook] = useState("Stop scrolling if you sleep badly");
  const [agree, setAgree] = useState<boolean | "indeterminate">("indeterminate");

  // A pretend 500ms search so the loading state is reviewable.
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const onQuery = (value: string): void => {
    setQuery(value);
    setSearching(value.length > 0);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSearching(false), 500);
  };

  const matches = RESULTS.filter((result) => result.toLowerCase().includes(query.toLowerCase()));

  return (
    <Section
      id="forms"
      eyebrow="Forms"
      title="Labelled, wired and calm about mistakes."
      description="Every control sits on a field fill (a fill, not more glass), takes its label, hint and error from <Field>, and keeps 16px text on mobile so iOS never zooms. Errors say what happened and what to do, with an icon, never colour alone."
    >
      <Cols>
        <Panel title="Text fields" note="Default, hover, focus, invalid and disabled. Hover and focus are forced for review.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Spec caption="Default" className="w-full">
              <Field label="Hook line" className="w-full">
                <Input value={hook} onChange={(event) => setHook(event.target.value)} leading={<Sparkles />} />
              </Field>
            </Spec>
            <Spec caption="Hover (forced)" className="w-full">
              <Field label="Hook line" className="w-full">
                <Input defaultValue="Stop scrolling if you sleep badly" leading={<Sparkles />} data-force="hover" />
              </Field>
            </Spec>
            <Spec caption="Focus (forced)" className="w-full">
              <Field label="Hook line" className="w-full">
                <Input defaultValue="Stop scrolling if you sleep badly" leading={<Sparkles />} data-force="focus" />
              </Field>
            </Spec>
            <Spec caption="Invalid" className="w-full">
              <Field label="Short link" error="That handle is taken. Try maya.k or maya.makes." className="w-full">
                <Input defaultValue="joinflowd.io/c/maya" leading={<Link2 />} />
              </Field>
            </Spec>
            <Spec caption="Disabled" className="w-full">
              <Field label="Disclosure" hint="Added automatically to every post." disabled className="w-full">
                <Input defaultValue="#ad @napnest" leading={<AtSign />} />
              </Field>
            </Spec>
            <Spec caption="Required, with a hint" className="w-full">
              <Field label="Rate card (per video)" hint="Minimum CPM $1.20" required className="w-full">
                <Input inputMode="decimal" leading="$" defaultValue="180" trailing={<span className="text-caption">USD</span>} />
              </Field>
            </Spec>
          </div>
        </Panel>

        <Panel title="Textarea, search and select" note="Counter turns rose at the limit and stays announced as text.">
          <Field label="Caption" hint="#ad and the brand mention are added for you.">
            <Textarea defaultValue="I did not expect a sleep app to fix my evenings, but here we are." maxLength={150} showCount rows={3} />
          </Field>
          <div className="grid gap-2">
            <SearchInput
              aria-label="Search bounties"
              placeholder="Search apps, hooks, rates"
              shortcut={["mod", "K"]}
              value={query}
              onValueChange={onQuery}
              loading={searching}
            />
            <p aria-live="polite" className="text-caption text-fg-subtle">
              {query ? `${matches.length} of ${RESULTS.length} bounties match “${query}”` : "Try “nap” or “quill”. Escape clears."}
            </p>
          </div>
          <Field label="Niche" hint="Pick up to three.">
            <Select groups={NICHES} placeholder="Pick a niche" leading={<Sparkles />} />
          </Field>
        </Panel>
      </Cols>

      <Cols n={3}>
        <Panel title="Checkboxes" note="Space toggles. Label and box are one 44px target.">
          <div className="grid">
            <Checkbox label="Auto-disclose #ad on every post" description="Required for paid partnerships. You can read why." defaultChecked />
            <Checkbox label="Share my median earnings on my storefront" />
            <Checkbox label="Accept bounty terms" checked={agree} onCheckedChange={setAgree} description="Indeterminate until you tick it." />
            <Checkbox label="Disabled option" disabled />
            <Checkbox label="Disabled and checked" disabled defaultChecked />
          </div>
        </Panel>

        <Panel title="Radio group" note="Arrow keys move and select. Card rows give weight to choices that cost something.">
          <RadioGroup aria-label="Payout speed" defaultValue="weekly">
            <RadioGroupItem value="weekly" id="payout-weekly" label="Weekly" description="Free · every Friday 2:00 PM" variant="card" meta="Free" />
            <RadioGroupItem value="instant" id="payout-instant" label="Instant cash-out" description="1.5% fee, $0.50 minimum, shown before you confirm" variant="card" meta="1.5%" />
          </RadioGroup>
          <RadioGroup aria-label="Review SLA" defaultValue="72h">
            <RadioGroupItem value="48h" label="Decide within 48 hours" />
            <RadioGroupItem value="72h" label="Decide within 72 hours" description="The flowd standard." />
            <RadioGroupItem value="never" label="No deadline" disabled description="Not available on flowd." />
          </RadioGroup>
        </Panel>

        <Panel title="Switches" note="Settings that apply at once. Use a checkbox when a Save button decides.">
          <div className="grid">
            <Switch label="Wellbeing mode" description="Quiet hours and numbers off." defaultChecked />
            <Switch label="Instant payout alerts" description="One notification when money clears." />
            <Switch label="Auto-approve at 82+" description="Guarded: 10% spot-checked, kill switch anytime." defaultChecked />
            <Switch label="Disabled" disabled />
          </div>
          <Row label="Bare switch (needs an aria-label)">
            <Switch aria-label="Compact density" />
            <Switch aria-label="Compact density, on" defaultChecked />
          </Row>
        </Panel>
      </Cols>

      <Cols>
        <Panel title="Slider" note="Arrow keys, Home/End, PageUp/PageDown, touch drag. The bubble shows the value while you hold it.">
          <Field label="Rate per 1,000 views" hint="Market clears at $2.31 this week · suggested $2.40 fills in about 3 days.">
            <Slider
              value={cpm}
              onValueChange={setCpm}
              min={50}
              max={500}
              step={5}
              format={(v) => formatMoneyText(v)}
              marks={[
                { value: 120, label: "p25" },
                { value: 231, label: "median" },
                { value: 380, label: "p75" },
              ]}
            />
          </Field>
          <p className="text-caption text-fg-subtle tabular-nums" aria-live="polite">
            Effective all-in CPM for you: {formatMoneyText(Math.round((cpm[0] ?? 0) * 1.12))} (creator pay + 12% fee).
          </p>
        </Panel>
        <Panel title="Range slider" note="Two thumbs, two names (Minimum, Maximum), neutral or mint fills.">
          <Field label="Budget window" hint="Bounties funded between these amounts.">
            <Slider
              value={budget}
              onValueChange={setBudget}
              min={0}
              max={10000}
              step={100}
              tone="mint"
              format={(v) => `$${v.toLocaleString("en-US")}`}
              aria-label="Budget window"
            />
          </Field>
          <Field label="Auto-approve threshold" hint="Dry run on your last 50: 9 would pass.">
            <Slider defaultValue={[82]} min={50} max={100} tone="neutral" alwaysShowValue aria-label="Auto-approve threshold" />
          </Field>
        </Panel>
      </Cols>
    </Section>
  );
}
