"use client";

import { useRef, useState } from "react";
import { Trash2, UploadCloud } from "lucide-react";
import { saveProfile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";

const SIZE = 160;
const QUALITY = 0.82;

/**
 * Resizes and re-encodes the chosen picture in the browser before it is ever
 * uploaded.
 *
 * Doing it here rather than on the server means no image library in the
 * bundle, no storage bucket, and a payload of a few kilobytes instead of a
 * phone camera's 5 MB. It also centre-crops to a square, so a portrait photo
 * does not arrive squashed.
 */
function toSquareDataUrl(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Your browser could not process that image."));
      ctx.drawImage(
        img,
        (img.width - side) / 2,
        (img.height - side) / 2,
        side,
        side,
        0,
        0,
        SIZE,
        SIZE
      );
      resolve(canvas.toDataURL("image/jpeg", QUALITY));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be read as an image."));
    };
    img.src = url;
  });
}

export function ProfileDialog({ open, user, avatar, onSaved, onClose }) {
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  if (!open) return null;

  const shown = preview !== null ? preview : avatar;

  const pick = async (file) => {
    if (!file) return;
    setError("");
    try {
      setPreview(await toSquareDataUrl(file));
    } catch (e) {
      setError(e.message || "Could not read that image");
    }
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await saveProfile({ avatar: shown || "" });
      onSaved?.(res.profile);
      onClose();
    } catch (e) {
      setError(e.message || "Could not save your picture");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
      <div
        className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]"
        onClick={() => !saving && onClose()}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
        className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-lg rise"
      >
        <h2 id="profile-title" className="f-heading text-base font-bold text-foreground">
          Your picture
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone on the board sees this, next to the changes you make.
        </p>

        <div className="mt-4 flex items-center gap-4">
          <Avatar name={user?.name || user?.email} avatar={shown} size={72} />
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{user?.name || "You"}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()} disabled={saving}>
            <UploadCloud className="size-3.5" /> Choose a picture
          </Button>
          {shown ? (
            <Button variant="ghost" size="sm" onClick={() => setPreview("")} disabled={saving}>
              <Trash2 className="size-3.5" /> Remove
            </Button>
          ) : null}
        </div>

        {error ? (
          <p className="mt-3 text-sm" style={{ color: "var(--destructive)" }}>
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={saving || preview === null}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
