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
 if(/wrestler.*unavailable|contract.*(?:dates|active|valid|expiry|expired|eligible|rights)|not enough.*(?:contract|dates)|exclusive elsewhere|appearance.*(?:rights|dates)|person.*inactive|lacks current contract rights/i.test(message))
  return "TALENT";
 if(/mixed or missing booking division|same booking division/i.test(message))return "DIVISION";
 if(/running order|duplicate card slot|card slot capacity|incomplete segment running order/i.test(message))return "ORDER";
 if(/title.*(?:requires|champion|contested|division)|championship.*(?:requires|champion|division)/i.test(message))return "TITLE";
 if(/120.minutes|airtime|running.time|show.*duration|TV slot/i.test(message))return "BUDGET";
 if(/not an editable current.week draft|show is not editable|already confirmed/i.test(message))return "CONFIRMED";
 if(/match.*(?:participants|format|winner|finish|sides|booked|invalid)|invalid match|scripted winner|book at least one match|match card|one wrestler cannot be in two matches/i.test(message))
  return "MATCH";
 if(/angle|segment|stable before|faction|scripted angle|role capacity|authored segment|invalid segment|wrestler.*two roles/i.test(message))
  return "ANGLE";
 if(/programme.*(?:rivalry|participants|link|active)|linked rivalry|creative consent|creative agreement|rivalry.*(?:participants|consent)/i.test(message))
  return "PROGRAMME";
 return null;
}
