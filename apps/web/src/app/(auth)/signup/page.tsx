import { buildMetadata } from "@/lib/seo";
import { getAuthSnapshot } from "@/components/features/auth/auth-data";
import { SignupChooser } from "@/components/features/auth/signup-chooser";

export const metadata = buildMetadata({
  title: "Join flowd",
  description: "Creators make videos for app bounties and get paid for what works. Brands fund bounties and pay only for results that clear. Both start free.",
  path: "/signup",
});

export default async function SignupPage() {
  return <SignupChooser snapshot={await getAuthSnapshot()} />;
}
