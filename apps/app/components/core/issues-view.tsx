import { useCallback, useState } from "react";

import { useRouter } from "next/router";

import useSWR, { mutate } from "swr";

// react-beautiful-dnd
import { DropResult } from "react-beautiful-dnd";
// services
import issuesService from "services/issues.service";
import stateService from "services/state.service";
import projectService from "services/project.service";
import modulesService from "services/modules.service";
// hooks
import useIssueView from "hooks/use-issue-view";
// components
import { AllLists, AllBoards, ExistingIssuesListModal } from "components/core";
import { CreateUpdateIssueModal, DeleteIssueModal } from "components/issues";
// types
import {
  CycleIssueResponse,
  IIssue,
  IssueResponse,
  IState,
  ModuleIssueResponse,
  UserAuth,
} from "types";
// fetch-keys
import {
  CYCLE_ISSUES,
  MODULE_ISSUES,
  PROJECT_ISSUES_LIST,
  PROJECT_MEMBERS,
  STATE_LIST,
} from "constants/fetch-keys";

type Props = {
  type?: "issue" | "cycle" | "module";
  issues: IIssue[];
  openIssuesListModal?: () => void;
  userAuth: UserAuth;
};

export const IssuesView: React.FC<Props> = ({
  type = "issue",
  issues,
  openIssuesListModal,
  userAuth,
}) => {
  // create issue modal
  const [createIssueModal, setCreateIssueModal] = useState(false);
  const [preloadedData, setPreloadedData] = useState<
    (Partial<IIssue> & { actionType: "createIssue" | "edit" | "delete" }) | undefined
  >(undefined);

  // updates issue modal
  const [editIssueModal, setEditIssueModal] = useState(false);
  const [issueToEdit, setIssueToEdit] = useState<
    (IIssue & { actionType: "edit" | "delete" }) | undefined
  >(undefined);

  // delete issue modal
  const [deleteIssueModal, setDeleteIssueModal] = useState(false);
  const [issueToDelete, setIssueToDelete] = useState<IIssue | null>(null);

  const router = useRouter();
  const { workspaceSlug, projectId, cycleId, moduleId } = router.query;

  const { issueView, groupedByIssues, groupByProperty: selectedGroup } = useIssueView(issues);

  const { data: states, mutate: mutateState } = useSWR<IState[]>(
    workspaceSlug && projectId ? STATE_LIST(projectId as string) : null,
    workspaceSlug
      ? () => stateService.getStates(workspaceSlug as string, projectId as string)
      : null
  );

  const { data: members } = useSWR(
    projectId ? PROJECT_MEMBERS(projectId as string) : null,
    workspaceSlug && projectId
      ? () => projectService.projectMembers(workspaceSlug as string, projectId as string)
      : null
  );

  const handleOnDragEnd = useCallback(
    (result: DropResult) => {
      if (!result.destination || !workspaceSlug || !projectId) return;

      const { source, destination, type } = result;

      if (type === "state") {
        const newStates = Array.from(states ?? []);
        const [reorderedState] = newStates.splice(source.index, 1);
        newStates.splice(destination.index, 0, reorderedState);
        const prevSequenceNumber = newStates[destination.index - 1]?.sequence;
        const nextSequenceNumber = newStates[destination.index + 1]?.sequence;

        const sequenceNumber =
          prevSequenceNumber && nextSequenceNumber
            ? (prevSequenceNumber + nextSequenceNumber) / 2
            : nextSequenceNumber
            ? nextSequenceNumber - 15000 / 2
            : prevSequenceNumber
            ? prevSequenceNumber + 15000 / 2
            : 15000;

        newStates[destination.index].sequence = sequenceNumber;

        mutateState(newStates, false);

        stateService
          .patchState(
            workspaceSlug as string,
            projectId as string,
            newStates[destination.index].id,
            {
              sequence: sequenceNumber,
            }
          )
          .then((response) => {
            console.log(response);
          })
          .catch((err) => {
            console.error(err);
          });
      } else {
        const draggedItem = groupedByIssues[source.droppableId][source.index];
        if (source.droppableId !== destination.droppableId) {
          const sourceGroup = source.droppableId; // source group id
          const destinationGroup = destination.droppableId; // destination group id

          if (!sourceGroup || !destinationGroup) return;

          if (selectedGroup === "priority") {
            // update the removed item for mutation
            draggedItem.priority = destinationGroup;

            if (cycleId)
              mutate<CycleIssueResponse[]>(
                CYCLE_ISSUES(cycleId as string),
                (prevData) => {
                  if (!prevData) return prevData;
                  const updatedIssues = prevData.map((issue) => {
                    if (issue.issue_detail.id === draggedItem.id) {
                      return {
                        ...issue,
                        issue_detail: {
                          ...draggedItem,
                          priority: destinationGroup,
                        },
                      };
                    }
                    return issue;
                  });
                  return [...updatedIssues];
                },
                false
              );

            if (moduleId)
              mutate<ModuleIssueResponse[]>(
                MODULE_ISSUES(moduleId as string),
                (prevData) => {
                  if (!prevData) return prevData;
                  const updatedIssues = prevData.map((issue) => {
                    if (issue.issue_detail.id === draggedItem.id) {
                      return {
                        ...issue,
                        issue_detail: {
                          ...draggedItem,
                          priority: destinationGroup,
                        },
                      };
                    }
                    return issue;
                  });
                  return [...updatedIssues];
                },
                false
              );

            mutate<IssueResponse>(
              PROJECT_ISSUES_LIST(workspaceSlug as string, projectId as string),
              (prevData) => {
                if (!prevData) return prevData;

                const updatedIssues = prevData.results.map((issue) => {
                  if (issue.id === draggedItem.id)
                    return {
                      ...draggedItem,
                      priority: destinationGroup,
                    };

                  return issue;
                });

                return {
                  ...prevData,
                  results: updatedIssues,
                };
              },
              false
            );

            // patch request
            issuesService
              .patchIssue(workspaceSlug as string, projectId as string, draggedItem.id, {
                priority: destinationGroup,
              })
              .then((res) => {
                mutate(
                  cycleId
                    ? CYCLE_ISSUES(cycleId as string)
                    : CYCLE_ISSUES(draggedItem.issue_cycle?.cycle ?? "")
                );
                mutate(
                  moduleId
                    ? MODULE_ISSUES(moduleId as string)
                    : MODULE_ISSUES(draggedItem.issue_module?.module ?? "")
                );

                mutate(PROJECT_ISSUES_LIST(workspaceSlug as string, projectId as string));
              });
          } else if (selectedGroup === "state_detail.name") {
            const destinationState = states?.find((s) => s.name === destinationGroup);
            const destinationStateId = destinationState?.id;

            // update the removed item for mutation
            if (!destinationStateId || !destinationState) return;
            draggedItem.state = destinationStateId;
            draggedItem.state_detail = destinationState;

            if (cycleId)
              mutate<CycleIssueResponse[]>(
                CYCLE_ISSUES(cycleId as string),
                (prevData) => {
                  if (!prevData) return prevData;
                  const updatedIssues = prevData.map((issue) => {
                    if (issue.issue_detail.id === draggedItem.id) {
                      return {
                        ...issue,
                        issue_detail: {
                          ...draggedItem,
                          state_detail: destinationState,
                          state: destinationStateId,
                        },
                      };
                    }
                    return issue;
                  });
                  return [...updatedIssues];
                },
                false
              );

            if (moduleId)
              mutate<ModuleIssueResponse[]>(
                MODULE_ISSUES(moduleId as string),
                (prevData) => {
                  if (!prevData) return prevData;
                  const updatedIssues = prevData.map((issue) => {
                    if (issue.issue_detail.id === draggedItem.id) {
                      return {
                        ...issue,
                        issue_detail: {
                          ...draggedItem,
                          state_detail: destinationState,
                          state: destinationStateId,
                        },
                      };
                    }
                    return issue;
                  });
                  return [...updatedIssues];
                },
                false
              );

            mutate<IssueResponse>(
              PROJECT_ISSUES_LIST(workspaceSlug as string, projectId as string),
              (prevData) => {
                if (!prevData) return prevData;

                const updatedIssues = prevData.results.map((issue) => {
                  if (issue.id === draggedItem.id)
                    return {
                      ...draggedItem,
                      state_detail: destinationState,
                      state: destinationStateId,
                    };

                  return issue;
                });

                return {
                  ...prevData,
                  results: updatedIssues,
                };
              },
              false
            );

            // patch request
            issuesService
              .patchIssue(workspaceSlug as string, projectId as string, draggedItem.id, {
                state: destinationStateId,
              })
              .then((res) => {
                mutate(
                  cycleId
                    ? CYCLE_ISSUES(cycleId as string)
                    : CYCLE_ISSUES(draggedItem.issue_cycle?.cycle ?? "")
                );
                mutate(
                  moduleId
                    ? MODULE_ISSUES(moduleId as string)
                    : MODULE_ISSUES(draggedItem.issue_module?.module ?? "")
                );
                mutate(PROJECT_ISSUES_LIST(workspaceSlug as string, projectId as string));
              });
          }
        }
      }
    },
    [
      workspaceSlug,
      cycleId,
      moduleId,
      mutateState,
      groupedByIssues,
      projectId,
      selectedGroup,
      states,
    ]
  );

  const addIssueToState = (groupTitle: string, stateId: string | null) => {
    setCreateIssueModal(true);
    if (selectedGroup)
      setPreloadedData({
        state: stateId ?? undefined,
        [selectedGroup]: groupTitle,
        actionType: "createIssue",
      });
    else setPreloadedData({ actionType: "createIssue" });
  };

  const handleEditIssue = (issue: IIssue) => {
    setEditIssueModal(true);
    setIssueToEdit({
      ...issue,
      actionType: "edit",
      cycle: issue.issue_cycle ? issue.issue_cycle.cycle : null,
      module: issue.issue_module ? issue.issue_module.module : null,
    });
  };

  const handleDeleteIssue = (issue: IIssue) => {
    setDeleteIssueModal(true);
    setIssueToDelete(issue);
  };

  const removeIssueFromCycle = (bridgeId: string) => {
    if (!workspaceSlug || !projectId) return;

    mutate<CycleIssueResponse[]>(
      CYCLE_ISSUES(cycleId as string),
      (prevData) => prevData?.filter((p) => p.id !== bridgeId),
      false
    );

    issuesService
      .removeIssueFromCycle(
        workspaceSlug as string,
        projectId as string,
        cycleId as string,
        bridgeId
      )
      .then((res) => {
        console.log(res);
      })
      .catch((e) => {
        console.log(e);
      });
  };

  const removeIssueFromModule = (bridgeId: string) => {
    if (!workspaceSlug || !projectId) return;

    mutate<ModuleIssueResponse[]>(
      MODULE_ISSUES(moduleId as string),
      (prevData) => prevData?.filter((p) => p.id !== bridgeId),
      false
    );

    modulesService
      .removeIssueFromModule(
        workspaceSlug as string,
        projectId as string,
        moduleId as string,
        bridgeId
      )
      .then((res) => {
        console.log(res);
      })
      .catch((e) => {
        console.log(e);
      });
  };

  return (
    <>
      <CreateUpdateIssueModal
        isOpen={createIssueModal && preloadedData?.actionType === "createIssue"}
        handleClose={() => setCreateIssueModal(false)}
        prePopulateData={{
          ...preloadedData,
        }}
      />
      <CreateUpdateIssueModal
        isOpen={editIssueModal && issueToEdit?.actionType !== "delete"}
        prePopulateData={{ ...issueToEdit }}
        handleClose={() => setEditIssueModal(false)}
        data={issueToEdit}
      />
      <DeleteIssueModal
        handleClose={() => setDeleteIssueModal(false)}
        isOpen={deleteIssueModal}
        data={issueToDelete}
      />
      {issueView === "list" ? (
        <AllLists
          type={type}
          issues={issues}
          states={states}
          members={members}
          addIssueToState={addIssueToState}
          handleEditIssue={handleEditIssue}
          handleDeleteIssue={handleDeleteIssue}
          openIssuesListModal={type !== "issue" ? openIssuesListModal : null}
          removeIssue={
            type === "cycle"
              ? removeIssueFromCycle
              : type === "module"
              ? removeIssueFromModule
              : null
          }
          userAuth={userAuth}
        />
      ) : (
        <AllBoards
          type={type}
          issues={issues}
          states={states}
          members={members}
          addIssueToState={addIssueToState}
          openIssuesListModal={type !== "issue" ? openIssuesListModal : null}
          handleDeleteIssue={handleDeleteIssue}
          handleOnDragEnd={handleOnDragEnd}
          userAuth={userAuth}
        />
      )}
    </>
  );
};
