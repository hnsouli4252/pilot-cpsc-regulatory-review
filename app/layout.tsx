import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
export async function generateMetadata():Promise<Metadata>{
 const requestHeaders=await headers();
 const host=requestHeaders.get("x-forwarded-host")??requestHeaders.get("host")??"localhost:3000";
 const protocol=requestHeaders.get("x-forwarded-proto")??(host.startsWith("localhost")?"http":"https");
 const base=new URL(`${protocol}://${host}`);
 const title="CPSC Regulatory Review Workspace";
 const description="Review CPSC burden-reduction regulations, submissions, issue analysis, and draft recommended responses.";
 return {metadataBase:base,title,description,icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"},openGraph:{title,description,images:[{url:new URL("/og.png",base).toString(),width:1200,height:630}]},twitter:{card:"summary_large_image",title,description,images:[new URL("/og.png",base).toString()]}};
}
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>}
