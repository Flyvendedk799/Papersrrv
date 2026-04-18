/* ─────────────────────────────────────────────────────────────────────
 *  ApprovalRow — one approval row inside the Linked approvals
 *  collapsible.
 *
 *  Dot color = status color (pending yellow, approved green, rejected
 *  red). Clicking the ↗ 3D chip flies to the approvals portals above
 *  the pillar and inspector opens; clicking the body navigates to the
 *  approval detail route as before.
 * ───────────────────────────────────────────────────────────────────── */

import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { SceneRow } from "./SceneRow";
import { useRowIntegration } from "./useRowIntegration";
import type { ApprovalNode } from "../../../components/issueScene/data/types";

interface ApprovalRowProps {
  approval: ApprovalNode;
  href: string;
  children: ReactNode;
}

export function ApprovalRow({ approval, href, children }: ApprovalRowProps) {
  const integration = useRowIntegration({ kind: "approval", data: approval });
  return (
    <SceneRow integration={integration}>
      <Link
        to={href}
        className="flex items-center justify-between w-full text-[0.82rem] no-underline text-inherit"
      >
        {children}
      </Link>
    </SceneRow>
  );
}
