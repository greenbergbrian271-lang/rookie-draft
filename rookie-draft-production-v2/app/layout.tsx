import "./globals.css";
import Nav from "./nav";

export default function Layout({children}:{children:React.ReactNode}){
  return <html><body><div className="shell"><aside className="side"><div className="brand">Rookie Draft <span className="cyan">2027</span><small>Scouting Command Center</small></div><Nav/></aside><main className="main">{children}</main></div></body></html>
}