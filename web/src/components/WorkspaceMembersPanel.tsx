import { useMemo, useState } from "react";
import type { WorkspaceInvitation, WorkspaceMember, WorkspaceRole } from "../api";
import RoleBadge from "./RoleBadge";
import InviteMemberModal from "./InviteMemberModal";

interface WorkspaceMembersPanelProps {
  workspaceName: string | null;
  workspaceRole: WorkspaceRole;
  currentUserId: string | null;
  members: WorkspaceMember[];
  invitations: WorkspaceInvitation[];
  loading: boolean;
  successMessage: string | null;
  errorMessage: string | null;
  canAdminWorkspace: boolean;
  onInvite: (email: string, role: WorkspaceRole) => Promise<void>;
  onRoleChange: (memberId: string, role: WorkspaceRole) => Promise<void>;
  onRemoveMember: (memberId: string) => Promise<void>;
}

const ROLE_OPTIONS: WorkspaceRole[] = ["admin", "editor", "viewer"];

export default function WorkspaceMembersPanel({
  workspaceName,
  workspaceRole,
  currentUserId,
  members,
  invitations,
  loading,
  successMessage,
  errorMessage,
  canAdminWorkspace,
  onInvite,
  onRoleChange,
  onRemoveMember,
}: WorkspaceMembersPanelProps) {
  const [inviteOpen, setInviteOpen] = useState(false);

  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      const nameA = a.display_name || a.email;
      const nameB = b.display_name || b.email;
      return nameA.localeCompare(nameB);
    });
  }, [members]);

  return (
    <section className="mt-8 space-y-6">
      <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-3xl font-bold">Workspace members</h2>
            <p className="mt-2 text-sm text-slate-500">
              Manage who can access {workspaceName ?? "this workspace"}.
            </p>
            {!canAdminWorkspace && (
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-700">
                403 · You have viewer access. Only admins can modify membership.
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <RoleBadge role={workspaceRole} />
            {canAdminWorkspace && (
              <button
                onClick={() => setInviteOpen(true)}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                Invite member
              </button>
            )}
          </div>
        </div>

        {(successMessage || errorMessage) && (
          <div className="mb-6 space-y-2">
            {successMessage && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                {successMessage}
              </div>
            )}
            {errorMessage && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
                {errorMessage}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
            Loading members...
          </div>
        ) : sortedMembers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
            No members found.
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
                {sortedMembers.map((member) => {
                  const canModify = canAdminWorkspace && member.user_id !== currentUserId;
                  return (
                    <tr key={member.id} className="border-t border-slate-100 text-slate-600">
                      <td className="py-3 pr-3">
                        <div className="font-medium text-slate-900">{member.display_name || member.email}</div>
                        <div className="text-xs text-slate-500">{member.email}</div>
                      </td>
                      <td className="py-3 pr-3">
                        {canModify ? (
                          <select
                            value={member.role}
                            onChange={(event) => onRoleChange(member.id, event.target.value as WorkspaceRole)}
                            className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
                          >
                            {ROLE_OPTIONS.map((roleOption) => (
                              <option key={roleOption} value={roleOption}>
                                {roleOption.charAt(0).toUpperCase() + roleOption.slice(1)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <RoleBadge role={member.role} />
                        )}
                      </td>
                      <td className="py-3 pr-3 text-sm text-slate-500">
                        {new Date(member.joined_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 text-right">
                        {canModify && (
                          <button
                            onClick={() => onRemoveMember(member.id)}
                            className="text-sm font-semibold text-rose-600 transition hover:text-rose-700"
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {canAdminWorkspace && invitations.length > 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-700">Pending invitations</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              {invitations.map((invite) => (
                <li key={invite.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                  <div>
                    <p className="font-medium text-slate-900">{invite.email}</p>
                    <p className="text-xs text-slate-500">
                      Role: {invite.role.charAt(0).toUpperCase() + invite.role.slice(1)} ·
                      Invited {new Date(invite.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="text-xs text-slate-400">
                    Expires {new Date(invite.expires_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <InviteMemberModal
        mode="workspace"
        open={inviteOpen}
        onInviteWorkspace={onInvite}
        onClose={() => setInviteOpen(false)}
      />
    </section>
  );
}
