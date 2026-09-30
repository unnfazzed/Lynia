import { redirect } from "next/navigation";

/** The setup checklist is gone (merchant mobile redesign, ledger D-48: "Removed as a page. The live shop
 *  is the default"). An old bookmark or link lands on Orders, which sends a shop on to Deliveries. */
export default function SetupPage() {
  redirect("/queue");
}
