import PrefsForm from "../components/PrefsForm.js";
import RequireMe from "../components/RequireMe.js";

export default function Onboarding() {
  return <RequireMe>{() => <PrefsForm mode="onboarding" />}</RequireMe>;
}
