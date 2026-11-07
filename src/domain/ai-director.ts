/** Editorial model routing. Never authorises World state changes. */
export type AiTask="RINGSIDE"|"SHORT_NEWS"|"CREATIVE_PITCH";
export type GroqModel="openai/gpt-oss-120b"|"openai/gpt-oss-20b";
export const DEFAULT_GROQ_MODEL:GroqModel="openai/gpt-oss-120b";
export function chooseGroqModel(task:AiTask,preferred?:GroqModel):GroqModel{
 return task==="RINGSIDE"?(preferred??DEFAULT_GROQ_MODEL):"openai/gpt-oss-20b";
}
export type GroqUsage={inputTokens:number;outputTokens:number};
export function groqResponseUsage(raw:unknown):GroqUsage|null{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
 const value=(raw as Record<string,unknown>).usage;
 if(!value||typeof value!=="object"||Array.isArray(value))return null;
 const v=value as Record<string,unknown>;
 const inp=v.prompt_tokens,out=v.completion_tokens;
 if(typeof inp!=="number"||typeof out!=="number"||
  !Number.isSafeInteger(inp)||!Number.isSafeInteger(out)||inp<0||out<0)return null;
 return {inputTokens:inp,outputTokens:out};
}
/** Reserve enough capacity for the entire possible completion and reasoning. */
export function estimatedGroqTokens(requestBody:string,maxCompletionTokens:number){
 if(requestBody.length>85000||!Number.isSafeInteger(maxCompletionTokens)||
  maxCompletionTokens<1||maxCompletionTokens>8000)
  throw new Error("Groq editorial request exceeds bounded budget");
 return Math.ceil(requestBody.length/3)+maxCompletionTokens;
}
