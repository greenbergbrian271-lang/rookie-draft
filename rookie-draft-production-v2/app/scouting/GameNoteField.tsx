"use client";
import {memo,useEffect,useRef,useState} from "react";

/**
 * Typing-lag fix for the Scouting game log.
 *
 * The position workspaces (QB/RB/WR/TE) used to store every keystroke in the
 * workspace-level `sessions` state. That state feeds the player ranking memo, so
 * each key press re-graded + re-sorted every player and re-rendered every
 * player card. These fields keep the in-progress text locally and only hand it
 * to the workspace when the field loses focus (same moment the old code saved)
 * or unmounts, so typing never touches the heavy parent render.
 */
type FieldProps={value:string;onCommit:(v:string)=>void;as?:"input"|"textarea";placeholder?:string};

function GameNoteFieldBase({value,onCommit,as="textarea",placeholder}:FieldProps){
  const [text,setText]=useState(value);
  const focused=useRef(false);
  const live=useRef({text:value,saved:value,onCommit});
  live.current.onCommit=onCommit;

  useEffect(()=>{
    live.current.saved=value;
    if(!focused.current){setText(value);live.current.text=value}
  },[value]);

  const flush=()=>{const l=live.current;if(l.text!==l.saved){l.saved=l.text;l.onCommit(l.text)}};
  useEffect(()=>()=>flush(),[]);

  const handlers={
    value:text,
    placeholder,
    onFocus:()=>{focused.current=true},
    onChange:(e:{target:{value:string}})=>{live.current.text=e.target.value;setText(e.target.value)},
    onBlur:()=>{focused.current=false;flush()},
  };
  return as==="input"?<input {...handlers}/>:<textarea {...handlers}/>;
}
export const GameNoteField=memo(GameNoteFieldBase);

type NewGameProps={opponentPlaceholder:string;notesPlaceholder?:string;onAdd:(d:{opponent:string;notes:string})=>void;onCancel?:()=>void};

function NewGameFormBase({opponentPlaceholder,notesPlaceholder,onAdd,onCancel}:NewGameProps){
  const [opponent,setOpponent]=useState(""),[notes,setNotes]=useState("");
  const add=<button onClick={()=>onAdd({opponent,notes})}>Add to top</button>;
  return <div className="qb-game-note new">
    <input value={opponent} onChange={e=>setOpponent(e.target.value)} placeholder={opponentPlaceholder}/>
    <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder={notesPlaceholder}/>
    {onCancel?<div className="row-actions">{add}<button className="ghost" onClick={onCancel}>Cancel</button></div>:add}
  </div>;
}
export const NewGameForm=memo(NewGameFormBase);
