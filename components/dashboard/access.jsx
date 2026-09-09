"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fetchAccess, saveAccess, deleteAccess } from "@/lib/api";

const ROLE_HINT = {
  admin: "Full access — can edit everything and manage who has access.",
  editor: "Can edit statuses, comments, credits and revisions.",
  viewer: "Read-only — sees everything live but can't make changes.",
};

export function AccessPage({ role, currentEmail, showToast }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ email: "", role: "viewer", notes: "" });
  const [savingRow, setSavingRow] = useState(null);

  const isAdmin = role === "admin";

  // Runs once (per isAdmin flip). All state updates happen inside the
  // promise's then/catch rather than synchronously in the effect body.
  useEffect(() => {
    if (!isAdmin) return;
    let ignore = false;
    fetchAccess()
      .then((data) => {
        if (ignore) return;
        setList(data.list || []);
        setError(null);
      })
      .catch((e) => {
        if (ignore) return;
        setError(e.message || "Failed to load access list");
      });
    return () => {
      ignore = true;
    };
  }, [isAdmin]);
  const loading = list === null && !error;

  if (!isAdmin) {
    return (
      <div className="rounded-[20px] border border-border bg-card p-8 text-center text-sm text-muted-foreground rise">
        Only admins can manage access. Ask an existing admin to add you here if you need this.
      </div>
    );
  }

  const changeRole = async (email, newRole) => {
    setSavingRow(email);
    try {
      const current = list.find((r) => r.email === email);
      await saveAccess({ email, role: newRole, notes: current?.notes || "" });
      setList((prev) => prev.map((r) => (r.email === email ? { ...r, role: newRole } : r)));
      showToast?.(`${email} is now ${newRole}`);
    } catch (e) {
      showToast?.(e.message || "Failed to update role", "error");
    } finally {
      setSavingRow(null);
    }
  };

  const remove = async (email) => {
    if (email === currentEmail) return;
    setSavingRow(email);
    try {
      await deleteAccess({ email });
      setList((prev) => prev.filter((r) => r.email !== email));
      showToast?.(`Removed ${email}`);
    } catch (e) {
      showToast?.(e.message || "Failed to remove access", "error");
    } finally {
      setSavingRow(null);
    }
  };

  const addNew = async (e) => {
    e.preventDefault();
    const email = form.email.trim().toLowerCase();
    if (!email) return;
    setSavingRow(email);
    try {
      const result = await saveAccess({ email, role: form.role, notes: form.notes.trim() });
      setList((prev) => {
        const without = prev.filter((r) => r.email !== result.email);
        return [...without, result].sort((a, b) => a.email.localeCompare(b.email));
      });
      setForm({ email: "", role: "viewer", notes: "" });
      showToast?.(`Added ${result.email} as ${result.role}`);
    } catch (e2) {
      showToast?.(e2.message || "Failed to add access", "error");
    } finally {
      setSavingRow(null);
    }
  };

  return (
    <div className="rounded-[20px] border border-border bg-card p-5 rise">
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck className="size-4 text-primary" />
        <h2 className="f-heading font-bold text-sm text-foreground">Access &amp; roles</h2>
        <span className="text-xs text-muted-foreground">who can view, edit, or manage this board</span>
      </div>

      <form onSubmit={addNew} className="flex gap-2 items-center flex-wrap mb-5 p-3 rounded-xl bg-secondary/40 border border-border">
        <Input
          type="email"
          required
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          placeholder="name@company.com"
          className="flex-1 min-w-[200px]"
        />
        <Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
          <option value="admin">Admin</option>
        </Select>
        <Input
          type="text"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder="Notes (optional)"
          className="flex-1 min-w-[140px]"
        />
        <Button type="submit" size="sm" disabled={savingRow != null}>
          <UserPlus className="size-3.5" /> Add
        </Button>
      </form>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : list === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !list.length ? (
        <p className="text-sm text-muted-foreground">No one has explicit access yet — everyone defaults to viewer.</p>
      ) : (
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Email", "Role", "Notes", ""].map((h) => (
                  <th key={h} className="text-left text-[10.5px] font-bold uppercase tracking-wide px-3 py-2 text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.email} className="border-b border-border last:border-0">
                  <td className="py-2.5 px-3 text-sm font-semibold text-foreground">
                    {r.email}
                    {r.email === currentEmail ? (
                      <span className="ml-1.5 text-[10px] font-bold text-muted-foreground">(you)</span>
                    ) : null}
                  </td>
                  <td className="py-2.5 px-3">
                    <Select
                      value={r.role}
                      disabled={savingRow === r.email || r.email === currentEmail}
                      onChange={(e) => changeRole(r.email, e.target.value)}
                      title={ROLE_HINT[r.role]}
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                      <option value="admin">Admin</option>
                    </Select>
                  </td>
                  <td className="py-2.5 px-3 text-xs text-muted-foreground max-w-[220px] truncate" title={r.notes}>
                    {r.notes || "—"}
                  </td>
                  <td className="py-2.5 px-3">
                    <button
                      type="button"
                      onClick={() => remove(r.email)}
                      disabled={savingRow === r.email || r.email === currentEmail}
                      className="text-muted-foreground hover:text-destructive disabled:opacity-40"
                      title={r.email === currentEmail ? "You can't remove your own access" : "Remove access"}
                      aria-label="Remove access"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
