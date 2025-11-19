import { useEffect, useState } from "react";
import type { ProjectRole, WorkspaceMember, WorkspaceRole } from "../api";

interface WorkspaceInviteProps {
  mode: "workspace";
  onInviteWorkspace: (email: string, role: WorkspaceRole) => Promise<void>;
}

interface ProjectInviteProps {
  mode: "project";
  availableMembers: WorkspaceMember[];
  onInviteProject: (userId: string, role: ProjectRole) => Promise<void>;
}

type SharedProps = {
  open: boolean;
  onClose: () => void;
};

type InviteMemberModalProps = SharedProps & (WorkspaceInviteProps | ProjectInviteProps);

export default function InviteMemberModal(props: InviteMemberModalProps) {
  const [email, setEmail] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [workspaceRole, setWorkspaceRole] = useState<WorkspaceRole>("viewer");
  const [projectRole, setProjectRole] = useState<ProjectRole>("viewer");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open) {
      setEmail("");
      setSelectedUser("");
      setWorkspaceRole("viewer");
      setProjectRole("viewer");
      setError(null);
      setSubmitting(false);
    }
  }, [props.open]);

  if (!props.open) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (props.mode === "workspace") {
        const trimmed = email.trim();
        if (!trimmed) throw new Error("Email is required");
        await props.onInviteWorkspace(trimmed, workspaceRole);
      } else {
        if (!selectedUser) throw new Error("Select a workspace member to invite");
        await props.onInviteProject(selectedUser, projectRole);
      }
      props.onClose();
    } catch (err: any) {
      setError(err.message || "Failed to send invite");
    } finally {
      setSubmitting(false);
    }
  };

  const isProjectMode = props.mode === "project";
  const disableSubmit = isProjectMode ? !selectedUser || submitting : !email.trim() || submitting;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              {isProjectMode ? "Invite project member" : "Invite workspace member"}
            </h3>
            <p className="text-sm text-slate-500">
              {isProjectMode
                ? "Select an existing workspace member to grant project access."
                : "Send an email invitation to join this workspace."}
            </p>
          </div>
          <button onClick={props.onClose} className="text-slate-400 transition hover:text-slate-600">
            ✕
          </button>
        </div>

        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          {isProjectMode ? (
            <div>
              <label className="text-sm font-medium text-slate-700">Workspace member</label>
              <select
                value={selectedUser}
                onChange={(event) => setSelectedUser(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Select member</option>
                {props.availableMembers.map((member) => (
                  <option key={member.id} value={member.user_id}>
                    {member.display_name || member.email}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="text-sm font-medium text-slate-700">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="name@company.com"
              />
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-slate-700">Role</label>
            {isProjectMode ? (
              <select
                value={projectRole}
                onChange={(event) => setProjectRole(event.target.value as ProjectRole)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="owner">Owner</option>
                <option value="contributor">Contributor</option>
                <option value="viewer">Viewer</option>
              </select>
            ) : (
              <select
                value={workspaceRole}
                onChange={(event) => setWorkspaceRole(event.target.value as WorkspaceRole)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="admin">Admin</option>
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
            )}
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={props.onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={disableSubmit}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-60"
            >
              {submitting ? "Sending..." : "Send invite"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
