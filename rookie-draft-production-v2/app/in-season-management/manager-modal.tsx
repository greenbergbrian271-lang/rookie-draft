"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import type { ManagerCard } from "@/lib/in-season-managers";
import { ManagerDetail, ManagerAvatar } from "./managers-view";
import styles from "./in-season-management.module.css";

export default function ManagerModal({ card, loading, onClose }: { card: ManagerCard | null; loading: boolean; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className={styles.mgrBackdrop} role="presentation" onClick={onClose}>
      <div className={styles.mgrModal} role="dialog" aria-modal="true" aria-label={card ? `${card.name} manager card` : "Manager card"} onClick={(event) => event.stopPropagation()}>
        <button type="button" className={styles.mgrClose} onClick={onClose} aria-label="Close manager card"><X size={18} /></button>
        {!card ? <p className={styles.mgrMuted}>Manager not found.</p> : (
          <>
            <div className={styles.mgrModalHead}>
              <ManagerAvatar card={card} />
              <div><strong>{card.name}</strong><small>{card.leagues.length} shared league{card.leagues.length === 1 ? "" : "s"}</small></div>
            </div>
            <div className={styles.mgrTags}>{card.tags.map((tag) => <span key={tag.label} className={styles[`tag_${tag.tone}`]} title={tag.detail}>{tag.label}</span>)}</div>
            {loading && <p className={styles.leagueNote}>Loading trade and waiver history…</p>}
            <ManagerDetail card={card} />
          </>
        )}
      </div>
    </div>
  );
}
