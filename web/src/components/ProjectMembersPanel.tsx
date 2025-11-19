import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProjectMember, ProjectRole, WorkspaceMember, WorkspaceRole } from "../api";
import {
  addProjectMember,
  getProjectMembers,
  getWorkspaceMembers,
  removeProjectMember,
  updateProjectMemberRole,
} from "../api";
import RoleBadge from "./RoleBadge";
import InviteMemberModal from "./InviteMemberModal";
import { useUserRole } from "../context/RoleContext";

interface ProjectMembersPanelProps {
  projectId: string;
  workspaceId: string | null;
  userId: string | null;
  projectRole: ProjectRole;
  workspaceRole: WorkspaceRole;
}

const PROJECT_ROLE_OPTIONS: ProjectRole[] = ["owner", "contributor", "viewer"];

export default function ProjectMembersPanel({
  projectId,
  workspaceId,
  userId,
  projectRole,
  workspaceRole,
}: ProjectMembersPanelProps) {
  const { refreshProjectRole } = useUserRole();
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const canManage = projectRole === "owner" || workspaceRole === "admin";

  const loadMembers = useCallback(async () => {
    if (!workspaceId || !userId) return;
    setLoading(true);
    setError(null);
    try {
      const list = await getProjectMembers(projectId, workspaceId, userId);
      setMembers(list);
    } catch (err: any) {
      setError(err.message || "Failed to load project members");
    } finally {
      setLoading(false);
    }
  }, [projectId, workspaceId, userId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    if (!canManage || !workspaceId || !userId) {
      setWorkspaceMembers([]);
      return;
    }
    getWorkspaceMembers(workspaceId, userId)
      .then((list) => setWorkspaceMembers(list))
      .catch((err) => console.error("Failed to load workspace members", err));
  }, [canManage, workspaceId, userId]);

  const availableInvitees = useMemo(() => {
    if (!workspaceId) return [];
    const currentUserIds = new Set(members.map((member) => member.user_id));
    return workspaceMembers.filter((member) => !currentUserIds.has(member.user_id));
  }, [members, workspaceMembers, workspaceId]);

  const handleInvite = useCallback(
    async (targetUserId: string, role: ProjectRole) => {
      if (!workspaceId || !userId) throw new Error("Missing workspace context");
      setSuccess(null);
      setError(null);
      await addProjectMember(projectId, workspaceId, { user_id: targetUserId, role }, userId);
      await loadMembers();
      setSuccess("Invitation sent");
    },
    [projectId, workspaceId, userId, loadMembers]
  );

  const handleRoleChange = useCallback(
    async (memberId: string, role: ProjectRole) => {
      if (!workspaceId || !userId) return;
      const target = members.find((member) => member.id === memberId);
      const affectsSelf = target?.user_id === userId;
      try {
        await updateProjectMemberRole(projectId, memberId, workspaceId, role, userId);
        await loadMembers();
        setSuccess("Member role updated");
        if (affectsSelf) {
          await refreshProjectRole(projectId, workspaceId, userId);
        }
      } catch (err: any) {
        setError(err.message || "Failed to update member");
      }
    },
    [projectId, workspaceId, userId, loadMembers, members, refreshProjectRole]
  );

  const handleRemove = useCallback(
    async (memberId: string) => {
      if (!workspaceId || !userId) return;
      const target = members.find((member) => member.id === memberId);
      const affectsSelf = target?.user_id === userId;
      try {
        await removeProjectMember(projectId, memberId, workspaceId, userId);
        await loadMembers();
        setSuccess("Member removed");
        if (affectsSelf) {
          await refreshProjectRole(projectId, workspaceId, userId);
        }
      } catch (err: any) {
        setError(err.message || "Failed to remove member");
      }
    },
    [projectId, workspaceId, userId, loadMembers, members, refreshProjectRole]
  );

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-2xl font-bold">Project members</h3>
            <p className="text-sm text-slate-500">
              Members inherit workspace access but can be promoted per project.
            </p>
            {!canManage && (
              <p className="mt-1 text-xs text-amber-600">
                Only project owners or workspace admins can modify access.
              </p>
            )}
          </div>
        <div className="flex items-center gap-2">
          <RoleBadge role={projectRole} />
          {canManage && (
            <button
              onClick={() => setInviteOpen(true)}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              disabled={availableInvitees.length === 0}
            >
              Invite member
            </button>
          )}
        </div>
        </div>

        {(success || error) && (
          <div className="mb-4 space-y-2">
            {success && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                {success}
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
                {error}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
            Loading project members...
          </div>
        ) : members.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
            No members yet. Invite workspace collaborators to this project.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <th className="pb-3 pr-3">Member</th>
                  <th className="pb-3 pr-3">Role</th>
                  <th className="pb-3 pr-3">Joined</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const key = member.id ?? member.user_id;
                  const inherited = member.inherited;
                  const joined = member.joined_at ? new Date(member.joined_at).toLocaleDateString() : "—";
                  return (
                    <tr key={key} className="border-t border-slate-100 text-slate-600">
                      <td className="py-3 pr-3">
                        <div className="font-medium text-slate-900">{member.display_name || member.email}</div>
                        <div className="text-xs text-slate-500">{member.email}</div>
                      </td>
                      <td className="py-3 pr-3">
                        {canManage && member.id && !inherited ? (
                          <select
                            value={member.role}
                            onChange={(event) =>
                              handleRoleChange(member.id as string, event.target.value as ProjectRole)
                            }
                            className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
                          >
                            {PROJECT_ROLE_OPTIONS.map((roleOption) => (
                              <option key={roleOption} value={roleOption}>
                                {roleOption.charAt(0).toUpperCase() + roleOption.slice(1)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="flex items-center gap-2">
                            <RoleBadge role={member.role} />
                            {inherited && (
                              <span className="text-xs text-slate-400">Workspace admin</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3 pr-3 text-sm text-slate-500">{joined}</td>
                      <td className="py-3 text-right">
                        {canManage && member.id && !inherited ? (
                          <button
                            onClick={() => handleRemove(member.id as string)}
                            className="text-sm font-semibold text-rose-600 transition hover:text-rose-700"
                          >
                            Remove
                          </button>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

        {canManage && (
          <InviteMemberModal
            mode="project"
            open={inviteOpen}
            onInviteProject={handleInvite}
            availableMembers={availableInvitees}
            onClose={() => setInviteOpen(false)}
          />
        )}
        {canManage && availableInvitees.length === 0 && (
          <p className="text-xs text-slate-400">
            Every workspace member already has access to this project.
          </p>
        )}
      </div>
  );
}
