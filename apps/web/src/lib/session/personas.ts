/**
 * The three demo personas (docs/ROUTES.md header, `world.personas` in the fixtures): Jordan Ellis, growth lead at the brand Lumi;
 * Maya Reyes, the creator @maya.makes; Sam Okafor, Trust and Ops lead at flowd. Fictional people; the ids match the fixtures.
 */

import type { Role } from "@/lib/contract/types";
import { DEMO_IDS } from "@/lib/constants";
import { PERSONA_TO_ROLE, ROLE_TO_PERSONA, type PersonaKey } from "./constants";

export interface DemoPersona {
  key: PersonaKey;
  role: Role;
  /** -> users */
  userId: string;
  displayName: string;
  firstName: string;
  email: string;
  /** "Growth lead at Lumi". */
  title: string;
  /** The brand name for the brand persona. */
  org?: string;
  /** Creator handle without "@". */
  handle?: string;
  /** Where this persona lands after sign-in. */
  home: string;
  /** Label shown on cards and menus: "Brand", "Creator", "Admin". */
  roleLabel: string;
  /** One line for the persona picker. */
  summary: string;
  /** What this persona does first, for the picker's secondary line. */
  firstStep: string;
  /** Generated-avatar initials (the avatar art itself comes from the user's fixture row). */
  initials: string;
}

export const DEMO_PERSONAS: Readonly<Record<PersonaKey, DemoPersona>> = {
  brand: {
    key: "brand",
    role: "brand_member",
    userId: DEMO_IDS.brand.userId,
    displayName: "Jordan Ellis",
    firstName: "Jordan",
    email: "jordan.ellis@example.com",
    title: "Growth lead at Lumi",
    org: "Lumi",
    home: "/brand",
    roleLabel: "Brand",
    summary: "Fund bounties for Lumi, review submissions and read the install to paid funnel.",
    firstStep: "Clear the review queue",
    initials: "JE",
  },
  creator: {
    key: "creator",
    role: "creator",
    userId: DEMO_IDS.creator.userId,
    displayName: "Maya Reyes",
    firstName: "Maya",
    email: "maya.reyes@example.com",
    title: "Creator · @maya.makes",
    handle: DEMO_IDS.creator.handle,
    home: "/creator",
    roleLabel: "Creator",
    summary: "Find a bounty, make a take in Studio and watch the Money Clock.",
    firstStep: "Claim today's Daily Drop",
    initials: "MR",
  },
  admin: {
    key: "admin",
    role: "admin",
    userId: DEMO_IDS.admin.userId,
    displayName: "Sam Okafor",
    firstName: "Sam",
    email: "sam@joinflowd.io",
    title: "Trust and Ops lead at flowd",
    home: "/admin",
    roleLabel: "Admin",
    summary: "Work the fraud and dispute queues, run the Friday payout and watch the 90-day targets.",
    firstStep: "Open the control tower",
    initials: "SO",
  },
};

/** The personas in the order the picker lists them: brand, creator, admin. */
export const PERSONA_LIST: readonly DemoPersona[] = [DEMO_PERSONAS.brand, DEMO_PERSONAS.creator, DEMO_PERSONAS.admin];

export const personaForRole = (role: Role): DemoPersona => DEMO_PERSONAS[ROLE_TO_PERSONA[role]];
export const personaByKey = (key: PersonaKey): DemoPersona => DEMO_PERSONAS[key];
export const roleForPersona = (key: PersonaKey): Role => PERSONA_TO_ROLE[key];
