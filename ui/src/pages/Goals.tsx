import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { goalsApi } from "../api/goals";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { GoalTree } from "../components/GoalTree";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/boared/PageHeader";
import { SectionRule } from "@/components/boared/Kicker";
import { Target, Plus } from "lucide-react";

export function Goals() {
  const { selectedCompanyId } = useCompany();
  const { openNewGoal } = useDialog();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Goals" }]);
  }, [setBreadcrumbs]);

  const { data: goals, isLoading, error } = useQuery({
    queryKey: queryKeys.goals.list(selectedCompanyId!),
    queryFn: () => goalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={Target} message="Select a company to view goals." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="boared-reveal max-w-[1400px] mx-auto">
      <PageHeader
        kicker={<>§10 · Goals</>}
        title={
          <>
            The <em className="not-italic font-normal">long</em>
            <br />
            view.
          </>
        }
        dateline="Objectives, sub-goals, and the threads between them."
        actions={
          goals && goals.length > 0 ? (
            <Button size="sm" variant="outline" onClick={() => openNewGoal()}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New goal
            </Button>
          ) : undefined
        }
      />

      {error && (
        <div className="mb-6 px-4 py-3 border border-destructive text-destructive font-mono text-[0.72rem]">
          {error.message}
        </div>
      )}

      {goals && goals.length === 0 && (
        <EmptyState
          icon={Target}
          message="No goals yet."
          action="Add goal"
          onAction={() => openNewGoal()}
        />
      )}

      {goals && goals.length > 0 && (
        <>
          <SectionRule label="Goal tree" meta={`${goals.length} total`} />
          <GoalTree goals={goals} goalLink={(goal) => `/goals/${goal.id}`} />
        </>
      )}
    </div>
  );
}
