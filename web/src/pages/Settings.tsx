import PrefsForm from "../components/PrefsForm.js";
import RequireMe from "../components/RequireMe.js";

export default function Settings() {
  return <RequireMe>{(me) => <PrefsForm mode="settings" name={me.name} />}</RequireMe>;
}
