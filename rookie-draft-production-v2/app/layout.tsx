import "./globals.css";
import Nav from "./nav";
import ToolMenus from "./tool-menus";

export default function Layout({children}:{children:React.ReactNode}){
  return <html><body><div className="shell"><aside className="side"><div className="brand">Rookie Draft <span className="cyan">2027</span><small>Scouting Command Center</small></div><Nav/></aside><section className="workspace"><ToolMenus/><main className="main">{children}</main></section></div></body></html>
}