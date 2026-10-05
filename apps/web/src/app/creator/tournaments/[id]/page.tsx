import type { Metadata } from "next";
import { TournamentDetail } from "@/components/features/creator/social/tournaments/tournament-detail";
import { noindexMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return noindexMetadata("Tournament", "Rounds, matchups, standings, prizes and rules for one tournament.", `/creator/tournaments/${id}`);
}

export default async function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TournamentDetail id={id} />;
}
