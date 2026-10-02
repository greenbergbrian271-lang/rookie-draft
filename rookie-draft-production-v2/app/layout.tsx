import "./globals.css";
import Nav from "./nav";
import ClassAwareToolMenus from "./class-aware-tool-menus";
import ClassContextGate from "./class-context-gate";
import Brand from "./brand";
import {PlayerProfileProvider} from "@/components/PlayerProfile";

export default function Layout({children}:{children:React.ReactNode}){
  return <html><body><div className="shell"><aside className="side"><Brand/><Nav/></aside><section className="workspace"><ClassAwareToolMenus/><main className="main"><PlayerProfileProvider><ClassContextGate>{children}</ClassContextGate></PlayerProfileProvider></main></section></div></body></html>
}