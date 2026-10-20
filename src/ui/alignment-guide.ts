/** One local and honest explanation of character alignments. Not a match
 * prediction, additional World query or implied gameplay state. */
export const ALIGNMENT_GUIDE=[
 {code:"FACE",title:"Face",short:"Crowd favourite",
  meaning:"Presented for fans to cheer. A feud against a heel gives audiences a clear hero and antagonist."},
 {code:"HEEL",title:"Heel",short:"Crowd antagonist",
  meaning:"Presented for fans to boo. A feud against a face creates clearer crowd expectations."},
 {code:"TWEENER",title:"Tweener",short:"Unpredictable",
  meaning:"Morally ambiguous. Can oppose either side, but fans may have a less obvious favourite."}
] as const;
export function createAlignmentGuide():HTMLDetailsElement{
 const guide=document.createElement("details");
 guide.className="ppw-alignment-guide";
 const summary=document.createElement("summary");
 summary.textContent="Face, heel or tweener? · Why it matters";guide.append(summary);
 const intro=document.createElement("p");
 intro.textContent="Character alignments guide how audiences see wrestlers, not guaranteed match outcomes.";
 guide.append(intro);
 const grid=document.createElement("div");grid.className="ppw-alignment-guide-grid";
 for(const item of ALIGNMENT_GUIDE){
  const row=document.createElement("div");row.className="ppw-alignment-guide-item";
  row.dataset.alignment=item.code;
  const title=document.createElement("strong");
  title.textContent=item.title+" · "+item.short;
  const body=document.createElement("span");body.textContent=item.meaning;
  row.append(title,body);grid.append(row);
 }
 guide.append(grid);return guide;
}
