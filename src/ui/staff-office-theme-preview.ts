/** The KP preview intentionally uses the very same CSS classes and theme
 * attribute as the real Staff Office. Only the data is illustrative. */
import {staffOfficeThemeClass} from "../domain/staff-office-themes.js";
import "./staff-office-themes.css";
const el=(tag:string,cls:string,text="")=>{
 const n=document.createElement(tag);n.className=cls;n.textContent=text;return n;
};
export function createStaffOfficeThemePreview(style:string):HTMLElement{
 const root=el("div","ppw-staff ppw-staff-theme-preview");
 root.dataset.staffOfficeTheme=staffOfficeThemeClass(style);
 root.setAttribute("aria-label","Example of the Staff Office appearance");
 const header=el("header","ppw-staff-head");
 header.append(el("span","ppw-staff-kicker","THE OFFICE / BACKSTAGE"),el("h1","","Staff Office"));
 root.append(header);
 const metrics=el("div","ppw-staff-overview-grid");
 for(const [figure,label] of [["3/9","DEPARTMENTS"],["£4.2k","WEEKLY PAYROLL"],["£2.4m","CASH AVAILABLE"]]){
  const metric=el("div","ppw-staff-overview-metric");
  metric.append(el("strong","",figure),el("small","",label));metrics.append(metric);
 }
 root.append(metrics);
 const nav=el("nav","ppw-staff-nav");
 for(const [tab,i] of ["Meetings","My Staff","Contracts","Staff Market"].entries()){
  const b=el("span","ppw-staff-button",tab);
  b.setAttribute("aria-current",i===0?"page":"false");
  nav.append(b);
 }
 root.append(nav);
 const panel=el("section","ppw-staff-panel ppw-staff-meetings");
 panel.append(el("span","ppw-staff-kicker","STAFF MEETING"),el("h2","","Around the table"));
 const meeting=el("div","ppw-staff-meeting-brief");
 const summary=el("div","ppw-staff-preview-summary");
 const initials=el("span","ppw-staff-manager-avatar","MS");
 const details=el("div","ppw-staff-preview-person");
 details.append(el("strong","","Morgan Stone"),el("small","","Road Agent"));
 summary.append(initials,details);meeting.append(summary);
 meeting.append(el("p","ppw-staff-dialogue",
  "The opener looks strong. Keep the finish, but don't let the segment drag."));
 panel.append(meeting);root.append(panel);
 return root;
}
