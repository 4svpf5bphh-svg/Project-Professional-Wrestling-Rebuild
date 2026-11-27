import "./choice-dialog.css";

interface Choice {
 value:string;
 label:string;
 disabled?:boolean;
}

export function createChoiceDialog(label:string,value:string,choices:readonly Choice[],
 onSelect:(value:string)=>void,disabled=false):HTMLElement{
 const field=document.createElement("div");
 field.className="ppw-choice-field";
 field.dataset.choiceLabel=label;
 const caption=document.createElement("span");
 caption.textContent=label;
 const trigger=document.createElement("button");
 trigger.type="button";
 trigger.className="ppw-choice-trigger";
 trigger.textContent=choices.find(choice=>choice.value===value)?.label??"Choose";
 trigger.setAttribute("aria-label",label+" · "+trigger.textContent);
 trigger.setAttribute("aria-haspopup","dialog");
 trigger.disabled=disabled;
 field.append(caption,trigger);
 trigger.onclick=()=>{
  const dialog=document.createElement("dialog");
  dialog.className="ppw-choice-dialog";
  dialog.setAttribute("aria-label",label);
  dialog.onkeydown=event=>event.stopPropagation();
  const head=document.createElement("header");
  const heading=document.createElement("h2");
  heading.textContent=label;
  const close=document.createElement("button");
  close.type="button";close.textContent="Close";
  close.onclick=()=>dialog.close();
  head.append(heading,close);dialog.append(head);
  const list=document.createElement("div");
  list.className="ppw-choice-options";
  let activeChoice:HTMLButtonElement|undefined;
  for(const choice of choices){
   const option=document.createElement("button");
   option.type="button";option.textContent=choice.label;
   option.disabled=choice.disabled===true;
   option.setAttribute("aria-pressed",String(choice.value===value));
   if(choice.value===value)activeChoice=option;
   option.onclick=()=>{
    dialog.close();
    if(choice.value!==value)onSelect(choice.value);
   };
   list.append(option);
  }
  if(choices.length>8){
   const search=document.createElement("input");
   search.type="search";search.placeholder="Find an option";
   search.setAttribute("aria-label","Search "+label.toLowerCase());
   const empty=document.createElement("p");
   empty.textContent="No matching options.";empty.hidden=true;
   search.oninput=()=>{
    const filter=search.value.trim().toLowerCase();
    let matches=0;
    for(const option of Array.from(list.querySelectorAll("button"))){
     option.hidden=!option.textContent?.toLowerCase().includes(filter);
     if(!option.hidden)matches++;
    }
    empty.hidden=matches>0;
   };
   list.append(empty);
   dialog.append(search);
  }
  dialog.append(list);
  dialog.onclose=()=>{
   dialog.remove();
   if(trigger.isConnected)trigger.focus({preventScroll:true});
  };
  field.append(dialog);
  dialog.showModal();
  (activeChoice??close).focus({preventScroll:true});
  activeChoice?.scrollIntoView({block:"nearest"});
 };
 return field;
}
