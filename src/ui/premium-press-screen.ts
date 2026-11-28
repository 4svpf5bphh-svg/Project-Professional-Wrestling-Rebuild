import "./premium-press-screen.css";
/** A certified PPV press event, always one question at a time.
 * No AI calls. Server decides persisted answers; history is immutable.
 */
import type {ScrumQuestionId} from "../domain/premium-media-scrum.js";
export type PremiumPressView={showId:string;showName?:string|null;dismissed:boolean;
 questions:{id:ScrumQuestionId;journalist:string;question:string;
  answers:readonly [string,string,string];answerIndex:number|null}[]};
export interface PremiumPressPort{
 read():Promise<PremiumPressView>;
 answer(id:ScrumQuestionId,index:number):Promise<{answerIndex:number}>;
 dismiss():Promise<{dismissed:boolean}>;
}
const el=(tag:string,cls="",text="")=>{
 const x=document.createElement(tag);x.className=cls;x.textContent=text;return x;
};
const button=(title:string,click:()=>void)=>{
 const b=el("button","ppw-press-action",title) as HTMLButtonElement;
 b.type="button";b.onclick=click;return b;
};
/** The caller loads the conference only when the manager opens it. */
export function mountPremiumPressScrum(root:HTMLElement,port:PremiumPressPort,
 view:PremiumPressView,onFinish:()=>void){
 const questions=view.dismissed?view.questions.filter(q=>q.answerIndex!==null):view.questions;
 let index=questions.findIndex(q=>q.answerIndex===null);
 if(index<0)index=0;
 let busy=false,finished=false,error="";
 root.classList.add("ppw-press-active");
 const finish=()=>{
  if(finished)return;finished=true;root.classList.remove("ppw-press-active");
  onFinish();
 };
 async function dismiss(){
  if(busy||finished)return;
  if(view.dismissed){finish();return;}
  busy=true;error="";draw();
  try{await port.dismiss();finish();}
  catch(e){error=e instanceof Error?e.message:"Could not close the conference";
   busy=false;draw();}
 }
 function draw(){
  if(finished)return;
  const shell=el("section","ppw-press-screen");
  const head=el("header","ppw-press-head");
  head.append(el("span","ppw-eyebrow","AFTER THE MAIN EVENT"),
   el("h1","","Meet the Press"),
   el("p","ppw-muted",view.showName??"Post-show press conference"));
  shell.append(head);
  const q=questions[index];
  if(!q){shell.append(button("Return to Results",finish));root.replaceChildren(shell);return;}
  shell.append(el("p","ppw-press-progress","QUESTION "+(index+1)+" OF "+questions.length));
  const card=el("article","ppw-press-question");
  card.append(el("strong","ppw-press-journalist",q.journalist),
   el("p","ppw-press-prompt",q.question));
  if(q.answerIndex!==null){
   card.append(el("blockquote","ppw-press-quote","“"+q.answers[q.answerIndex]+"”"));
   const next=button(index===questions.length-1?"Finish":"Next question",()=>{
    if(index===questions.length-1){void dismiss();return;}
    index++;draw();
   });
   next.disabled=busy;card.append(next);
  }else{
   const choices=el("div","ppw-press-choices");
   for(const [option,answer] of q.answers.entries()){
    const select=button(answer,()=>void (async()=>{
     if(busy)return;
     busy=true;error="";draw();
     try{
      const saved=await port.answer(q.id,option);
      q.answerIndex=saved.answerIndex;
      busy=false;index++;
      if(index===questions.length){void dismiss();return;}
      draw();
     }catch(e){error=e instanceof Error?e.message:"Could not record answer";
      busy=false;draw();}
    })());
    select.disabled=busy;choices.append(select);
   }
   card.append(choices);
  }
  shell.append(card);
  if(error)shell.append(el("p","ppw-alert ppw-error",error));
  const skip=button(busy?"Saving…":view.dismissed?"Return to Results":"Skip / End conference",()=>void dismiss());
  skip.disabled=busy;shell.append(skip);
  root.replaceChildren(shell);
 }
 draw();
}
