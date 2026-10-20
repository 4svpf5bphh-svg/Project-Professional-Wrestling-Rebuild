/** Stable, non-sensitive corrections for rejected booking actions.
 * Do not return arbitrary exception strings to a browser: they may include
 * contract values, private promotions, SQL diagnostics or server internals.
 */
export type BookingErrorCode=
 "DEADLINE"|"SCHEDULE"|"VENUE"|"TALENT"|"MATCH"|"ANGLE"|"PROGRAMME";
const messages:Readonly<Record<BookingErrorCode,string>>={
 DEADLINE:"The booking deadline has passed. Your show is now read-only.",
 SCHEDULE:"This show conflicts with its calendar or an existing booking. Refresh Planner and review the week.",
 VENUE:"That venue or market is unavailable for this show. Choose another location or day.",
 TALENT:"One of your selected wrestlers is unavailable, out of dates or not eligible. Review the roster and booking card.",
 MATCH:"Review the match participants, format, finish and scripted winner before saving.",
 ANGLE:"Review this segment's performers, targets and required storyline choices.",
 PROGRAMME:"Review the linked rivalry and any required creative agreements before saving."
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
 if(/wrestler.*unavailable|contract.*(?:dates|active|valid|expiry|expired|eligible)|not enough.*(?:contract|dates)|exclusive elsewhere|appearance.*(?:rights|dates)|person.*inactive/i.test(message))
  return "TALENT";
 if(/match.*(?:participants|format|winner|finish|sides|booked|invalid)|invalid match|scripted winner|book at least one match|match card|one wrestler cannot be in two matches/i.test(message))
  return "MATCH";
 if(/angle.*(?:actors|target|performers|invalid)|segment.*(?:target|actor|performers|invalid)|this angle has no target role/i.test(message))
  return "ANGLE";
 if(/programme.*(?:rivalry|participants|link|active)|linked rivalry|creative consent|creative agreement|rivalry.*(?:participants|consent)/i.test(message))
  return "PROGRAMME";
 return null;
}
