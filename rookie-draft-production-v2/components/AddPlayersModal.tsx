"use client";
export default function AddPlayersModal({open,onClose}:{open:boolean;onClose:()=>void}){
  if(!open)return null;
  return <div className="tool-modal-backdrop"><div className="tool-modal"><h2>Add Player diagnostic</h2><button onClick={onClose}>Close</button></div></div>;
}
