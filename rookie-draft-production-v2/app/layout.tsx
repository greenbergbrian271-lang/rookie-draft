import type {Metadata} from "next";
import "./globals.css";
import Nav from "./nav";
import ToolMenus from "./tool-menus";
import Brand from "./brand";
import AdminStatus from "@/components/AdminStatus";
import DocumentTitle from "@/components/DocumentTitle";
import {PlayerProfileProvider} from "@/components/PlayerProfile";
export const metadata:Metadata={title:"Rookie Draft",description:"College prospect scouting, grading and rookie draft command center."};
export default function Layout({children}:{children:React.ReactNode}){return <html><body><DocumentTitle/><div className="shell"><aside className="side"><Brand/><AdminStatus/><Nav/></aside><section className="workspace"><ToolMenus/><main className="main"><PlayerProfileProvider>{children}</PlayerProfileProvider></main></section></div></body></html>}
