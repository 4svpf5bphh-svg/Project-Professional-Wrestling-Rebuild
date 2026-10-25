/** Stable, non-sensitive corrections for rejected booking actions.
 * Do not return arbitrary exception strings to a browser: they may include
 * contract values, private promotions, SQL diagnostics or server internals.
 */
export type BookingErrorCode=
 "DEADLINE"|"SCHEDULE"|"VENUE"|"TALENT"|"MATCH"|"ANGLE"|"PROGRAMME"|"DIVISION"|"ORDER"|"TITLE"|"BUDGET"|"CONFIRMED";
const messages:Readonly<Record<BookingErrorCode,string>>={
 DEADLINE:"The booking deadline has passed. Your show is now read-only.",
 SCHEDULE:"This show conflicts with its calendar or an existing booking. Refresh Planner and review the week.",
 VENUE:"That venue or market is unavailable for this show. Choose another location or day.",
 TALENT:"One of your selected wrestlers is unavailable, out of dates or not eligible. Review the roster and booking card.",
 MATCH:"Review the match participants, format, finish and scripted winner before saving.",
 ANGLE:"Review this segment's performers, targets and required storyline choices.",
 PROGRAMME:"The linked rivalry or creative agreement is not eligible for this booking. Check Programme participants and permissions.",
 DIVISION:"This bout mixes men’s and women’s booking divisions. Choose opponents from the same division.",
 ORDER:"Your running order is incomplete or has conflicting slots. Check the order of matches and angles.",
 TITLE:"A championship match must use the correct division, include its reigning champion and book the title once.",
 BUDGET:"Your matches and angles exceed the 120-minute TV slot. Shorten a match or angle before saving.",
 CONFIRMED:"This card is already locked or no longer editable. Refresh Planner before changing its lineup."
};
export function bookingErrorMessage(code:unknown):string|null{
 return typeof code==="string"&&Object.prototype.hasOwnProperty.call(messages,code)?
  messages[code as BookingErrorCode]:null;
}
export function bookingErrorCode(message:string):BookingErrorCode|null{
 if(/World booking deadline passed|planning is closed|bookings? (?:are|is) closed|deadline.*passed|world lock.*closed/i.test(message))
  return "DEADLINE";
 if(/show must be planned|scheduled for the chosen week|already has a planned show|different show identity|too many weekly card drafts|weekly show and PPV|show type must match|show is no longer editable/i.test(message))
  return "SCHEDULE";
 if(/choose an available venue|venue.*market|venue.*not available|market.*not available|invalid venue|venue.*contested/i.test(message))
  return "VENUE";
 if(/wrestler.*unavailable|contract.*(?:dates|active|valid|expiry|expired|eligible|rights|lookup)|not enough.*(?:contract|dates)|exclusive elsewhere|appearance.*(?:rights|dates)|person.*inactive|lacks current contract rights|multiple contracts.*booked|incomplete contract lookup/i.test(message))
  return "TALENT";
 if(/mixed or missing booking division|same booking division/i.test(message))return "DIVISION";
 if(/running order|duplicate card slot|card slot capacity|incomplete segment running order|incomplete match card write|incomplete segment write|incomplete automatic rivalry match links|duplicate match slot/i.test(message))return "ORDER";
 if(/title.*(?:requires|champion|contested|division)|championship.*(?:requires|champion|division)/i.test(message))return "TITLE";
 if(/120.minutes|airtime|running.time|show.*duration|TV slot/i.test(message))return "BUDGET";
 if(/not an editable current.week draft|show is not editable|already confirmed/i.test(message))return "CONFIRMED";
 if(/match.*(?:participants|format|winner|finish|sides|booked|invalid)|invalid match|scripted winner|book at least one match|match card|one wrestler cannot be in two matches|wrestler may appear in only one match|unsupported scoring layout|missing match family|individual bout|invalid canonical.*layout/i.test(message))
  return "MATCH";
 if(/programme.*(?:rivalry|participants|link|active)|linked rivalry|creative consent|creative agreement|rivalry.*(?:participants|consent)/i.test(message))
  return "PROGRAMME";
 if(/angle|segment|stable before|faction|scripted angle|role capacity|authored segment|invalid segment|wrestler.*two roles|invalid.*role|invalid.*scene/i.test(message))
  return "ANGLE";
 return null;
}

/** Never expose raw SQL or exception text. Use a small, stable error vocabulary. */
export function cardActionDomain(method:string):
 "booking"|"kayfabe"|"legends"|"business"|"general"{
 if(["save","ready","load","talent","results","creativeConsent"].includes(method))
  return "booking";
 if(method.startsWith("kp")||method==="kpWorkspace")return "kayfabe";
 if(["legendsVault","legendSeen"].includes(method))return "legends";
 if(["business","signCommercial","previewRestructure","restructurePromotion"].includes(method))
  return "business";
 return "general";
}
export type DeskErrorCode="KP_BALANCE"|"ALREADY_OWNED"|"ART_PENDING"|"LEGEND_LOCKED";
export function deskErrorCode(message:string,method:string):DeskErrorCode|null{
 const domain=cardActionDomain(method);
 if(domain!=="kayfabe"&&domain!=="legends")return null;
 if(/not enough Kayfabe Points/i.test(message))return "KP_BALANCE";
 if(/already own.*(?:card|style)|already own this legend/i.test(message))return "ALREADY_OWNED";
 if(/artwork.*cleared|card is not yet available/i.test(message))return "ART_PENDING";
 if(/legend.*(?:enter your World|not unlocked)/i.test(message))return "LEGEND_LOCKED";
 return null;
}
export function deskErrorMessage(code:unknown):string|null{
 const map:Record<DeskErrorCode,string>={
  KP_BALANCE:"Not enough Kayfabe Points. Earn more from certified shows and try again.",
  ALREADY_OWNED:"You already own this collectible or style. Check your personal collection.",
  ART_PENDING:"This collectible is awaiting approved artwork and cannot be purchased yet.",
  LEGEND_LOCKED:"This legend has not entered the shared World yet. Check the Vault clues."
 };
 return typeof code==="string"&&Object.prototype.hasOwnProperty.call(map,code)?
  map[code as DeskErrorCode]:null;
}
export function actionStatusMessage(method:string,status:number):string{
 const domain=cardActionDomain(method);
 const subject=domain==="kayfabe"?"Kayfabe Points":
  domain==="legends"?"Legends Vault":
  domain==="business"?"Business office":
  domain==="booking"?"Booking":"This action";
 if(status===401)return "Please sign in again.";
 if(status===403)return "Your session cannot perform this action. Refresh and sign in again.";
 if(status===409)return "The World has changed. Refresh this screen before trying again.";
 if(status===429)return "Too many requests. Try again shortly.";
 if(status>=500)return subject+" is temporarily unavailable. Please try again.";
 return domain==="booking"?"Booking request failed. Review the card and try again.":
  subject+" request could not be completed. Review the selection and try again.";
}
