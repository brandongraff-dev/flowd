import Link from "next/link";
import { PRICE_ROWS, LAST_VERIFIED } from "./compare-data";
import { ConfidenceLegend, ConfidenceTag } from "./compare-grid";

/**
 * What the other products publish about price, with what each fee is charged on (the column that stops it being read as like-for-like), a
 * verified / reported tag per row and the date we last checked. A table on wide screens, cards on phones.
 */
export function PriceTable() {
  return (
    <div className="grid gap-6">
      <div className="hidden overflow-hidden rounded-[28px] bg-surface shadow-rest ring-1 ring-rim md:block">
        <table className="w-full table-fixed border-collapse text-left">
          <caption className="sr-only">What flowd and other creator platforms publish about price, what each fee applies to, and how well we know it</caption>
          <thead>
            <tr className="border-b border-divider text-caption text-fg-subtle">
              <th scope="col" className="w-[15rem] p-5 font-semibold">
                Product
              </th>
              <th scope="col" className="w-[15rem] p-5 font-semibold">
                The fee applies to
              </th>
              <th scope="col" className="p-5 font-semibold">
                What it publishes
              </th>
              <th scope="col" className="w-[10rem] p-5 font-semibold">
                How we know
              </th>
            </tr>
          </thead>
          <tbody>
            {PRICE_ROWS.map((row, index) => (
              <tr key={row.name} className={index === 0 ? "border-b border-divider bg-accent-soft/60 align-top" : "border-b border-divider align-top last:border-b-0"}>
                <th scope="row" className="p-5 text-left font-display text-title-sm text-fg">
                  {row.name}
                </th>
                <td className="p-5 text-caption text-fg-muted">{row.appliesTo}</td>
                <td className="p-5 text-caption text-pretty text-fg">{row.fee}</td>
                <td className="p-5">
                  <div className="grid justify-items-start gap-1.5">
                    <ConfidenceTag tag={row.tag} />
                    {row.name === "flowd" ? null : <span className="text-micro text-fg-subtle">Checked {LAST_VERIFIED}</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="grid gap-3 md:hidden">
        {PRICE_ROWS.map((row) => (
          <li key={row.name} className="grid gap-2 rounded-[24px] bg-surface p-5 shadow-rest ring-1 ring-rim">
            <h3 className="font-display text-title-sm text-fg">{row.name}</h3>
            <p className="text-micro text-fg-subtle">The fee applies to: {row.appliesTo}</p>
            <p className="text-caption text-pretty text-fg">{row.fee}</p>
            <div className="flex flex-wrap items-center gap-2">
              <ConfidenceTag tag={row.tag} />
              {row.name === "flowd" ? null : <span className="text-micro text-fg-subtle">Checked {LAST_VERIFIED}</span>}
            </div>
          </li>
        ))}
      </ul>

      <div className="grid gap-4 rounded-2xl bg-surface-field p-5 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
        <p className="text-caption max-w-[78ch] text-fg-muted">
          <strong className="font-semibold text-fg">These are not like-for-like.</strong> A fee on attributed sales, a fee on ad spend and a fee on creator spend cannot be added up against each other, and
          each product pays creators differently. To compare on your own numbers, use the{" "}
          <Link href="/tools/price-calculator" className="text-accent underline underline-offset-2">
            all-in price calculator
          </Link>
          .
        </p>
        <ConfidenceLegend />
      </div>
    </div>
  );
}
