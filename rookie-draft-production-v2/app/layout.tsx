import "./globals.css";
import Nav from "./nav";
import ToolMenus from "./tool-menus";
import Brand from "./brand";
import {PlayerProfileProvider} from "@/components/PlayerProfile";

export default function Layout({children}:{children:React.ReactNode}){
  return <html><body><div className="shell"><aside className="side"><Brand/><Nav/></aside><section className="workspace"><ToolMenus/><main className="main"><PlayerProfileProvider>{children}</PlayerProfileProvider></main></section></div></body></html>
}