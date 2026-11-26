export interface BackstageManagementContext {
 contractExpires: number;
 remainingDates: number | null;
 strongMatches: number;
 programmeId: string | null;
 championshipId: string | null;
 lastChapterWeek: number | null;
}

export function managementWeek(weekIndex: number): string {
 return "Y"+(Math.floor(weekIndex/52)+1)+" W"+(weekIndex%52+1);
}

export function managementContractHorizon(
 context: BackstageManagementContext,
): string {
 const expires="The deal runs through "+managementWeek(context.contractExpires)+".";
 return context.remainingDates===null?expires:expires+" "+
  (context.remainingDates===1?"One paid appearance remains.":context.remainingDates+" paid appearances remain.");
}
