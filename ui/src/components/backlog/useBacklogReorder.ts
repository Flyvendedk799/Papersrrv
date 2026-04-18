/**
 * useBacklogReorder — drag-and-drop + keyboard reordering for backlog
 * items (backlog3.0 B3).
 *
 * Calls the server reorder endpoint which computes a fractional-index
 * midpoint rank between neighbours. The caller supplies the current
 * visible order inside each container (status column or plan group) so
 * this hook can translate a "move up/down" action into neighbour ids.
 */

import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  BacklogItem,
  BacklogItemStatus,
  ReorderBacklogItemInput,
} from "@paperclipai/shared";
import { backlogApi } from "../../api/backlog";

export interface ReorderArgs {
  id: string;
  input: ReorderBacklogItemInput;
}

export function useBacklogReorder(companyId: string | undefined) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ id, input }: ReorderArgs) =>
      backlogApi.reorderItem(companyId!, id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backlog", companyId] });
    },
  });

  const moveWithin = useCallback(
    (
      orderedItems: BacklogItem[],
      fromIndex: number,
      toIndex: number,
      opts?: { planId?: string | null; status?: BacklogItemStatus },
    ) => {
      if (fromIndex < 0 || fromIndex >= orderedItems.length) return;
      if (toIndex < 0 || toIndex >= orderedItems.length) return;
      if (fromIndex === toIndex) return;
      const moving = orderedItems[fromIndex];
      // Build the order WITHOUT the moving item, then consider toIndex as
      // the target slot in the new list.
      const without = orderedItems.filter((_, i) => i !== fromIndex);
      const newIndex = toIndex > fromIndex ? toIndex : toIndex;
      const effectiveIndex = Math.min(newIndex, without.length);
      const prev = without[effectiveIndex - 1] ?? null;
      const next = without[effectiveIndex] ?? null;
      if (!companyId) return;
      mutation.mutate({
        id: moving.id,
        input: {
          prevId: prev?.id ?? null,
          nextId: next?.id ?? null,
          planId: opts?.planId,
          status: opts?.status,
        },
      });
    },
    [mutation, companyId],
  );

  const moveBetweenContainers = useCallback(
    (
      id: string,
      destOrderedItems: BacklogItem[],
      insertIndex: number,
      opts?: { planId?: string | null; status?: BacklogItemStatus },
    ) => {
      if (!companyId) return;
      const safeIdx = Math.max(0, Math.min(insertIndex, destOrderedItems.length));
      const prev = destOrderedItems[safeIdx - 1] ?? null;
      const next = destOrderedItems[safeIdx] ?? null;
      mutation.mutate({
        id,
        input: {
          prevId: prev?.id ?? null,
          nextId: next?.id ?? null,
          planId: opts?.planId,
          status: opts?.status,
        },
      });
    },
    [mutation, companyId],
  );

  return { mutation, moveWithin, moveBetweenContainers };
}
